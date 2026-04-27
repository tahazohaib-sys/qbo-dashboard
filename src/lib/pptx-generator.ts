// src/lib/pptx-generator.ts
// Section-by-section PowerPoint generator for the QBO Finance Dashboard
import PptxGenJS from "pptxgenjs";

// ─── Payload type (all data the generator needs) ──────────────────────────────
export type PptxPayload = {
  companyName: string;
  currency: string;
  dateRange: { start: string; end: string };
  method: "Accrual" | "Cash";
  series: Array<{ month: string; revenue: number; expenses: number; profit: number }>;
  kpis: { revenue: number; expenses: number; profit: number };
  expenseBreakdown: Array<{ name: string; value: number }>;
  cashAccounts: Array<{ name: string; currency: string; currentBalance: number }>;
  cashTotals: Record<string, number>;
  arAp: {
    totalPayables: number;
    totalReceivables: number;
    asOf: string;
    apAging: Array<{ vendor: string; current: number; "1_30": number; "31_60": number; "61_90": number; "91_plus": number; total: number }>;
  } | null;
  forecast: {
    horizon: number;
    trends: { revenueMoM: number; expensesMoM: number };
    averages: { avgMonthlyRevenue: number; avgMonthlyOpex: number; avgMonthlyProfit: number };
    benchmarks: { breakevenRevenue: number; margin10: number; margin20: number; margin30: number };
    forecast: Array<{ month: string; revenue: number; opex: number; profit: number }>;
  } | null;
  retained: {
    netProfit: number;
    longTermAssets: number;
    totalInvestments: number;
    contributionReceived: number;
    retainedEarning: number;
  } | null;
};

// ─── Theme ────────────────────────────────────────────────────────────────────
export const THEME = {
  bg:        "030B1A",
  bgCard:    "0A1628",
  bgCard2:   "0D1F35",
  accent:    "22D3EE",   // cyan
  green:     "10B981",   // emerald
  red:       "F43F5E",   // rose
  amber:     "F59E0B",
  violet:    "8B5CF6",
  textPrime: "FFFFFF",
  textSub:   "94A3B8",
  textMuted: "475569",
  border:    "1E3A5F",
  chartColors: ["22D3EE","10B981","F43F5E","F59E0B","8B5CF6","38BDF8","34D399","FB923C"],
};

// ─── Number formatters ─────────────────────────────────────────────────────────
export function fmt(n: number, currency = "PKR"): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000_000) return `${sign}${currency} ${(abs / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000)     return `${sign}${currency} ${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000)         return `${sign}${currency} ${(abs / 1_000).toFixed(1)}K`;
  return `${sign}${currency} ${abs.toLocaleString()}`;
}

