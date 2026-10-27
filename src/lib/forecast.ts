/**
 * Financial forecast engine (pure functions, runs in the browser).
 *
 * The forecast is a pro-forma Profit & Loss, built line by line from the
 * preceding complete months (the base period):
 *
 *   Revenue                 projected from its own history (trend, growth or average)
 *   Cost of sales           revenue x historical cost-of-sales ratio (variable cost)
 *   Operating expenses      projected from their own history (mostly fixed cost)
 *   Other income / expenses historical monthly average (non-operating)
 *   Net profit              revenue - cost of sales - operating expenses + other net
 *   Closing cash            opening bank balance + net profit (approximation)
 *
 * "Auto" tests each method on the last months of the base period (holdout
 * backtest) and keeps the most accurate one for each line.
 */

/* ---------------- types ---------------- */

export type HistoryMonth = {
  month: string; // YYYY-MM
  revenue: number;
  cogs: number;
  opex: number;
  otherIncome: number;
  otherExpenses: number;
  netProfit: number;
};

export type Method = "auto" | "trend" | "growth" | "average";
export type FittedMethod = Exclude<Method, "auto">;
export type Scenario = "pessimistic" | "base" | "optimistic";

export type ForecastOptions = {
  horizon: number;
  method: Method;
  seasonality: boolean;
  scenario: Scenario;
  revenueChangePct: number; // 0.1 = +10 % on every forecast month
  opexChangePct: number;
};

export type ForecastMonth = {
  month: string;
  revenue: number;
  revenueLow: number;
  revenueHigh: number;
  cogs: number;
  grossProfit: number;
  opex: number;
  operatingProfit: number;
  otherNet: number;
  netProfit: number;
  netMargin: number | null;
  cumulativeProfit: number;
  closingCash: number | null;
};

export type LineModel = {
  method: FittedMethod;
  monthlyGrowth: number;
  accuracy: number | null; // 1 - WAPE on the holdout months
  seasonal: boolean;
};

export type Insight = { tone: "good" | "watch" | "risk" | "info"; title: string; text: string };

export type ForecastResult = {
  months: ForecastMonth[];
  totals: {
    revenue: number;
    cogs: number;
    grossProfit: number;
    opex: number;
    operatingProfit: number;
    otherNet: number;
    netProfit: number;
    netMargin: number | null;
  };
  actualAverage: {
    months: number;
    revenue: number;
    cogs: number;
    grossProfit: number;
    opex: number;
    operatingProfit: number;
    otherNet: number;
    netProfit: number;
  };
  revenueChangeVsActual: number | null;
  assumptions: {
    baseMonths: number;
    firstMonth: string;
    lastMonth: string;
    revenue: LineModel;
    opex: LineModel;
    cogsRatio: number;
    otherNetAvg: number;
    seasonalityAvailable: boolean;
  };
  breakEven: { monthlyRevenue: number | null; marginOfSafety: number | null };
  cash: {
    opening: number | null;
    closing: number | null;
    lowest: number | null;
    lowestMonth: string | null;
    runOutMonth: string | null;
    monthsOfCash: number | null;
  };
  lossMonths: number;
  insights: Insight[];
};

/* ---------------- constants ---------------- */

export const MIN_BASE_MONTHS = 3;
export const SEASONAL_MIN_MONTHS = 24;
const HOLDOUT_MONTHS = 3;
const MAX_MONTHLY_GROWTH = 0.1; // growth method: at most +/-10 % a month
const Z80 = 1.2816; // 80 % range

export const METHOD_LABEL: Record<FittedMethod, string> = {
  trend: "Linear trend",
  growth: "Average growth rate",
  average: "Recent 3-month average",
};

/* ---------------- format helpers (shared with the panel) ---------------- */

const SYMBOLS: Record<string, string> = { PKR: "Rs", USD: "$", EUR: "€", GBP: "£" };

