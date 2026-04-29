export type AccountingMethod = "Accrual" | "Cash";

export type DashboardSeriesPoint = {
  month: string;
  revenue: number;
  expenses: number;
  profit: number;
};

export type ExpenseCategoryPoint = {
  name: string;
  total: number;
  startValue: number;
  endValue: number;
  growth: number | null;
  absoluteGrowth: number;
};

export type TrendLabel = "Increasing" | "Decreasing" | "Stable" | "Volatile";

export function safeNumber(input: unknown): number {
  const n = Number(input);
  return Number.isFinite(n) ? n : 0;
}

export function formatCurrency(currency: string, value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  const decimals = currency === "PKR" ? 0 : 2;
  return `${sign}${currency} ${new Intl.NumberFormat("en", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(abs)}`;
}

export function formatPercent(ratio: number | null, digits = 1): string {
  if (ratio == null || !Number.isFinite(ratio)) return "N/A";
  return `${(ratio * 100).toFixed(digits)}%`;
}

export function safeGrowth(first: number, last: number): number | null {
  if (!Number.isFinite(first) || !Number.isFinite(last) || first === 0) return null;
  return (last - first) / Math.abs(first);
}

export function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  if (!y || !m) return ym;
  return new Date(y, m - 1, 1).toLocaleString("en-US", { month: "short", year: "numeric" });
}

export function formatDateRange(startDate: string, endDate: string): string {
  const s = new Date(`${startDate}T00:00:00`);
  const e = new Date(`${endDate}T00:00:00`);
  return `${s.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} - ${e.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })}`;
}

export function classifyTrend(values: number[]): TrendLabel {
  if (values.length < 3) return "Stable";
  const changes: number[] = [];
  for (let i = 1; i < values.length; i += 1) changes.push(values[i] - values[i - 1]);
  const positive = changes.filter((c) => c > 0).length;
  const negative = changes.filter((c) => c < 0).length;
  const avgAbs = changes.reduce((sum, c) => sum + Math.abs(c), 0) / Math.max(changes.length, 1);
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;

  if (mean !== 0 && avgAbs / Math.abs(mean) > 0.2 && positive > 0 && negative > 0) return "Volatile";
  if (positive >= changes.length * 0.75) return "Increasing";
  if (negative >= changes.length * 0.75) return "Decreasing";
  return "Stable";
}

export function pickHighLowMonth(series: DashboardSeriesPoint[], key: "revenue" | "expenses" | "profit") {
  if (!series.length) return { high: null, low: null } as const;
  let high = series[0];
  let low = series[0];
  for (const row of series) {
    if (row[key] > high[key]) high = row;
    if (row[key] < low[key]) low = row;
  }
  return { high, low } as const;
}

export function aggregateTotals(series: DashboardSeriesPoint[]) {
  return series.reduce(
    (acc, row) => {
      acc.revenue += safeNumber(row.revenue);
      acc.expenses += safeNumber(row.expenses);
      acc.profit += safeNumber(row.profit);
      return acc;
    },
    { revenue: 0, expenses: 0, profit: 0 }
  );
}

export function avg(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((s, n) => s + n, 0) / values.length;
}

export function parseExpenseCategories(rows: Array<{ path: string; rowType: string; label: string; amount: number }>): ExpenseCategoryPoint[] {
  const map = new Map<string, { total: number; byMonth: number[] }>();
  for (const row of rows) {
    if (row.rowType !== "Data") continue;
    if (!row.path.startsWith("P&L > Expenses") && !row.path.startsWith("P&L > Other Expenses")) continue;
    const existing = map.get(row.label) ?? { total: 0, byMonth: [] };
    existing.total += safeNumber(row.amount);
    existing.byMonth.push(safeNumber(row.amount));
    map.set(row.label, existing);
  }

  return Array.from(map.entries())
    .map(([name, values]) => {
      const startValue = values.byMonth[0] ?? 0;
      const endValue = values.byMonth[values.byMonth.length - 1] ?? 0;
      return {
        name,
        total: values.total,
        startValue,
        endValue,
        growth: safeGrowth(startValue, endValue),
        absoluteGrowth: endValue - startValue,
      };
    })
    .sort((a, b) => b.total - a.total);
}

