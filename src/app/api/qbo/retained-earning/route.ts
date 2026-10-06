import { NextResponse } from "next/server";
import { qboFetch } from "@/lib/metrics";
import {
  buildInsights,
  buildVerdict,
  computeComponents,
  computeRatios,
  flattenRows,
  netIncomeRow,
  toNum,
  type FlatRow,
  type MonthPoint,
  type PeriodSummary,
} from "@/lib/retained-earning";

export const dynamic = "force-dynamic";

const MAX_MONTHS = 24;
const BATCH = 4;
const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/* ---------------- dates ---------------- */

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

/** Month windows inside [start, end], each clipped to the range. */
function monthWindows(start: string, end: string) {
  const [sy, sm] = start.split("-").map(Number);
  const [ey, em] = end.split("-").map(Number);
  const out: Array<{ key: string; label: string; start: string; end: string }> = [];
  for (let i = sy * 12 + sm - 1; i <= ey * 12 + em - 1; i++) {
    const y = Math.floor(i / 12);
    const m = (i % 12) + 1;
    const mm = String(m).padStart(2, "0");
    const mStart = `${y}-${mm}-01`;
    const mEnd = ymd(new Date(y, m, 0));
    out.push({
      key: `${y}-${mm}`,
      label: `${MONTH_LABELS[m - 1]} ${y}`,
      start: mStart < start ? start : mStart,
      end: mEnd > end ? end : mEnd,
    });
  }
  return out;
}

/** Previous period with the same number of calendar months, ending the day before start. */
function previousPeriod(start: string, months: number) {
  const [y, m] = start.split("-").map(Number);
  const prevStart = ymd(new Date(y, m - 1 - months, 1));
  return { start: prevStart, end: dayBefore(start) };
}

/* ---------------- QBO fetchers ---------------- */

/** Balance Sheet snapshot as the QBO UI shows it: start_date = end_date = asOf. */
async function fetchBalanceSheetRows(asOf: string, method: string): Promise<FlatRow[]> {
  const rep = await qboFetch(
    `reports/BalanceSheet?start_date=${encodeURIComponent(asOf)}` +
      `&end_date=${encodeURIComponent(asOf)}` +
      `&accounting_method=${encodeURIComponent(method)}` +
      `&summarize_column_by=Total`
  );
  return flattenRows(rep?.Rows);
}

async function fetchNetProfit(start: string, end: string, method: string): Promise<number> {
  const pnl = await qboFetch(
    `reports/ProfitAndLoss?start_date=${encodeURIComponent(start)}` +
      `&end_date=${encodeURIComponent(end)}` +
      `&accounting_method=${encodeURIComponent(method)}`
  );
  const row = netIncomeRow(flattenRows(pnl?.Rows));
  return row ? toNum(row.cols?.[1]?.value) : 0;
}

/** Net profit per month (key YYYY-MM) from one P&L summarized by month. */
async function fetchMonthlyNetProfit(start: string, end: string, method: string): Promise<Map<string, number>> {
  const pnl = await qboFetch(
    `reports/ProfitAndLoss?start_date=${encodeURIComponent(start)}` +
      `&end_date=${encodeURIComponent(end)}` +
      `&accounting_method=${encodeURIComponent(method)}` +
      `&summarize_column_by=Month`
  );
  const cols: any[] = Array.isArray(pnl?.Columns?.Column) ? pnl.Columns.Column : [];
  const monthOfCol = cols.map((c) => {
    const meta = Array.isArray(c?.MetaData) ? c.MetaData : [];
    const sd = meta.find((x: any) => x?.Name === "StartDate")?.Value;
    return typeof sd === "string" && /^\d{4}-\d{2}/.test(sd) ? sd.slice(0, 7) : null;
  });
  const row = netIncomeRow(flattenRows(pnl?.Rows));
  const out = new Map<string, number>();
  if (!row) return out;
  row.cols.forEach((cell: any, i: number) => {
    const key = monthOfCol[i];
    if (key) out.set(key, (out.get(key) ?? 0) + toNum(cell?.value));
  });
  return out;
}