export function currencySymbol(currency: string) {
  return SYMBOLS[currency] ?? currency;
}

/** Compact money: Rs 1.25M, Rs 850K, Rs 900. */
export function fmtMoney(n: number, currency = "PKR") {
  const sym = currencySymbol(currency);
  const sign = n < 0 ? "-" : "";
  const a = Math.abs(n);
  if (a >= 1_000_000_000) return `${sign}${sym} ${(a / 1_000_000_000).toFixed(2)}B`;
  if (a >= 1_000_000) return `${sign}${sym} ${(a / 1_000_000).toFixed(a >= 10_000_000 ? 1 : 2)}M`;
  if (a >= 1_000) return `${sign}${sym} ${Math.round(a / 1_000).toLocaleString("en")}K`;
  return `${sign}${sym} ${Math.round(a).toLocaleString("en")}`;
}

export function fmtPct(n: number | null, digits = 1) {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${(n * 100).toFixed(digits)}%`;
}

export function fmtSignedPct(n: number | null, digits = 1) {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${n > 0 ? "+" : ""}${(n * 100).toFixed(digits)}%`;
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-10" -> "Oct 2026" */
export function monthLabel(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return y && m ? `${MONTH_NAMES[m - 1]} ${y}` : ym;
}

export function addMonths(ym: string, add: number) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + add, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/* ---------------- statistics ---------------- */

const sum = (a: number[]) => a.reduce((s, x) => s + x, 0);
const mean = (a: number[]) => (a.length ? sum(a) / a.length : 0);
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

/** Least-squares line through y over x = 0..n-1. */
function ols(y: number[]) {
  const n = y.length;
  const xbar = (n - 1) / 2;
  const ybar = mean(y);
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    sxx += (i - xbar) ** 2;
    sxy += (i - xbar) * (y[i] - ybar);
  }
  const slope = sxx > 0 ? sxy / sxx : 0;
  const intercept = ybar - slope * xbar;
  const fitted = y.map((_, i) => intercept + slope * i);
  const sse = sum(y.map((v, i) => (v - fitted[i]) ** 2));
  const se = n > 2 ? Math.sqrt(sse / (n - 2)) : 0;
  return { slope, intercept, fitted, se, xbar, sxx };
}

/** Compound monthly growth between the first and the last few months. */
function compoundGrowth(y: number[]) {
  const n = y.length;
  const k = Math.min(3, Math.floor(n / 2));
  if (k < 1) return 0;
  const first = mean(y.slice(0, k));
  const last = mean(y.slice(-k));
  const periods = n - k;
  if (first <= 0 || last <= 0 || periods <= 0) return 0;
  return clamp(Math.pow(last / first, 1 / periods) - 1, -MAX_MONTHLY_GROWTH, MAX_MONTHLY_GROWTH);
}

/** Projects y for steps 1..horizon after its last point. */
function project(y: number[], method: FittedMethod, horizon: number): number[] {
  const n = y.length;
  if (method === "trend") {
    const { slope, intercept } = ols(y);
    return Array.from({ length: horizon }, (_, h) => intercept + slope * (n + h));
  }
  const k = Math.min(3, n);
  const recent = mean(y.slice(-k));
  if (method === "average") return Array(horizon).fill(recent);
  // growth: compound from the centre of the recent average
  const g = compoundGrowth(y);
  return Array.from({ length: horizon }, (_, h) => recent * Math.pow(1 + g, h + 1 + (k - 1) / 2));
}

function monthlyGrowthOf(y: number[], method: FittedMethod) {
  if (method === "average") return 0;
  if (method === "growth") return compoundGrowth(y);
  const avg = mean(y);
  return avg > 0 ? ols(y).slope / avg : 0;
}

const calMonth = (ym: string) => Number(ym.slice(5, 7)) - 1;

/**
 * Seasonal index per calendar month (0 = Jan), average 1, by the ratio-to-moving-average
 * method: each month is divided by the centred 12-month moving average around it.
 * null when history is too short.
 */
