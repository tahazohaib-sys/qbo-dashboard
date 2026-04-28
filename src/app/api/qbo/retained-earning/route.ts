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

    /* -------- Investments (period movement — dynamic discovery) -------- */

    // All Data rows in the Shareholders' equity section of the end balance sheet
    const equityEndRows = endRows.filter(
      (r) => r.type === "Data" && r.path.toLowerCase().includes("equity")
    );

    function findPriorByLabel(label: string): FlatRow | undefined {
      const n = norm(label);
      // Exact normalised match
      const exact = priorRows.find((r) => norm(r.label) === n);
      if (exact) return exact;
      // Fallback: same equity section + same keyword category + common 8-char prefix
      // Handles minor spelling variants (e.g. "Stratger" vs "Strateger") if label was corrected mid-period
      const prefix = n.slice(0, 8);
      return priorRows.find(
        (r) =>
          r.type === "Data" &&
          r.path.toLowerCase().includes("equity") &&
          norm(r.label).startsWith(prefix)
      );
    }

    type InvItem = { label: string; amount: number; type: "investment" | "contribution" };

    // Contribution rows first (more specific keyword) so investment filter can exclude them
    // Match both "received" and the common "recieved" typo found in QBO data
    const contributionItems: InvItem[] = equityEndRows
      .filter((r) => {
        const l = r.label.toLowerCase();
        return l.includes("contribution received") || l.includes("contribution recieved");
      })
      .map((r) => {
        const endVal = getVal(r);
        const priorRow = findPriorByLabel(r.label);
        const priorValue = priorRow ? toNum(priorRow.cols?.[1]?.value) : 0;
        return { label: r.label, amount: Math.max(0, endVal - priorValue), type: "contribution" as const };
      });

    const contributionLabels = new Set(contributionItems.map((x) => x.label));

    const investmentItems: InvItem[] = equityEndRows
      .filter(
        (r) =>
          r.label.toLowerCase().includes("investment") &&
          !contributionLabels.has(r.label)
      )
      .map((r) => {
        const endVal = getVal(r);
        const priorRow = findPriorByLabel(r.label);
        const priorValue = priorRow ? toNum(priorRow.cols?.[1]?.value) : 0;
        return { label: r.label, amount: Math.abs(endVal - priorValue), type: "investment" as const };
      });

    const allInvItems: InvItem[] = [...investmentItems, ...contributionItems];

    const totalInvestments = investmentItems.reduce((s, x) => s + x.amount, 0);
    const contribution = contributionItems.reduce((s, x) => s + x.amount, 0);
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
        items: allInvItems,
        contribution,
        totalInvestments,
        netInvestments,
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