export function buildExecutiveNarrative(input: {
  trend: TrendLabel;
  totals: { revenue: number; expenses: number; profit: number };
  margin: number | null;
  strongestRevenueMonth: DashboardSeriesPoint | null;
  weakestRevenueMonth: DashboardSeriesPoint | null;
  strongestProfitMonth: DashboardSeriesPoint | null;
  weakestProfitMonth: DashboardSeriesPoint | null;
}): string {
  const { trend, totals, margin, strongestRevenueMonth, weakestRevenueMonth, strongestProfitMonth, weakestProfitMonth } = input;
  const marginText = margin == null ? "margin could not be computed because revenue was zero" : `net margin closed at ${formatPercent(margin)}`;

  return `Across the selected period, revenue totaled ${totals.revenue.toFixed(0)} against expenses of ${totals.expenses.toFixed(
    0
  )}, resulting in net ${totals.profit >= 0 ? "profit" : "loss"} of ${Math.abs(totals.profit).toFixed(
    0
  )}. Overall operating pattern is ${trend.toLowerCase()} and ${marginText}. The strongest revenue month was ${
    strongestRevenueMonth ? monthLabel(strongestRevenueMonth.month) : "not available"
  }, while the weakest was ${weakestRevenueMonth ? monthLabel(weakestRevenueMonth.month) : "not available"}. Profit quality peaked in ${
    strongestProfitMonth ? monthLabel(strongestProfitMonth.month) : "not available"
  } and was softest in ${weakestProfitMonth ? monthLabel(weakestProfitMonth.month) : "not available"}.`;
}

export function buildClosingNotes(input: {
  trend: TrendLabel;
  margin: number | null;
  revenueGrowth: number | null;
  expenseGrowth: number | null;
  avgRevenue: number;
  breakEven: number;
}): string[] {
  const notes: string[] = [];
  if (input.margin != null && input.margin > 0.15) notes.push("Profitability is healthy with double-digit net margin performance.");
  if (input.expenseGrowth != null && input.revenueGrowth != null && input.expenseGrowth > input.revenueGrowth) {
    notes.push("Cost growth is outpacing revenue growth, indicating margin pressure risk.");
  }
  if (input.avgRevenue < input.breakEven) notes.push("Average revenue remains below break-even requirement; corrective commercial actions are needed.");
  if (input.trend === "Volatile") notes.push("Revenue trajectory is volatile; planning assumptions should include downside buffers.");
  if (!notes.length) notes.push("Performance remained broadly stable with no severe structural warning signal in the selected window.");
  return notes;
}

export type FinancialReportAnalysis = {
  totals: { revenue: number; expenses: number; profit: number };
  margin: number | null;
  revenueTrend: TrendLabel;
  expenseTrend: TrendLabel;
  profitTrend: TrendLabel;
  revenueHigh: DashboardSeriesPoint | null;
  revenueLow: DashboardSeriesPoint | null;
  expenseHigh: DashboardSeriesPoint | null;
  expenseLow: DashboardSeriesPoint | null;
  profitHigh: DashboardSeriesPoint | null;
  profitLow: DashboardSeriesPoint | null;
  avgRevenue: number;
  avgExpenses: number;
  avgProfit: number;
  revenueGrowth: number | null;
  expenseGrowth: number | null;
  profitGrowth: number | null;
  topExpenseCategories: ExpenseCategoryPoint[];
  fastestGrowingExpenseCategories: ExpenseCategoryPoint[];
};

export function analyzeFinancials(series: DashboardSeriesPoint[], pnlRows: Array<{ path: string; rowType: string; label: string; amount: number }>): FinancialReportAnalysis {
  const totals = aggregateTotals(series);
  const revenueValues = series.map((p) => safeNumber(p.revenue));
  const expenseValues = series.map((p) => safeNumber(p.expenses));
  const profitValues = series.map((p) => safeNumber(p.profit));
  const revenueRange = pickHighLowMonth(series, "revenue");
  const expenseRange = pickHighLowMonth(series, "expenses");
  const profitRange = pickHighLowMonth(series, "profit");

  const categories = parseExpenseCategories(pnlRows);
  const fastestGrowingExpenseCategories = [...categories]
    .filter((x) => x.absoluteGrowth > 0)
    .sort((a, b) => b.absoluteGrowth - a.absoluteGrowth)
    .slice(0, 5);

  return {
    totals,
    margin: totals.revenue === 0 ? null : totals.profit / totals.revenue,
    revenueTrend: classifyTrend(revenueValues),
    expenseTrend: classifyTrend(expenseValues),
    profitTrend: classifyTrend(profitValues),
    revenueHigh: revenueRange.high,
    revenueLow: revenueRange.low,
    expenseHigh: expenseRange.high,
    expenseLow: expenseRange.low,
    profitHigh: profitRange.high,
    profitLow: profitRange.low,
    avgRevenue: avg(revenueValues),
    avgExpenses: avg(expenseValues),
    avgProfit: avg(profitValues),
    revenueGrowth: safeGrowth(revenueValues[0] ?? 0, revenueValues[revenueValues.length - 1] ?? 0),
    expenseGrowth: safeGrowth(expenseValues[0] ?? 0, expenseValues[expenseValues.length - 1] ?? 0),
    profitGrowth: safeGrowth(profitValues[0] ?? 0, profitValues[profitValues.length - 1] ?? 0),
    topExpenseCategories: categories.slice(0, 8),
    fastestGrowingExpenseCategories,
  };
}