export function pct(n: number): string {
  return `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
}

export function monthLabel(ym: string): string {
  const [y, m] = ym.split("-");
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleString("en-US", { month: "short", year: "2-digit" });
}

// ─── Slide background helper ──────────────────────────────────────────────────
export function applyBg(slide: PptxGenJS.Slide) {
  slide.background = { color: THEME.bg };
  // subtle top gradient bar
  slide.addShape("rect", {
    x: 0, y: 0, w: "100%", h: 0.06,
    fill: { color: THEME.accent, transparency: 30 },
    line: { color: THEME.accent, width: 0 },
  });
}

// ─── Section heading ──────────────────────────────────────────────────────────
export function addSectionHeading(slide: PptxGenJS.Slide, title: string, y = 0.18) {
  slide.addText(title.toUpperCase(), {
    x: 0.4, y, w: 9, h: 0.32,
    fontSize: 9, bold: true, color: THEME.accent,
    charSpacing: 3, fontFace: "Calibri",
  });
  slide.addShape("line", {
    x: 0.4, y: y + 0.3, w: 9.2, h: 0,
    line: { color: THEME.border, width: 1 },
  });
}

// ─── Cover Slide ──────────────────────────────────────────────────────────────
export function addCoverSlide(pres: PptxGenJS, p: PptxPayload) {
  const slide = pres.addSlide();
  slide.background = { color: THEME.bg };

  // full-width accent band at top
  slide.addShape("rect", { x: 0, y: 0, w: "100%", h: 1.4, fill: { color: THEME.bgCard }, line: { color: THEME.bgCard, width: 0 } });
  slide.addShape("rect", { x: 0, y: 0, w: "100%", h: 0.1, fill: { color: THEME.accent, transparency: 0 }, line: { color: THEME.accent, width: 0 } });

  // company name
  slide.addText(p.companyName, {
    x: 0.5, y: 0.22, w: 9, h: 0.6,
    fontSize: 30, bold: true, color: THEME.textPrime, fontFace: "Calibri",
  });
  slide.addText("Finance & Operations Report", {
    x: 0.5, y: 0.82, w: 9, h: 0.42,
    fontSize: 14, color: THEME.accent, fontFace: "Calibri", charSpacing: 2,
  });

  // centre decorative divider
  slide.addShape("line", { x: 0.5, y: 1.55, w: 9, h: 0, line: { color: THEME.border, width: 1 } });

  // big title
  slide.addText("Financial Performance\nPresentation", {
    x: 0.5, y: 1.72, w: 9, h: 1.6,
    fontSize: 44, bold: true, color: THEME.textPrime, fontFace: "Calibri",
    lineSpacingMultiple: 1.15,
  });

  // date range badge
  slide.addShape("roundRect", {
    x: 0.5, y: 3.55, w: 4.2, h: 0.55,
    fill: { color: THEME.accent, transparency: 80 },
    line: { color: THEME.accent, width: 1.5 },
    rectRadius: 0.1,
  });
  slide.addText(`Period: ${p.dateRange.start}  →  ${p.dateRange.end}`, {
    x: 0.5, y: 3.55, w: 4.2, h: 0.55,
    fontSize: 11, bold: true, color: THEME.accent, align: "center", fontFace: "Calibri",
  });

  // method badge
  slide.addShape("roundRect", {
    x: 5.0, y: 3.55, w: 2.4, h: 0.55,
    fill: { color: THEME.bgCard2 },
    line: { color: THEME.border, width: 1 },
    rectRadius: 0.1,
  });
  slide.addText(`${p.method} Basis`, {
    x: 5.0, y: 3.55, w: 2.4, h: 0.55,
    fontSize: 10, color: THEME.textSub, align: "center", fontFace: "Calibri",
  });

  // currency badge
  slide.addShape("roundRect", {
    x: 7.6, y: 3.55, w: 1.9, h: 0.55,
    fill: { color: THEME.bgCard2 },
    line: { color: THEME.border, width: 1 },
    rectRadius: 0.1,
  });
  slide.addText(`Currency: ${p.currency}`, {
    x: 7.6, y: 3.55, w: 1.9, h: 0.55,
    fontSize: 10, color: THEME.textSub, align: "center", fontFace: "Calibri",
  });

  // bottom strip
  slide.addShape("rect", { x: 0, y: 5.1, w: "100%", h: 0.65, fill: { color: THEME.bgCard }, line: { color: THEME.bgCard, width: 0 } });
  slide.addShape("rect", { x: 0, y: 5.1, w: "100%", h: 0.05, fill: { color: THEME.accent, transparency: 50 }, line: { color: THEME.accent, width: 0 } });
  slide.addText(`Generated on ${new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })}   |   Confidential`, {
    x: 0.5, y: 5.15, w: 9, h: 0.5,
    fontSize: 9, color: THEME.textMuted, fontFace: "Calibri", align: "center",
  });
}

// ─── Executive Summary Slide ──────────────────────────────────────────────────
export function addExecutiveSummarySlide(pres: PptxGenJS, p: PptxPayload) {
  const slide = pres.addSlide();
  applyBg(slide);
  addSectionHeading(slide, "Executive Summary");

  const { revenue, expenses, profit } = p.kpis;
  const margin = revenue !== 0 ? (profit / revenue) * 100 : 0;
  const isProfit = profit >= 0;

  // 4 KPI boxes
  const boxes = [
    { label: "Total Revenue",  value: fmt(revenue, p.currency),  sub: `Period: ${p.dateRange.start} – ${p.dateRange.end}`, color: THEME.accent },
    { label: "Total Expenses", value: fmt(expenses, p.currency), sub: "Operating + Other expenses", color: THEME.red },
    { label: isProfit ? "Net Profit" : "Net Loss", value: fmt(profit, p.currency), sub: isProfit ? "Positive performance" : "Expenses exceed revenue", color: isProfit ? THEME.green : THEME.red },
    { label: "Profit Margin",  value: `${margin.toFixed(1)}%`,   sub: `${p.method} basis · ${p.series.length} month(s)`, color: margin >= 15 ? THEME.green : margin >= 0 ? THEME.amber : THEME.red },
  ];
  const bw = 2.2, bh = 1.05, gap = 0.2, startX = 0.4, startY = 0.68;
  boxes.forEach((b, i) => addKpiBox(slide, { ...b, x: startX + i * (bw + gap), y: startY, w: bw, h: bh }));

  // monthly series mini-summary table
  const series = p.series.slice(-6);
  if (series.length > 0) {
    addSectionHeading(slide, "Monthly Breakdown (last 6 months)", 1.9);

    const headers = [
      [{ text: "Month", options: { bold: true, color: THEME.accent } },
       { text: "Revenue", options: { bold: true, color: THEME.accent } },
       { text: "Expenses", options: { bold: true, color: THEME.accent } },
       { text: "Profit / Loss", options: { bold: true, color: THEME.accent } },
       { text: "Margin %", options: { bold: true, color: THEME.accent } }],
    ];
    const rows = series.map((s) => {
      const m = s.revenue !== 0 ? (s.profit / s.revenue) * 100 : 0;
      const mColor = m >= 0 ? THEME.green : THEME.red;
      return [
        { text: monthLabel(s.month), options: { color: THEME.textSub } },
        { text: fmt(s.revenue, p.currency), options: { color: THEME.textPrime } },
        { text: fmt(s.expenses, p.currency), options: { color: THEME.red } },
        { text: fmt(s.profit, p.currency), options: { color: mColor, bold: true } },
        { text: `${m.toFixed(1)}%`, options: { color: mColor } },
      ];
    });

    slide.addTable([...headers, ...rows], {
      x: 0.4, y: 2.12, w: 9.2, h: series.length * 0.38 + 0.42,
      fontSize: 9, fontFace: "Calibri",
      border: { type: "solid", color: THEME.border, pt: 0.5 },
      fill: { color: THEME.bgCard },
      color: THEME.textPrime,
      rowH: 0.34,
      align: "center",
    });
  }

  // insight text
  const insightY = 2.12 + series.length * 0.38 + 0.55;
  const insightText = isProfit
    ? `Strong performance with ${margin.toFixed(1)}% net profit margin. Revenue reached ${fmt(revenue, p.currency)} over the period.`
    : `Expenses exceeded revenue by ${fmt(Math.abs(profit), p.currency)}. Immediate focus on revenue realization and cost control recommended.`;
  slide.addShape("roundRect", {
    x: 0.4, y: insightY, w: 9.2, h: 0.62,
    fill: { color: isProfit ? THEME.green : THEME.red, transparency: 88 },
    line: { color: isProfit ? THEME.green : THEME.red, width: 1 },
    rectRadius: 0.07,
  });
  slide.addText(`💡  ${insightText}`, {
    x: 0.55, y: insightY + 0.05, w: 9.0, h: 0.52,
    fontSize: 9.5, color: THEME.textPrime, fontFace: "Calibri",
  });
}

// ─── P&L Chart Slide ──────────────────────────────────────────────────────────
export function addPnlChartSlide(pres: PptxGenJS, p: PptxPayload) {
  const slide = pres.addSlide();
  applyBg(slide);
  addSectionHeading(slide, "Profit & Loss — Monthly Overview");

  const series = p.series;
  if (series.length === 0) {
    slide.addText("No P&L data available for this period.", {
      x: 0.5, y: 2, w: 9, h: 1, fontSize: 13, color: THEME.textSub, align: "center", fontFace: "Calibri",
    });
    return;
  }

  const labels = series.map((s) => monthLabel(s.month));

  // Revenue vs Expenses grouped bar chart
  slide.addChart(pres.ChartType.bar, [
    { name: "Revenue",  labels, values: series.map((s) => s.revenue)  },
    { name: "Expenses", labels, values: series.map((s) => s.expenses) },
  ], {
    x: 0.4, y: 0.6, w: 5.8, h: 3.4,
    barGrouping: "clustered",
    chartColors: [THEME.accent, THEME.red],
    showLegend: true, legendPos: "t", legendFontSize: 8,
    showValue: false,
    valAxisLabelFontSize: 8,
    catAxisLabelFontSize: 8,
    valAxisLineShow: false,
    plotArea: { fill: { color: THEME.bgCard } },
    chartArea: { fill: { color: THEME.bgCard } },
    dataLabelFontSize: 7,
    valGridLine: { style: "solid", color: THEME.border, size: 0.5 },
  });

  // Profit line chart
  slide.addChart(pres.ChartType.line, [
    { name: "Net Profit / Loss", labels, values: series.map((s) => s.profit) },
  ], {
    x: 6.4, y: 0.6, w: 3.1, h: 3.4,
    chartColors: [THEME.green],
    showLegend: true, legendPos: "t", legendFontSize: 8,
    lineSize: 2,
    showValue: false,
    valAxisLabelFontSize: 8,
    catAxisLabelFontSize: 7,
    valAxisLineShow: false,
    plotArea: { fill: { color: THEME.bgCard } },
    chartArea: { fill: { color: THEME.bgCard } },
    valGridLine: { style: "solid", color: THEME.border, size: 0.5 },
  });

  // chart labels
  slide.addText("Revenue vs Expenses", {
    x: 0.4, y: 0.48, w: 5.8, h: 0.22,
    fontSize: 8, color: THEME.textSub, fontFace: "Calibri",
  });
  slide.addText("Profit Trend", {
    x: 6.4, y: 0.48, w: 3.1, h: 0.22,
    fontSize: 8, color: THEME.textSub, fontFace: "Calibri",
  });

  // key stats row
  const totalRev = series.reduce((s, x) => s + x.revenue, 0);
  const totalExp = series.reduce((s, x) => s + x.expenses, 0);
  const totalPro = series.reduce((s, x) => s + x.profit, 0);
  const avgMargin = series.length > 0
    ? series.reduce((s, x) => s + (x.revenue !== 0 ? x.profit / x.revenue * 100 : 0), 0) / series.length
    : 0;
  const bestMonth = series.reduce((b, x) => x.profit > b.profit ? x : b, series[0]);

  const stats = [
    { label: "Period Revenue",  value: fmt(totalRev, p.currency), color: THEME.accent },
    { label: "Period Expenses", value: fmt(totalExp, p.currency), color: THEME.red },
    { label: "Period Profit",   value: fmt(totalPro, p.currency), color: totalPro >= 0 ? THEME.green : THEME.red },
    { label: "Avg Margin",      value: `${avgMargin.toFixed(1)}%`, color: avgMargin >= 0 ? THEME.green : THEME.red },
    { label: "Best Month",      value: monthLabel(bestMonth.month), color: THEME.amber },
  ];
  const sw = 1.84, sh = 0.78, sy = 4.1, sx = 0.4;
  stats.forEach((s, i) => {
    slide.addShape("roundRect", {
      x: sx + i * (sw + 0.1), y: sy, w: sw, h: sh,
      fill: { color: THEME.bgCard }, line: { color: THEME.border, width: 0.8 }, rectRadius: 0.07,
    });
    slide.addText(s.label, { x: sx + i * (sw + 0.1) + 0.1, y: sy + 0.06, w: sw - 0.2, h: 0.22, fontSize: 7.5, color: THEME.textSub, fontFace: "Calibri" });
    slide.addText(s.value, { x: sx + i * (sw + 0.1) + 0.1, y: sy + 0.28, w: sw - 0.2, h: 0.38, fontSize: 14, bold: true, color: s.color, fontFace: "Calibri", fit: "shrink" });
  });
}

// ─── Expense Breakdown Slide ──────────────────────────────────────────────────
export function addExpenseBreakdownSlide(pres: PptxGenJS, p: PptxPayload) {
  const slide = pres.addSlide();
  applyBg(slide);
  addSectionHeading(slide, "Expense Breakdown — Category Analysis");

  const breakdown = p.expenseBreakdown.filter((x) => x.value > 0);
  if (breakdown.length === 0) {
    slide.addText("No expense data available.", {
      x: 0.5, y: 2, w: 9, h: 1, fontSize: 13, color: THEME.textSub, align: "center", fontFace: "Calibri",
    });
    return;
  }

  const labels = breakdown.map((x) => x.name);
  const values = breakdown.map((x) => x.value);
  const total  = values.reduce((s, v) => s + v, 0);

  // Doughnut pie chart
  slide.addChart(pres.ChartType.doughnut, [{ name: "Expenses", labels, values }], {
    x: 0.3, y: 0.58, w: 4.8, h: 3.8,
    chartColors: THEME.chartColors,
    showLegend: true, legendPos: "r", legendFontSize: 8,
    showLabel: false,
    showPercent: true,
    dataLabelFontSize: 8,
    chartArea: { fill: { color: THEME.bgCard } },
    plotArea: { fill: { color: THEME.bgCard } },
    holeSize: 55,
    dataLabelColor: THEME.textPrime,
  });

  // Category table on right
  addSectionHeading(slide, "Top Categories", 0.58);
  const tableRows = breakdown.map((x, i) => [
    { text: `${i + 1}`, options: { color: THEME.textMuted, align: "center" as const } },
    { text: x.name, options: { color: THEME.textPrime } },
    { text: fmt(x.value, p.currency), options: { color: THEME.red, bold: true } },
    { text: `${((x.value / total) * 100).toFixed(1)}%`, options: { color: THEME.amber } },
  ]);
  const headerRow = [
    [
      { text: "#",        options: { bold: true, color: THEME.accent, align: "center" as const } },
      { text: "Category", options: { bold: true, color: THEME.accent } },
      { text: "Amount",   options: { bold: true, color: THEME.accent } },
      { text: "Share",    options: { bold: true, color: THEME.accent } },
    ],
  ];

  slide.addTable([...headerRow, ...tableRows], {
    x: 5.3, y: 0.78, w: 4.3, h: tableRows.length * 0.36 + 0.42,
    fontSize: 9, fontFace: "Calibri",
    border: { type: "solid", color: THEME.border, pt: 0.5 },
    fill: { color: THEME.bgCard },
    color: THEME.textPrime,
    rowH: 0.32,
    align: "left",
  });

  // total expense stat
  slide.addShape("roundRect", {
    x: 5.3, y: tableRows.length * 0.36 + 1.35, w: 4.3, h: 0.6,
    fill: { color: THEME.red, transparency: 88 },
    line: { color: THEME.red, width: 1 },
    rectRadius: 0.07,
  });
  slide.addText(`Total Expenses: ${fmt(total, p.currency)}`, {
    x: 5.3, y: tableRows.length * 0.36 + 1.35, w: 4.3, h: 0.6,
    fontSize: 11, bold: true, color: THEME.textPrime, align: "center", fontFace: "Calibri",
  });
}

// ─── Cash & Bank Position Slide ──────────────────────────────────────────────
export function addCashSlide(pres: PptxGenJS, p: PptxPayload) {
  const slide = pres.addSlide();
  applyBg(slide);
  addSectionHeading(slide, "Cash & Bank Position");

  const accounts = p.cashAccounts.filter((a) => Math.abs(a.currentBalance) > 0);
  const totals   = Object.entries(p.cashTotals);

  // Currency totals as KPI boxes
  const bw = 2.1, bh = 0.9, gap = 0.18, sy = 0.62;
  totals.slice(0, 4).forEach(([cur, total], i) => {
    addKpiBox(slide, {
      x: 0.4 + i * (bw + gap), y: sy, w: bw, h: bh,
      label: `Total (${cur})`, value: fmt(total, cur), sub: "Current balance",
      color: total >= 0 ? THEME.green : THEME.red,
    });
  });

  if (accounts.length === 0) {
    slide.addText("No bank/cash accounts found.", {
      x: 0.5, y: 2.2, w: 9, h: 0.6, fontSize: 12, color: THEME.textSub, align: "center", fontFace: "Calibri",
    });
    return;
  }

  // Accounts table
  addSectionHeading(slide, "Account Balances", 1.7);
  const headerRow = [[
    { text: "Account Name", options: { bold: true, color: THEME.accent } },
    { text: "Type",         options: { bold: true, color: THEME.accent } },
    { text: "Currency",     options: { bold: true, color: THEME.accent } },
    { text: "Balance",      options: { bold: true, color: THEME.accent } },
  ]];
  const rows = accounts.map((a) => [
    { text: a.name, options: { color: THEME.textPrime } },
    { text: "Bank / Cash", options: { color: THEME.textSub } },
    { text: a.currency, options: { color: THEME.textSub, align: "center" as const } },
    { text: fmt(a.currentBalance, a.currency), options: { color: a.currentBalance >= 0 ? THEME.green : THEME.red, bold: true } },
  ]);

  slide.addTable([...headerRow, ...rows], {
    x: 0.4, y: 1.92, w: 9.2, h: Math.min(rows.length, 10) * 0.36 + 0.42,
    fontSize: 9, fontFace: "Calibri",
    border: { type: "solid", color: THEME.border, pt: 0.5 },
    fill: { color: THEME.bgCard },
    color: THEME.textPrime,
    rowH: 0.34,
    align: "left",
  });

  // bar chart if > 1 account
  if (accounts.length > 1) {
    const chartAccounts = accounts.slice(0, 8);
    slide.addChart(pres.ChartType.bar, [{
      name: "Balance",
      labels: chartAccounts.map((a) => a.name.length > 18 ? a.name.slice(0, 16) + "…" : a.name),
      values: chartAccounts.map((a) => a.currentBalance),
    }], {
      x: 0.4, y: 1.92 + Math.min(rows.length, 10) * 0.36 + 0.55, w: 9.2, h: 2.0,
      barDir: "bar",
      chartColors: [THEME.accent],
      showLegend: false,
      showValue: true,
      dataLabelFontSize: 7,
      valAxisLabelFontSize: 8,
      catAxisLabelFontSize: 8,
      plotArea: { fill: { color: THEME.bgCard } },
      chartArea: { fill: { color: THEME.bgCard } },
      valGridLine: { style: "solid", color: THEME.border, size: 0.5 },
    });
  }
}

// ─── AR / AP Slide ────────────────────────────────────────────────────────────
export function addArApSlide(pres: PptxGenJS, p: PptxPayload) {
  const slide = pres.addSlide();
  applyBg(slide);
  addSectionHeading(slide, "Accounts Receivable & Payable");

  if (!p.arAp) {
    slide.addText("AR/AP data not available for this period.", {
      x: 0.5, y: 2, w: 9, h: 1, fontSize: 13, color: THEME.textSub, align: "center", fontFace: "Calibri",
    });
    return;
  }

  const { totalPayables, totalReceivables, asOf, apAging } = p.arAp;
  const liquidity = totalPayables > 0 ? totalReceivables / totalPayables : 0;
  const overdue   = apAging.reduce((s, v) => s + v["61_90"] + v["91_plus"], 0);
  const overduePct = (p.arAp.totalPayables) > 0 ? (overdue / p.arAp.totalPayables) * 100 : 0;
  const health    = overduePct > 30 ? "CRITICAL" : overduePct > 15 ? "CAUTION" : "HEALTHY";
  const healthCol = health === "HEALTHY" ? THEME.green : health === "CAUTION" ? THEME.amber : THEME.red;

  // health banner
  slide.addShape("roundRect", {
    x: 0.4, y: 0.58, w: 9.2, h: 0.5,
    fill: { color: healthCol, transparency: 85 },
    line: { color: healthCol, width: 1.2 },
    rectRadius: 0.07,
  });
  slide.addText(`AP Health: ${health}  ·  As of ${asOf}  ·  ${overduePct.toFixed(1)}% overdue (61+ days)`, {
    x: 0.4, y: 0.58, w: 9.2, h: 0.5,
    fontSize: 10, bold: true, color: THEME.textPrime, align: "center", fontFace: "Calibri",
  });

  // 4 KPI boxes
  const kpis = [
    { label: "Total Payables",    value: fmt(totalPayables, p.currency),    sub: "Accounts Payable",   color: THEME.red   },
    { label: "Total Receivables", value: fmt(totalReceivables, p.currency), sub: "Accounts Receivable",color: THEME.green },
    { label: "Liquidity Ratio",   value: liquidity.toFixed(2),              sub: "Receivables / Payables", color: liquidity >= 1 ? THEME.green : THEME.amber },
    { label: "Overdue AP (61d+)", value: fmt(overdue, p.currency),          sub: `${overduePct.toFixed(1)}% of total AP`, color: healthCol },
  ];
  const bw = 2.2, bh = 1.0, gap = 0.18, sy = 1.22;
  kpis.forEach((k, i) => addKpiBox(slide, { ...k, x: 0.4 + i * (bw + gap), y: sy, w: bw, h: bh }));

  // AP Aging table
  if (apAging.length > 0) {
    addSectionHeading(slide, "AP Aging by Vendor", 2.38);
    const hRow = [[
      { text: "Vendor",    options: { bold: true, color: THEME.accent } },
      { text: "Current",   options: { bold: true, color: THEME.accent } },
      { text: "1–30 d",    options: { bold: true, color: THEME.accent } },
      { text: "31–60 d",   options: { bold: true, color: THEME.accent } },
      { text: "61–90 d",   options: { bold: true, color: THEME.amber  } },
      { text: "91+ d",     options: { bold: true, color: THEME.red    } },
      { text: "Total",     options: { bold: true, color: THEME.accent } },
    ]];
    const dRows = apAging.slice(0, 8).map((v) => [
      { text: v.vendor.length > 20 ? v.vendor.slice(0, 18) + "…" : v.vendor, options: { color: THEME.textPrime } },
      { text: fmt(v.current, p.currency),   options: { color: THEME.textSub } },
      { text: fmt(v["1_30"], p.currency),   options: { color: THEME.textSub } },
      { text: fmt(v["31_60"], p.currency),  options: { color: THEME.textSub } },
      { text: fmt(v["61_90"], p.currency),  options: { color: THEME.amber   } },
      { text: fmt(v["91_plus"], p.currency),options: { color: THEME.red, bold: v["91_plus"] > 0 } },
      { text: fmt(v.total, p.currency),     options: { color: THEME.textPrime, bold: true } },
    ]);
    slide.addTable([...hRow, ...dRows], {
      x: 0.4, y: 2.6, w: 9.2, h: dRows.length * 0.34 + 0.4,
      fontSize: 8.5, fontFace: "Calibri",
      border: { type: "solid", color: THEME.border, pt: 0.5 },
      fill: { color: THEME.bgCard }, color: THEME.textPrime, rowH: 0.32, align: "right",
      colW: [2.4, 1.3, 1.3, 1.3, 1.3, 1.3, 1.3],
    });
  }
}

// ─── Forecast Slide ──────────────────────────────────────────────────────────
export function addForecastSlide(pres: PptxGenJS, p: PptxPayload) {
  const slide = pres.addSlide();
  applyBg(slide);
  addSectionHeading(slide, `${p.forecast?.horizon ?? 6}-Month Revenue & Expense Forecast`);

  if (!p.forecast) {
    slide.addText("Forecast data not available.", {
      x: 0.5, y: 2, w: 9, h: 1, fontSize: 13, color: THEME.textSub, align: "center", fontFace: "Calibri",
    });
    return;
  }

  const fc = p.forecast;
  const avgRev  = fc.averages.avgMonthlyRevenue;
  const avgOpex = fc.averages.avgMonthlyOpex;
  const be      = fc.benchmarks.breakevenRevenue;
  const meetsBE = avgRev >= be;

  // 4 stat boxes
  const stats = [
    { label: "Avg Monthly Revenue", value: fmt(avgRev, p.currency),              color: THEME.accent },
    { label: "Avg Monthly Expenses", value: fmt(avgOpex, p.currency),             color: THEME.red },
    { label: "Break-even Revenue",   value: fmt(be, p.currency),                  color: meetsBE ? THEME.green : THEME.amber },
    { label: "Revenue MoM Trend",    value: pct(fc.trends.revenueMoM * 100),      color: fc.trends.revenueMoM >= 0 ? THEME.green : THEME.red },
  ];
  const bw = 2.2, bh = 0.9, gap = 0.18;
  stats.forEach((s, i) => addKpiBox(slide, { ...s, x: 0.4 + i * (bw + gap), y: 0.58, w: bw, h: bh }));

  // Forecast line chart
  const labels = fc.forecast.map((r) => monthLabel(r.month));
  slide.addChart(pres.ChartType.line, [
    { name: "Projected Revenue",  labels, values: fc.forecast.map((r) => r.revenue) },
    { name: "Projected Expenses", labels, values: fc.forecast.map((r) => r.opex)    },
    { name: "Projected Profit",   labels, values: fc.forecast.map((r) => r.profit)  },
  ], {
    x: 0.4, y: 1.62, w: 9.2, h: 2.9,
    chartColors: [THEME.accent, THEME.red, THEME.green],
    showLegend: true, legendPos: "t", legendFontSize: 8,
    lineSize: 2,
    showValue: false,
    valAxisLabelFontSize: 8,
    catAxisLabelFontSize: 8,
    valAxisLineShow: false,
    plotArea: { fill: { color: THEME.bgCard } },
    chartArea: { fill: { color: THEME.bgCard } },
    valGridLine: { style: "solid", color: THEME.border, size: 0.5 },
  });

  // margin benchmarks
  const bmarks = [
    { label: "Break-even",  value: be },
    { label: "10% Margin",  value: fc.benchmarks.margin10 },
    { label: "20% Margin",  value: fc.benchmarks.margin20 },
    { label: "30% Margin",  value: fc.benchmarks.margin30 },
  ];
  const bmY = 4.68, bmW = 2.15, bmH = 0.62, bmGap = 0.1;
  bmarks.forEach((b, i) => {
    const col = avgRev >= b.value ? THEME.green : THEME.amber;
    slide.addShape("roundRect", {
      x: 0.4 + i * (bmW + bmGap), y: bmY, w: bmW, h: bmH,
      fill: { color: col, transparency: 88 }, line: { color: col, width: 0.8 }, rectRadius: 0.06,
    });
    slide.addText(b.label, { x: 0.4 + i * (bmW + bmGap) + 0.08, y: bmY + 0.05, w: bmW - 0.16, h: 0.2, fontSize: 7, color: THEME.textSub, fontFace: "Calibri" });
    slide.addText(fmt(b.value, p.currency), { x: 0.4 + i * (bmW + bmGap) + 0.08, y: bmY + 0.24, w: bmW - 0.16, h: 0.3, fontSize: 12, bold: true, color: col, fontFace: "Calibri", fit: "shrink" });
  });
}

// ─── Retained Earnings Slide ──────────────────────────────────────────────────
export function addRetainedSlide(pres: PptxGenJS, p: PptxPayload) {
  const slide = pres.addSlide();
  applyBg(slide);
  addSectionHeading(slide, "Retained Earnings & Investments");

  if (!p.retained) {
    slide.addText("Retained earnings data not available.", {
      x: 0.5, y: 2, w: 9, h: 1, fontSize: 13, color: THEME.textSub, align: "center", fontFace: "Calibri",
    });
    return;
  }

  const r = p.retained;
  const kpis = [
    { label: "Net Profit",           value: fmt(r.netProfit, p.currency),           color: r.netProfit >= 0 ? THEME.green : THEME.red },
    { label: "Long-term Assets",     value: fmt(r.longTermAssets, p.currency),       color: THEME.accent },
    { label: "Total Investments",    value: fmt(r.totalInvestments, p.currency),     color: THEME.violet },
    { label: "Contribution Received",value: fmt(r.contributionReceived, p.currency), color: THEME.amber  },
    { label: "Retained Earnings",    value: fmt(r.retainedEarning, p.currency),      color: THEME.green  },
  ];
  const bw = 1.78, bh = 1.0, gap = 0.16;
  kpis.forEach((k, i) => addKpiBox(slide, { ...k, x: 0.4 + i * (bw + gap), y: 0.58, w: bw, h: bh }));

  // Composition bar chart
  slide.addChart(pres.ChartType.bar, [{
    name: "Amount",
    labels: ["Net Profit", "Long-term Assets", "Total Investments", "Contribution", "Retained Earnings"],
    values: [r.netProfit, r.longTermAssets, r.totalInvestments, r.contributionReceived, r.retainedEarning],
  }], {
    x: 0.4, y: 1.75, w: 5.5, h: 3.1,
    barDir: "bar",
    chartColors: [THEME.green, THEME.accent, THEME.violet, THEME.amber, THEME.green],
    showLegend: false,
    showValue: true, dataLabelFontSize: 8,
    valAxisLabelFontSize: 8, catAxisLabelFontSize: 8,
    plotArea: { fill: { color: THEME.bgCard } },
    chartArea: { fill: { color: THEME.bgCard } },
    valGridLine: { style: "solid", color: THEME.border, size: 0.5 },
  });

  // Doughnut for composition
  const donutData = [
    { name: "Long-term Assets", value: Math.max(0, r.longTermAssets) },
    { name: "Net Investments",  value: Math.max(0, r.totalInvestments) },
    { name: "Retained Earning", value: Math.max(0, r.retainedEarning) },
  ].filter((x) => x.value > 0);

  if (donutData.length > 0) {
    slide.addChart(pres.ChartType.doughnut, [{
      name: "Retained",
      labels: donutData.map((d) => d.name),
      values: donutData.map((d) => d.value),
    }], {
      x: 6.1, y: 1.75, w: 3.5, h: 3.1,
      chartColors: [THEME.accent, THEME.violet, THEME.green],
      showLegend: true, legendPos: "b", legendFontSize: 8,
      showPercent: true, dataLabelFontSize: 8,
      chartArea: { fill: { color: THEME.bgCard } },
      plotArea: { fill: { color: THEME.bgCard } },
      holeSize: 50,
    });
  }
}

// ─── Closing / Thank-you Slide ─────────────────────────────────────────────────
export function addClosingSlide(pres: PptxGenJS, p: PptxPayload) {
  const slide = pres.addSlide();
  slide.background = { color: THEME.bg };

  // top accent band
  slide.addShape("rect", { x: 0, y: 0, w: "100%", h: 0.1, fill: { color: THEME.accent }, line: { color: THEME.accent, width: 0 } });
  // bottom band
  slide.addShape("rect", { x: 0, y: 5.2, w: "100%", h: 0.55, fill: { color: THEME.bgCard }, line: { color: THEME.bgCard, width: 0 } });

  slide.addText("Thank You", {
    x: 0.5, y: 1.3, w: 9, h: 1.1,
    fontSize: 54, bold: true, color: THEME.textPrime, align: "center", fontFace: "Calibri",
  });
  slide.addText("Questions & Discussion", {
    x: 0.5, y: 2.4, w: 9, h: 0.6,
    fontSize: 20, color: THEME.accent, align: "center", fontFace: "Calibri", charSpacing: 2,
  });
  slide.addShape("line", { x: 2.5, y: 3.12, w: 5, h: 0, line: { color: THEME.border, width: 1 } });
  slide.addText(`${p.companyName}  ·  ${p.dateRange.start} to ${p.dateRange.end}  ·  ${p.method} Basis`, {
    x: 0.5, y: 3.25, w: 9, h: 0.4,
    fontSize: 9, color: THEME.textSub, align: "center", fontFace: "Calibri",
  });
  slide.addText("Confidential — For Internal Use Only", {
    x: 0.5, y: 5.22, w: 9, h: 0.42,
    fontSize: 8, color: THEME.textMuted, align: "center", fontFace: "Calibri",
  });
}

// ─── Master build function ────────────────────────────────────────────────────
export async function buildPresentation(payload: PptxPayload): Promise<Buffer> {
  const pres = new PptxGenJS();
  pres.layout  = "LAYOUT_WIDE";  // 13.33" × 7.5"
  pres.author  = payload.companyName;
  pres.company = payload.companyName;
  pres.subject = `Financial Report ${payload.dateRange.start} – ${payload.dateRange.end}`;
  pres.title   = "Finance & Operations Report";

  addCoverSlide(pres, payload);
  addExecutiveSummarySlide(pres, payload);
  addPnlChartSlide(pres, payload);
  addExpenseBreakdownSlide(pres, payload);
  addCashSlide(pres, payload);
  addArApSlide(pres, payload);
  addForecastSlide(pres, payload);
  addRetainedSlide(pres, payload);
  addClosingSlide(pres, payload);

  const buf = await pres.write({ outputType: "nodebuffer" }) as Buffer;
  return buf;
}

// ─── KPI box ──────────────────────────────────────────────────────────────────
export function addKpiBox(
  slide: PptxGenJS.Slide,
  opts: { x: number; y: number; w: number; h: number; label: string; value: string; sub?: string; color?: string }
) {
  const col = opts.color ?? THEME.accent;
  slide.addShape("roundRect", {
    x: opts.x, y: opts.y, w: opts.w, h: opts.h,
    fill: { color: THEME.bgCard },
    line: { color: col, width: 1.2 },
    rectRadius: 0.08,
  });
  slide.addText(opts.label, {
    x: opts.x + 0.14, y: opts.y + 0.1, w: opts.w - 0.28, h: 0.24,
    fontSize: 8, color: THEME.textSub, bold: false, fontFace: "Calibri",
  });
  slide.addText(opts.value, {
    x: opts.x + 0.14, y: opts.y + 0.3, w: opts.w - 0.28, h: 0.42,
    fontSize: 18, bold: true, color: col, fontFace: "Calibri", fit: "shrink",
  });
  if (opts.sub) {
    slide.addText(opts.sub, {
      x: opts.x + 0.14, y: opts.y + 0.72, w: opts.w - 0.28, h: 0.22,
      fontSize: 8, color: THEME.textMuted, fontFace: "Calibri",
    });
  }
}