function seasonalIndex(months: string[], y: number[]): number[] | null {
  if (y.length < SEASONAL_MIN_MONTHS) return null;
  const buckets: number[][] = Array.from({ length: 12 }, () => []);
  for (let i = 6; i <= y.length - 7; i++) {
    // 2x12 centred moving average: half weight on the two end months
    const ma = (sum(y.slice(i - 5, i + 6)) + (y[i - 6] + y[i + 6]) / 2) / 12;
    if (ma > 0 && y[i] >= 0) buckets[calMonth(months[i])].push(y[i] / ma);
  }
  const raw = buckets.map((b) => (b.length ? clamp(mean(b), 0.2, 3) : 1));
  const avg = mean(raw);
  return avg > 0 ? raw.map((x) => x / avg) : null;
}

/** Forecast of one P&L line, with optional seasonal adjustment. Values are never negative. */
function forecastLine(months: string[], y: number[], method: FittedMethod, seasonal: boolean, horizon: number) {
  const idx = seasonal ? seasonalIndex(months, y) : null;
  const base = idx ? y.map((v, i) => v / (idx[calMonth(months[i])] || 1)) : y;
  const last = months[months.length - 1];
  const future = Array.from({ length: horizon }, (_, h) => addMonths(last, h + 1));
  const values = project(base, method, horizon).map((v, h) => Math.max(0, v * (idx ? idx[calMonth(future[h])] : 1)));

  // 80 % range from the scatter around the trend line (prediction interval of a regression)
  const { se, xbar, sxx } = ols(base);
  const n = base.length;
  const spread = values.map((_, h) => {
    const x = n + h;
    const factor = Math.sqrt(1 + 1 / n + (sxx > 0 ? (x - xbar) ** 2 / sxx : 0));
    return Z80 * se * factor * (idx ? idx[calMonth(future[h])] : 1);
  });
  return { values, spread, seasonal: !!idx, adjusted: base };
}

/** Accuracy (1 - weighted absolute % error) when the last months are forecast from the earlier ones. */
function backtest(months: string[], y: number[], method: FittedMethod, seasonal: boolean): number | null {
  const n = y.length;
  const hold = Math.min(HOLDOUT_MONTHS, Math.floor(n / 3));
  if (hold < 1 || n - hold < MIN_BASE_MONTHS) return null;
  const actual = y.slice(n - hold);
  const totalActual = sum(actual.map(Math.abs));
  if (totalActual === 0) return null;
  const pred = forecastLine(months.slice(0, n - hold), y.slice(0, n - hold), method, seasonal, hold).values;
  const err = sum(actual.map((a, i) => Math.abs(a - pred[i])));
  return Math.max(0, 1 - err / totalActual);
}

function fitLine(months: string[], y: number[], method: Method, seasonal: boolean, horizon: number) {
  const candidates: FittedMethod[] = method === "auto" ? ["trend", "growth", "average"] : [method];
  let best: { method: FittedMethod; accuracy: number | null } | null = null;
  for (const m of candidates) {
    const accuracy = backtest(months, y, m, seasonal);
    if (!best || (accuracy ?? -1) > (best.accuracy ?? -1)) best = { method: m, accuracy };
  }
  // Too little data to test: the recent average is the safest choice.
  const chosen: FittedMethod = method === "auto" && best?.accuracy == null ? "average" : best!.method;
  const line = forecastLine(months, y, chosen, seasonal, horizon);
  const model: LineModel = {
    method: chosen,
    // Growth of the seasonally adjusted series, so a seasonal low is not read as a decrease
    monthlyGrowth: monthlyGrowthOf(line.adjusted, chosen),
    accuracy: best?.method === chosen ? best.accuracy : backtest(months, y, chosen, seasonal),
    seasonal: line.seasonal,
  };
  return { values: line.values, spread: line.spread, model };
}

/* ---------------- main ---------------- */