async function inBatches<T, R>(items: T[], fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += BATCH) {
    out.push(...(await Promise.all(items.slice(i, i + BATCH).map(fn))));
  }
  return out;
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
    const windows = monthWindows(start, end).slice(-MAX_MONTHS);
    const prev = previousPeriod(start, monthWindows(start, end).length);

    // Period snapshots + P&L (same calculation as before)
    const [endRows, priorRows, netProfit] = await Promise.all([
      fetchBalanceSheetRows(end, method),
      fetchBalanceSheetRows(prior, method),
      fetchNetProfit(start, end, method),
    ]);
    const c = computeComponents(endRows, priorRows, netProfit);

    /* -------- Monthly breakdown (best effort) -------- */
    let monthly: MonthPoint[] = [];
    try {
      const firstPrior = dayBefore(windows[0].start);
      const snapshotDates = Array.from(new Set([firstPrior, ...windows.map((w) => w.end)]));
      const known = new Map<string, FlatRow[]>([
        [prior, priorRows],
        [end, endRows],
      ]);
      const toFetch = snapshotDates.filter((d) => !known.has(d));
      const fetched = await inBatches(toFetch, (d) => fetchBalanceSheetRows(d, method));
      toFetch.forEach((d, i) => known.set(d, fetched[i]));

      const profitByMonth = await fetchMonthlyNetProfit(windows[0].start, end, method);

      let cumulative = 0;
      monthly = windows.map((w) => {
        const mc = computeComponents(known.get(w.end)!, known.get(dayBefore(w.start))!, profitByMonth.get(w.key) ?? 0);
        cumulative += mc.retainedEarning;
        return {
          month: w.key,
          label: w.label,
          netProfit: mc.netProfit,
          assets: mc.longTermAssetsMovement,
          netInvestments: mc.netInvestments,
          retained: mc.retainedEarning,
          cumulativeRetained: cumulative,
        };
      });
    } catch {
      monthly = [];
    }

    /* -------- Previous period (best effort) -------- */
    let previous: PeriodSummary | null = null;
    try {
      const [prevPriorRows, prevProfit] = await Promise.all([
        fetchBalanceSheetRows(dayBefore(prev.start), method),
        fetchNetProfit(prev.start, prev.end, method),
      ]);
      const pc = computeComponents(priorRows, prevPriorRows, prevProfit);
      previous = {
        start: prev.start,
        end: prev.end,
        netProfit: pc.netProfit,
        longTermAssetsMovement: pc.longTermAssetsMovement,
        netInvestments: pc.netInvestments,
        retainedEarning: pc.retainedEarning,
      };
    } catch {
      previous = null;
    }

    const ratios = computeRatios(c, monthly);
    const verdict = buildVerdict(c, ratios);
    const insights = buildInsights(c, ratios, monthly, previous);

    const charts = {
      investmentBars: [
        { name: "Investments", value: c.totalInvestments },
        { name: "Contribution Received", value: c.contribution },
      ],
      retainedDonut: [
        { name: "Long-term Assets", value: Math.max(0, c.longTermAssetsMovement) },
        { name: "Net Investments", value: Math.max(0, c.netInvestments) },
        { name: "Retained Earning", value: Math.max(0, c.retainedEarning) },
      ],
    };

    return NextResponse.json({
      ok: true,
      currency: "PKR",
      start_date: start,
      end_date: end,
      prior_as_of_date: prior,
      accounting_method: method,

      netProfit: c.netProfit,

      longTermAssetsMovement: c.longTermAssetsMovement,
      longTermAssets: {
        end: c.ltEnd,
        prior: c.ltPrior,
        method: "BalanceSheet snapshot: end - day_before_start",
        detail: c.ltDetail,
      },

      investments: {
        items: c.items,
        contribution: c.contribution,
        totalInvestments: c.totalInvestments,
        netInvestments: c.netInvestments,
      },

      retainedEarning: c.retainedEarning,
      charts,

      monthly,
      previous,
      ratios,
      verdict,
      insights,

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
