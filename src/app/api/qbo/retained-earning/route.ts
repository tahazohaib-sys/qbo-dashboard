import { NextResponse } from "next/server";
import { qboFetch } from "@/lib/metrics";

export const dynamic = "force-dynamic";

/* ---------------- helpers ---------------- */

function toNum(v: any): number {
  if (v == null || v === "" || v === "-") return 0;
  const n = Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function ymd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function dayBefore(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() - 1);
  return ymd(d);
}

function norm(s: any) {
  return String(s ?? "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[-_]/g, "");
}

/**
 * Flattens ALL useful rows.
 * - Data rows: r.ColData
 * - Section rows sometimes contain Summary.ColData (important for totals)
 */
type FlatRow = { path: string; label: string; cols: any[]; type: string };

function flattenRows(rows: any, path: string[] = [], out: FlatRow[] = []) {
  if (!rows?.Row) return out;

  for (const r of rows.Row) {
    const type = r.type;

    if (type === "Section") {
      const headerLabel = r.Header?.ColData?.[0]?.value ?? "";
      const nextPath = headerLabel ? [...path, headerLabel] : [...path];

      // Some reports put totals in Summary.ColData (we capture it too)
      if (r.Summary?.ColData?.length) {
        out.push({
          path: nextPath.join(" > "),
          label: r.Summary?.ColData?.[0]?.value ?? `Total ${headerLabel}`,
          cols: r.Summary?.ColData,
          type: "Summary",
        });
      }

      flattenRows(r.Rows, nextPath, out);
      continue;
    }

    // "Data" row
    if (r.ColData?.length) {
      out.push({
        path: path.join(" > "),
        label: r.ColData?.[0]?.value ?? "",
        cols: r.ColData,
        type: "Data",
      });
    }
  }

  return out;
}

function pickTotalValue(report: any) {
  // Most "Total Only" reports have amount in ColData[1]
  // ColData[0] is label, ColData[1] is numeric
  return (row: FlatRow) => toNum(row.cols?.[1]?.value);
}

function findRowByLabel(rows: FlatRow[], labels: string[]) {
  const labelSet = labels.map(norm);
  return rows.find((r) => labelSet.includes(norm(r.label)));
}

/* ---------------- QBO fetchers ---------------- */

/**
 * Snapshot Balance Sheet exactly like QBO UI:
 * start_date=end_date=asOf and summarize_column_by=Total
 */
async function fetchBalanceSheetSnapshot(asOf: string, accounting_method: string) {
  return qboFetch(
    `reports/BalanceSheet?start_date=${encodeURIComponent(asOf)}` +
      `&end_date=${encodeURIComponent(asOf)}` +
      `&accounting_method=${encodeURIComponent(accounting_method)}` +
      `&summarize_column_by=Total`
  );
}

async function fetchProfitAndLoss(start: string, end: string, accounting_method: string) {
  return qboFetch(
    `reports/ProfitAndLoss?start_date=${encodeURIComponent(start)}` +
      `&end_date=${encodeURIComponent(end)}` +
      `&accounting_method=${encodeURIComponent(accounting_method)}`
  );
}

/* ---------------- API ---------------- */

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    const start = searchParams.get("start_date");
    const end = searchParams.get("end_date");
    const method = (searchParams.get("accounting_method") ?? "Accrual") as "Accrual" | "Cash";

    if (!start || !end) {
      return NextResponse.json({ ok: false, error: "Missing start_date or end_date" }, { status: 400 });
    }

    const prior = dayBefore(start);

    // Fetch snapshots
    const [bsEnd, bsPrior] = await Promise.all([
      fetchBalanceSheetSnapshot(end, method),
      fetchBalanceSheetSnapshot(prior, method),
    ]);

    const endRows = flattenRows(bsEnd?.Rows);
    const priorRows = flattenRows(bsPrior?.Rows);

    const getVal = pickTotalValue(bsEnd);

    /* -------- Long-term Assets (Laptop/LED/Vehicle) -------- */
    // Match exactly what you have in QBO UI
    const LT_LABELS = ["Laptop", "LED", "Vehicle RTC League"];

    const ltDetail = LT_LABELS.map((label) => {
      const endRow = findRowByLabel(endRows, [label]);
      const priorRow = findRowByLabel(priorRows, [label]);
      const endVal = endRow ? getVal(endRow) : 0;
      const priorVal = priorRow ? getVal(priorRow) : 0;
      return {
        label,
        end: endVal,
        prior: priorVal,
        movement: endVal - priorVal,
      };
    }).filter((x) => x.end !== 0 || x.prior !== 0 || x.movement !== 0);

    const ltEnd = ltDetail.reduce((s, x) => s + x.end, 0);
    const ltPrior = ltDetail.reduce((s, x) => s + x.prior, 0);
    const longTermAssetsMovement = ltEnd - ltPrior;

    /* -------- Investments (period movement) -------- */
    // Your QBO labels (including misspellings)
    const invLabelMap = {
      buraq: ["Buraq AI Investment"],
      convoi: ["Convoi AI Investment"],
      stratger: ["Stratger AI Investment", "Strateger AI Investment", "Strateg AI Investment"],
      contribution: ["Strategr AI Contribution Received", "Stratger AI Contribution Received", "Strateger AI Contribution Received"],
    };

    function bal(rows: FlatRow[], keys: keyof typeof invLabelMap) {
      const r = findRowByLabel(rows, invLabelMap[keys]);
      return r ? getVal(r) : 0;
    }

    const buraqEnd = bal(endRows, "buraq");
    const buraqPrior = bal(priorRows, "buraq");
    const convoiEnd = bal(endRows, "convoi");
    const convoiPrior = bal(priorRows, "convoi");
    const stratEnd = bal(endRows, "stratger");
    const stratPrior = bal(priorRows, "stratger");
    const contribEnd = bal(endRows, "contribution");
    const contribPrior = bal(priorRows, "contribution");

    // movement = end - prior (balances are negative in equity)
    const buraqMove = buraqEnd - buraqPrior;
    const convoiMove = convoiEnd - convoiPrior;
    const stratMove = stratEnd - stratPrior;
    const contribMove = contribEnd - contribPrior;

    // Spend shown as positive movement magnitude
    const buraq = Math.abs(buraqMove);
    const convoi = Math.abs(convoiMove);
    const stratger = Math.abs(stratMove);
    const contribution = Math.max(0, contribMove); // contribution increases equity positive

    const totalInvestments = buraq + convoi + stratger;
    const netInvestments = totalInvestments - contribution;

    /* -------- Net Profit (P&L) -------- */
    const pnl = await fetchProfitAndLoss(start, end, method);
    const pnlRows = flattenRows(pnl?.Rows);

    const netRow =
      findRowByLabel(pnlRows, ["Net Income"]) ||
      findRowByLabel(pnlRows, ["Net earnings", "Net Earnings"]) ||
      pnlRows.find((r) => norm(r.label).includes("netincome")) ||
      pnlRows.find((r) => norm(r.label).includes("netearnings"));

    const netProfit = netRow ? toNum(netRow.cols?.[1]?.value) : 0;

    /* -------- Retained Earning -------- */
    const retainedEarning = netProfit - longTermAssetsMovement - netInvestments;

    /* -------- Charts -------- */
    const charts = {
      investmentBars: [
        { name: "Investments", value: totalInvestments },
        { name: "Contribution Received", value: contribution },
      ],
      retainedDonut: [
        { name: "Long-term Assets", value: Math.max(0, longTermAssetsMovement) },
        { name: "Net Investments", value: Math.max(0, netInvestments) },
        { name: "Retained Earning", value: Math.max(0, retainedEarning) },
      ],
    };

    return NextResponse.json({
      ok: true,
      currency: "PKR",
      start_date: start,
      end_date: end,
      prior_as_of_date: prior,
      accounting_method: method,

      netProfit,

      longTermAssetsMovement,
      longTermAssets: {
        end: ltEnd,
        prior: ltPrior,
        method: "BalanceSheet snapshot: end - day_before_start",
        detail: ltDetail,
      },

      investments: {
        buraq,
        convoi,
        stratger,
        contribution,
        totalInvestments,
        netInvestments,
        period: {
          buraq,
          convoi,
          stratger,
          contribution,
          totalInvestments,
          netInvestments,
        },
        debugBalances: {
          end: { buraq: buraqEnd, convoi: convoiEnd, strateger: stratEnd, contribution: contribEnd },
          prior: { buraq: buraqPrior, convoi: convoiPrior, strateger: stratPrior, contribution: contribPrior },
          movement: { buraqMove, convoiMove, strategerMove: stratMove, contribMove },
        },
      },

      retainedEarning,
      charts,

      debug: {
        balanceSheetAsOf: end,
        balanceSheetPriorAsOf: prior,
        note: "Snapshot-based computation matches QBO UI Balance Sheet.",
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}