export function buildForecast(
  history: HistoryMonth[],
  openingCash: number | null,
  opts: ForecastOptions,
  currency = "PKR"
): ForecastResult | null {
  const n = history.length;
  if (n < MIN_BASE_MONTHS) return null;

  const months = history.map((h) => h.month);
  const revHist = history.map((h) => h.revenue);
  const opexHist = history.map((h) => h.opex);
  const horizon = Math.max(1, Math.round(opts.horizon));

  const rev = fitLine(months, revHist, opts.method, opts.seasonality, horizon);
  const opex = fitLine(months, opexHist, opts.method, opts.seasonality, horizon);

  const totalRev = sum(revHist);
  const cogsRatio = totalRev > 0 ? clamp(sum(history.map((h) => h.cogs)) / totalRev, 0, 2) : 0;
  const otherNetAvg = mean(history.map((h) => h.otherIncome - h.otherExpenses));

  // Scenario: optimistic = revenue high and costs low; pessimistic = the opposite.
  const dir = opts.scenario === "optimistic" ? 1 : opts.scenario === "pessimistic" ? -1 : 0;
  const revFactor = 1 + opts.revenueChangePct;
  const opexFactor = 1 + opts.opexChangePct;

  let cumulative = 0;
  let cash = openingCash;
  const out: ForecastMonth[] = [];
  for (let h = 0; h < horizon; h++) {
    const month = addMonths(months[n - 1], h + 1);
    const revenue = Math.max(0, (rev.values[h] + dir * rev.spread[h]) * revFactor);
    const revenueLow = Math.max(0, (rev.values[h] - rev.spread[h]) * revFactor);
    const revenueHigh = Math.max(0, (rev.values[h] + rev.spread[h]) * revFactor);
    const cogs = revenue * cogsRatio;
    const grossProfit = revenue - cogs;
    const opexValue = Math.max(0, (opex.values[h] - dir * opex.spread[h]) * opexFactor);
    const operatingProfit = grossProfit - opexValue;
    const netProfit = operatingProfit + otherNetAvg;
    cumulative += netProfit;
    if (cash != null) cash += netProfit;
    out.push({
      month,
      revenue,
      revenueLow,
      revenueHigh,
      cogs,
      grossProfit,
      opex: opexValue,
      operatingProfit,
      otherNet: otherNetAvg,
      netProfit,
      netMargin: revenue > 0 ? netProfit / revenue : null,
      cumulativeProfit: cumulative,
      closingCash: cash,
    });
  }

  const totals = {
    revenue: sum(out.map((m) => m.revenue)),
    cogs: sum(out.map((m) => m.cogs)),
    grossProfit: sum(out.map((m) => m.grossProfit)),
    opex: sum(out.map((m) => m.opex)),
    operatingProfit: sum(out.map((m) => m.operatingProfit)),
    otherNet: sum(out.map((m) => m.otherNet)),
    netProfit: cumulative,
    netMargin: 0 as number | null,
  };
  totals.netMargin = totals.revenue > 0 ? totals.netProfit / totals.revenue : null;

  // Actual monthly average of the most recent months (same length as the forecast, if available)
  const recent = history.slice(-Math.min(horizon, n));
  const avgOf = (f: (h: HistoryMonth) => number) => mean(recent.map(f));
  const actualAverage = {
    months: recent.length,
    revenue: avgOf((h) => h.revenue),
    cogs: avgOf((h) => h.cogs),
    grossProfit: avgOf((h) => h.revenue - h.cogs),
    opex: avgOf((h) => h.opex),
    operatingProfit: avgOf((h) => h.revenue - h.cogs - h.opex),
    otherNet: avgOf((h) => h.otherIncome - h.otherExpenses),
    netProfit: avgOf((h) => h.netProfit),
  };
  const avgForecastRevenue = totals.revenue / horizon;
  const revenueChangeVsActual = actualAverage.revenue > 0 ? avgForecastRevenue / actualAverage.revenue - 1 : null;

  // Break-even: fixed costs / contribution margin ratio
  const contributionRatio = 1 - cogsRatio;
  const fixedCosts = totals.opex / horizon - otherNetAvg;
  const breakEvenRevenue = contributionRatio > 0 ? Math.max(0, fixedCosts) / contributionRatio : null;
  const marginOfSafety =
    breakEvenRevenue != null && avgForecastRevenue > 0 ? (avgForecastRevenue - breakEvenRevenue) / avgForecastRevenue : null;

  // Cash
  let lowest: number | null = null;
  let lowestMonth: string | null = null;
  let runOutMonth: string | null = null;
  for (const m of out) {
    if (m.closingCash == null) continue;
    if (lowest == null || m.closingCash < lowest) {
      lowest = m.closingCash;
      lowestMonth = m.month;
    }
    if (runOutMonth == null && m.closingCash < 0) runOutMonth = m.month;
  }
  const avgNet = cumulative / horizon;
  const monthsOfCash = openingCash != null && openingCash > 0 && avgNet < 0 ? openingCash / -avgNet : null;

  const result: ForecastResult = {
    months: out,
    totals,
    actualAverage,
    revenueChangeVsActual,
    assumptions: {
      baseMonths: n,
      firstMonth: months[0],
      lastMonth: months[n - 1],
      revenue: rev.model,
      opex: opex.model,
      cogsRatio,
      otherNetAvg,
      seasonalityAvailable: n >= SEASONAL_MIN_MONTHS,
    },
    breakEven: { monthlyRevenue: breakEvenRevenue, marginOfSafety },
    cash: {
      opening: openingCash,
      closing: out[out.length - 1]?.closingCash ?? null,
      lowest,
      lowestMonth,
      runOutMonth,
      monthsOfCash,
    },
    lossMonths: out.filter((m) => m.netProfit < 0).length,
    insights: [],
  };
  result.insights = buildInsights(result, opts, currency);
  return result;
}

/* ---------------- plain-language insights ---------------- */

function buildInsights(r: ForecastResult, opts: ForecastOptions, currency: string): Insight[] {
  const money = (n: number) => fmtMoney(n, currency);
  const out: Insight[] = [];
  const horizon = r.months.length;
  const a = r.assumptions;
  const avgRevenue = r.totals.revenue / horizon;
  const avgNet = r.totals.netProfit / horizon;

  // 1. Revenue direction
  const g = a.revenue.monthlyGrowth;
  if (g > 0.005) {
    out.push({
      tone: "good",
      title: "Revenue is increasing",
      text: `Revenue increases by approximately ${fmtPct(g)} each month. The average forecast revenue is ${money(avgRevenue)} a month (${fmtSignedPct(r.revenueChangeVsActual)} compared with the last ${r.actualAverage.months} months).`,
    });
  } else if (g < -0.005) {
    out.push({
      tone: "risk",
      title: "Revenue is decreasing",
      text: `Revenue decreases by approximately ${fmtPct(-g)} each month. The average forecast revenue is ${money(avgRevenue)} a month (${fmtSignedPct(r.revenueChangeVsActual)} compared with the last ${r.actualAverage.months} months). Find the cause: lost clients, lower prices or slow invoicing.`,
    });
  } else {
    out.push({
      tone: "info",
      title: "Revenue is stable",
      text: `Revenue stays at approximately ${money(avgRevenue)} a month. There is no clear increase or decrease in the base period.`,
    });
  }

  // 2. Costs compared with revenue
  const first = r.months[0];
  const last = r.months[horizon - 1];
  if (a.opex.monthlyGrowth > 0.005 && a.opex.monthlyGrowth > g + 0.005 && first.netMargin != null && last.netMargin != null) {
    out.push({
      tone: "watch",
      title: "Costs increase faster than revenue",
      text: `Operating expenses increase by ${fmtPct(a.opex.monthlyGrowth)} a month and revenue by ${fmtPct(g)}. The net margin changes from ${fmtPct(first.netMargin)} to ${fmtPct(last.netMargin)}. Do a check of the largest cost lines before you approve new costs.`,
    });
  }

  // 3. Break-even
  const be = r.breakEven.monthlyRevenue;
  if (be != null && r.breakEven.marginOfSafety != null) {
    if (avgNet < 0) {
      const contribution = 1 - a.cogsRatio;
      const revenueNeeded = contribution > 0 ? -avgNet / contribution : null;
      out.push({
        tone: "risk",
        title: "Forecast is below break-even",
        text: `Break-even revenue is ${money(be)} a month. To break even, ${
          revenueNeeded != null ? `increase revenue by ${money(revenueNeeded)} a month, or ` : ""
        }decrease costs by ${money(-avgNet)} a month.`,
      });
    } else {
      out.push({
        tone: r.breakEven.marginOfSafety < 0.1 ? "watch" : "good",
        title: r.breakEven.marginOfSafety < 0.1 ? "Small margin of safety" : "Above break-even",
        text: `Break-even revenue is ${money(be)} a month. Forecast revenue is ${fmtPct(r.breakEven.marginOfSafety)} above it, so revenue can decrease by this much before the company makes a loss.`,
      });
    }
  }

  // 4. Cash
  if (r.cash.opening != null) {
    if (r.cash.runOutMonth) {
      out.push({
        tone: "risk",
        title: `Cash runs out in ${monthLabel(r.cash.runOutMonth)}`,
        text: `Opening cash is ${money(r.cash.opening)} and the average monthly loss is ${money(-avgNet)}. Arrange funding, collect receivables or decrease costs before ${monthLabel(r.cash.runOutMonth)}.`,
      });
    } else if (r.cash.closing != null) {
      const change = r.cash.closing - r.cash.opening;
      out.push({
        tone: change >= 0 ? "good" : "watch",
        title: change >= 0 ? "Cash increases" : "Cash decreases",
        text: `Cash goes from ${money(r.cash.opening)} to approximately ${money(r.cash.closing)} by ${monthLabel(last.month)}${
          r.cash.monthsOfCash != null ? ` (approximately ${r.cash.monthsOfCash.toFixed(1)} months of cash at this loss rate)` : ""
        }.`,
      });
    }
  }

  // 5. Loss months
  if (r.lossMonths > 0 && r.lossMonths < horizon) {
    out.push({
      tone: "watch",
      title: `${r.lossMonths} of ${horizon} months show a loss`,
      text: "Plan for these months. Keep a cash buffer or move payments to profitable months.",
    });
  }

  // 6. Confidence in the forecast
  const acc = a.revenue.accuracy;
  if (a.baseMonths < 6) {
    out.push({
      tone: "watch",
      title: "Little data",
      text: `The forecast uses only ${a.baseMonths} months. Select a longer base period for a more reliable forecast.`,
    });
  } else if (acc != null && acc < 0.7) {
    out.push({
      tone: "watch",
      title: "Irregular revenue",
      text: `Revenue changes much from month to month (test accuracy ${fmtPct(acc, 0)}). Use the pessimistic scenario for decisions about cash and hiring.`,
    });
  } else if (acc != null) {
    out.push({
      tone: "info",
      title: `Forecast accuracy ${fmtPct(acc, 0)}`,
      text: `When the last ${Math.min(HOLDOUT_MONTHS, Math.floor(a.baseMonths / 3))} months were forecast from the earlier months, the revenue forecast was ${fmtPct(acc, 0)} accurate.`,
    });
  }

  if (a.seasonalityAvailable && !opts.seasonality) {
    out.push({
      tone: "info",
      title: "Seasonality is available",
      text: "The base period has 24 months or more. Set Seasonality to On to include the monthly pattern of each year.",
    });
  }

  return out;
}
