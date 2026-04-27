// src/lib/pptx-generator.ts — Corporate redesign
import PptxGenJS from "pptxgenjs";

// ─── Canvas (LAYOUT_WIDE = 13.33" × 7.5") ────────────────────────────────────
const SW  = 13.33;   // slide width
const SH  = 7.5;     // slide height
const ML  = 0.45;    // left margin
const CW  = 12.43;   // content width  (SW - 2*ML)
const CY  = 0.80;    // content Y start (below header)
const FY  = 7.10;    // footer Y start

// ─── Payload ──────────────────────────────────────────────────────────────────
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
    totalPayables: number; totalReceivables: number; asOf: string;
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
    netProfit: number; longTermAssets: number; totalInvestments: number;
    contributionReceived: number; retainedEarning: number;
  } | null;
};

// ─── Theme ────────────────────────────────────────────────────────────────────
const T = {
  bg:    "0D1B2E",
  panel: "112236",
  card:  "172D47",
  acc:   "14B8C8",
  green: "10B981",
  red:   "EF4444",
  amber: "F59E0B",
  viol:  "8B5CF6",
  white: "F1F5F9",
  sub:   "7FA3C0",
  muted: "3E6080",
  bord:  "1E3D63",
  div:   "1A3456",
  cc:    ["14B8C8","10B981","EF4444","F59E0B","8B5CF6","38BDF8","34D399","FB923C"],
};

// ─── Formatters ───────────────────────────────────────────────────────────────
export function fmt(n: number, cur = "PKR"): string {
  const abs = Math.abs(n), s = n < 0 ? "-" : "";
  if (abs >= 1e9) return `${s}${cur} ${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${s}${cur} ${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${s}${cur} ${(abs / 1e3).toFixed(1)}K`;
  return `${s}${cur} ${abs.toFixed(0)}`;
}

function pct(n: number)   { return `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`; }
function mo(ym: string)   {
  const [y, m] = ym.split("-");
  return new Date(+y, +m - 1, 1).toLocaleString("en-US", { month: "short", year: "2-digit" });
}
function sub(p: PptxPayload) {
  return `${p.dateRange.start} – ${p.dateRange.end}  ·  ${p.method} Basis`;
}

// ─── Slide chrome (header + footer) ──────────────────────────────────────────
function chrome(slide: PptxGenJS.Slide, title: string, info: string, company: string) {
  slide.background = { color: T.bg };

  // top accent line
  slide.addShape("rect", { x: 0, y: 0, w: SW, h: 0.07,
    fill: { color: T.acc }, line: { color: T.acc, width: 0 } });

  // section title
  slide.addText(title.toUpperCase(), { x: ML, y: 0.10, w: 8, h: 0.42,
    fontSize: 10, bold: true, color: T.acc, charSpacing: 2.5, fontFace: "Calibri Light" });

  // right info
  slide.addText(info, { x: 9.2, y: 0.10, w: 3.68, h: 0.42, align: "right",
    fontSize: 8, color: T.sub, fontFace: "Calibri" });

  // header divider
  slide.addShape("line", { x: ML, y: 0.62, w: CW, h: 0,
    line: { color: T.div, width: 0.8 } });

  // footer band
  slide.addShape("rect", { x: 0, y: FY, w: SW, h: SH - FY,
    fill: { color: T.panel }, line: { color: T.panel, width: 0 } });
  slide.addShape("line", { x: 0, y: FY, w: SW, h: 0,
    line: { color: T.bord, width: 0.6 } });
  slide.addText(`${company}  ·  Confidential`, { x: ML, y: FY + 0.07, w: CW, h: 0.24,
    fontSize: 7.5, color: T.muted, align: "center", fontFace: "Calibri" });
}

// ─── KPI card ─────────────────────────────────────────────────────────────────
function kpi(
  slide: PptxGenJS.Slide,
  x: number, y: number, w: number, h: number,
  label: string, value: string, note: string, col: string,
) {
  slide.addShape("roundRect", { x, y, w, h,
    fill: { color: T.card }, line: { color: col, width: 1.2 }, rectRadius: 0.07 });
  // colour top bar
  slide.addShape("rect", { x: x + 0.01, y, w: w - 0.02, h: 0.07,
    fill: { color: col, transparency: 15 }, line: { color: col, width: 0 } });
  slide.addText(label, { x: x + 0.16, y: y + 0.12, w: w - 0.32, h: 0.24,
    fontSize: 8, color: T.sub, fontFace: "Calibri" });
  slide.addText(value, { x: x + 0.16, y: y + 0.33, w: w - 0.32, h: 0.52,
    fontSize: 19, bold: true, color: col, fontFace: "Calibri Light", fit: "shrink" });
  slide.addText(note, { x: x + 0.16, y: y + 0.83, w: w - 0.32, h: 0.20,
    fontSize: 7.5, color: T.muted, fontFace: "Calibri" });
}

// ─── Section label within content area ───────────────────────────────────────
function label(slide: PptxGenJS.Slide, text: string, x: number, y: number, w: number) {
  slide.addText(text.toUpperCase(), { x, y, w, h: 0.26,
    fontSize: 7.5, bold: true, color: T.sub, charSpacing: 1.8, fontFace: "Calibri" });
  slide.addShape("line", { x, y: y + 0.25, w, h: 0,
    line: { color: T.div, width: 0.6 } });
}

// ─── SLIDE 1: Cover ──────────────────────────────────────────────────────────
export function addCoverSlide(pres: PptxGenJS, p: PptxPayload) {
  const slide = pres.addSlide();
  slide.background = { color: T.bg };

  // thick top accent
  slide.addShape("rect", { x: 0, y: 0,    w: SW, h: 0.12, fill: { color: T.acc }, line: { color: T.acc, width: 0 } });
  // thick bottom accent
  slide.addShape("rect", { x: 0, y: 7.38, w: SW, h: 0.12, fill: { color: T.acc }, line: { color: T.acc, width: 0 } });
  // subtle left bar
  slide.addShape("rect", { x: 0, y: 0.12, w: 0.10, h: 7.26,
    fill: { color: T.acc, transparency: 55 }, line: { color: T.acc, width: 0 } });

  // company name
  slide.addText(p.companyName, { x: 0.7, y: 0.6, w: 12.23, h: 0.9,
    fontSize: 36, bold: true, color: T.white, fontFace: "Calibri Light" });

  // subtitle
  slide.addText("Finance & Operations Report", { x: 0.7, y: 1.48, w: 10, h: 0.46,
    fontSize: 15, color: T.acc, fontFace: "Calibri Light", charSpacing: 1.5 });

  // horizontal rule
  slide.addShape("line", { x: 0.7, y: 2.14, w: 12.23, h: 0,
    line: { color: T.bord, width: 1.2 } });

  // big title (two lines)
  slide.addText("Financial Performance", { x: 0.7, y: 2.32, w: 12.23, h: 1.0,
    fontSize: 46, bold: true, color: T.white, fontFace: "Calibri" });
  slide.addText("Presentation", { x: 0.7, y: 3.28, w: 12.23, h: 1.0,
    fontSize: 46, bold: true, color: T.white, fontFace: "Calibri" });

  // ── 3 info badges ──
  const badge = (x: number, w: number, text: string, accent: boolean) => {
    slide.addShape("roundRect", { x, y: 4.6, w, h: 0.62,
      fill: { color: accent ? T.acc : T.panel, transparency: accent ? 0 : 0 },
      line: { color: accent ? T.acc : T.bord, width: 1.4 }, rectRadius: 0.08 });
    slide.addText(text, { x, y: 4.6, w, h: 0.62, align: "center",
      fontSize: accent ? 11 : 9.5, bold: accent, color: accent ? T.bg : T.sub, fontFace: "Calibri" });
  };
  badge(0.7,  5.4, `Period: ${p.dateRange.start}  →  ${p.dateRange.end}`, true);
  badge(6.3,  3.0, `${p.method} Basis`, false);
  badge(9.5,  2.4, `Currency: ${p.currency}`, false);

  // generated date
  slide.addText(
    `Generated on ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}`,
    { x: 0.7, y: 5.5, w: 12.23, h: 0.35, align: "center",
      fontSize: 9, color: T.muted, fontFace: "Calibri" }
  );
}

// ─── SLIDE 2: Executive Summary ───────────────────────────────────────────────
export function addExecutiveSummarySlide(pres: PptxGenJS, p: PptxPayload) {
  const slide = pres.addSlide();
  chrome(slide, "Executive Summary", sub(p), p.companyName);

  const { revenue, expenses, profit } = p.kpis;
  const margin   = revenue !== 0 ? (profit / revenue) * 100 : 0;
  const isProfit = profit >= 0;

  // ── 4 KPI cards (fixed layout) ──
  // box w = (12.43 - 3×0.22) / 4 = 2.94"
  const BW = 2.94, BH = 1.12, GAP = 0.22, BY2 = 0.85;
  const cols = [T.acc, T.red, isProfit ? T.green : T.red, margin >= 0 ? T.green : T.red];
  const cards = [
    { label: "Total Revenue",              value: fmt(revenue, p.currency),  note: `${p.dateRange.start} – ${p.dateRange.end}` },
    { label: "Total Expenses",             value: fmt(expenses, p.currency), note: "Operating + Other" },
    { label: isProfit ? "Net Profit" : "Net Loss", value: fmt(profit, p.currency), note: isProfit ? "Positive period" : "Loss period" },
    { label: "Profit Margin",              value: `${margin.toFixed(1)}%`,   note: `${p.series.length} month(s) · ${p.method}` },
  ];
  cards.forEach((c, i) => kpi(slide, ML + i * (BW + GAP), BY2, BW, BH, c.label, c.value, c.note, cols[i]));

  // ── Monthly table (max 6 rows, fixed position) ──
  const TSTART_Y = 2.14;  // always here
  const TABLE_H  = 2.72;  // fixed height (6 rows × 0.38" + 0.38" header)
  const INSIGHT_Y = 5.05; // always here

  label(slide, "Monthly Breakdown", ML, TSTART_Y, CW);

  const series6 = p.series.slice(-6);
  const hdr = [[
    { text: "Month",      options: { bold: true, color: T.acc } },
    { text: "Revenue",    options: { bold: true, color: T.acc } },
    { text: "Expenses",   options: { bold: true, color: T.acc } },
    { text: "Profit / Loss", options: { bold: true, color: T.acc } },
    { text: "Margin %",  options: { bold: true, color: T.acc } },
  ]];
  const rows = series6.map(s => {
    const m = s.revenue !== 0 ? (s.profit / s.revenue) * 100 : 0;
    return [
      { text: mo(s.month),               options: { color: T.sub } },
      { text: fmt(s.revenue, p.currency),options: { color: T.white } },
      { text: fmt(s.expenses,p.currency),options: { color: T.red } },
      { text: fmt(s.profit,  p.currency),options: { color: m >= 0 ? T.green : T.red, bold: true } },
      { text: `${m.toFixed(1)}%`,        options: { color: m >= 0 ? T.green : T.red } },
    ];
  });

  slide.addTable([...hdr, ...rows], {
    x: ML, y: TSTART_Y + 0.32, w: CW, h: TABLE_H,
    fontSize: 9, fontFace: "Calibri", rowH: 0.38,
    border: { type: "solid", color: T.bord, pt: 0.5 },
    fill: { color: T.card }, color: T.white, align: "center",
  });

  // ── Insight banner (fixed Y) ──
  const col = isProfit ? T.green : T.red;
  const msg = isProfit
    ? `Strong period with ${margin.toFixed(1)}% profit margin — revenue of ${fmt(revenue, p.currency)} outpacing total expenses of ${fmt(expenses, p.currency)}.`
    : `Expenses exceeded revenue by ${fmt(Math.abs(profit), p.currency)}. Focus on revenue realisation and cost discipline.`;

  slide.addShape("roundRect", { x: ML, y: INSIGHT_Y, w: CW, h: 0.70,
    fill: { color: col, transparency: 88 }, line: { color: col, width: 1.2 }, rectRadius: 0.07 });
  slide.addText(`💡  ${msg}`, { x: ML + 0.2, y: INSIGHT_Y + 0.04, w: CW - 0.4, h: 0.62,
    fontSize: 9.5, color: T.white, fontFace: "Calibri" });
}

// ─── SLIDE 3: P&L Charts ──────────────────────────────────────────────────────
export function addPnlChartSlide(pres: PptxGenJS, p: PptxPayload) {
  const slide = pres.addSlide();
  chrome(slide, "Profit & Loss — Monthly Overview", sub(p), p.companyName);

  const s = p.series;
  if (!s.length) {
    slide.addText("No P&L data for this period.", { x: ML, y: 3, w: CW, h: 0.6,
      fontSize: 13, color: T.sub, align: "center", fontFace: "Calibri" });
    return;
  }

  const lbl = s.map(x => mo(x.month));

  // ── Revenue vs Expenses bar chart (left 2/3) ──
  label(slide, "Revenue vs Expenses", ML, CY, 8.4);
  slide.addChart(pres.ChartType.bar, [
    { name: "Revenue",  labels: lbl, values: s.map(x => x.revenue)  },
    { name: "Expenses", labels: lbl, values: s.map(x => x.expenses) },
  ], {
    x: ML, y: CY + 0.32, w: 8.4, h: 4.75,
    barGrouping: "clustered",
    chartColors: [T.acc, T.red],
    showLegend: true, legendPos: "t", legendFontSize: 8,
    showValue: false,
    valAxisLabelFontSize: 8, catAxisLabelFontSize: 8,
    valAxisLabelFormatCode: '#,##0.0,,"M"',
    valAxisLabelColor: T.sub, catAxisLabelColor: T.sub,
    valAxisLineShow: false,
    chartArea: { fill: { color: T.card } },
    plotArea: { fill: { color: T.card } },
    valGridLine: { style: "solid", color: T.bord, size: 0.5 },
  });

  // ── Profit trend line chart (right 1/3) ──
  label(slide, "Net Profit Trend", 9.1, CY, 4.23);
  slide.addChart(pres.ChartType.line, [
    { name: "Profit", labels: lbl, values: s.map(x => x.profit) },
  ], {
    x: 9.1, y: CY + 0.32, w: 4.23, h: 4.75,
    chartColors: [T.green],
    showLegend: false,
    lineSize: 2.5,
    showValue: true, dataLabelFontSize: 7, dataLabelColor: T.green,
    dataLabelFormatCode: '#,##0.0,,"M"',
    valAxisLabelFontSize: 8, catAxisLabelFontSize: 8,
    valAxisLabelFormatCode: '#,##0.0,,"M"',
    valAxisLabelColor: T.sub, catAxisLabelColor: T.sub,
    valAxisLineShow: false,
    chartArea: { fill: { color: T.card } },
    plotArea: { fill: { color: T.card } },
    valGridLine: { style: "solid", color: T.bord, size: 0.5 },
  });

  // ── 5 stat boxes bottom row (fixed Y = 5.72) ──
  const totalRev = s.reduce((a, x) => a + x.revenue, 0);
  const totalExp = s.reduce((a, x) => a + x.expenses, 0);
  const totalPro = s.reduce((a, x) => a + x.profit, 0);
  const avgMgn   = s.reduce((a, x) => a + (x.revenue ? x.profit / x.revenue * 100 : 0), 0) / s.length;
  const best     = s.reduce((b, x) => x.profit > b.profit ? x : b, s[0]);

  const SW2 = (CW - 4 * 0.18) / 5; // stat box width
  const stats = [
    { l: "Period Revenue",  v: fmt(totalRev, p.currency), c: T.acc   },
    { l: "Period Expenses", v: fmt(totalExp, p.currency), c: T.red   },
    { l: "Period Profit",   v: fmt(totalPro, p.currency), c: totalPro >= 0 ? T.green : T.red },
    { l: "Avg Margin",      v: `${avgMgn.toFixed(1)}%`,  c: avgMgn >= 0 ? T.green : T.red },
    { l: "Best Month",      v: mo(best.month),            c: T.amber  },
  ];
  stats.forEach((st, i) => {
    const sx = ML + i * (SW2 + 0.18);
    slide.addShape("roundRect", { x: sx, y: 5.72, w: SW2, h: 1.05,
      fill: { color: T.card }, line: { color: st.c, width: 1 }, rectRadius: 0.07 });
    slide.addShape("rect", { x: sx + 0.01, y: 5.72, w: SW2 - 0.02, h: 0.06,
      fill: { color: st.c, transparency: 15 }, line: { color: st.c, width: 0 } });
    slide.addText(st.l, { x: sx + 0.14, y: 5.84, w: SW2 - 0.28, h: 0.22,
      fontSize: 7.5, color: T.sub, fontFace: "Calibri" });
    slide.addText(st.v, { x: sx + 0.14, y: 6.04, w: SW2 - 0.28, h: 0.42,
      fontSize: 15, bold: true, color: st.c, fontFace: "Calibri Light", fit: "shrink" });
  });
}

// ─── SLIDE 4: Expense Breakdown ───────────────────────────────────────────────
export function addExpenseBreakdownSlide(pres: PptxGenJS, p: PptxPayload) {
  const slide = pres.addSlide();
  chrome(slide, "Expense Breakdown — Category Analysis", sub(p), p.companyName);

  const cats = p.expenseBreakdown.filter(x => x.value > 0);
  if (!cats.length) {
    slide.addText("No expense data for this period.", { x: ML, y: 3, w: CW, h: 0.6,
      fontSize: 13, color: T.sub, align: "center", fontFace: "Calibri" });
    return;
  }

  const total = cats.reduce((s, x) => s + x.value, 0);
  // Cap at 7 rows so table + total box always fit
  const top7 = cats.slice(0, 7);
  const rest  = cats.slice(7).reduce((s, x) => s + x.value, 0);
  const rows  = rest > 0 ? [...top7, { name: "Other", value: rest }] : top7;

  // ── Doughnut (left, fixed) ──
  slide.addChart(pres.ChartType.doughnut, [{ name: "Expenses",
    labels: rows.map(x => x.name.length > 22 ? x.name.slice(0, 20) + "…" : x.name),
    values: rows.map(x => x.value),
  }], {
    x: ML, y: CY, w: 5.9, h: 5.72,
    chartColors: T.cc,
    showLegend: true, legendPos: "b", legendFontSize: 7.5,
    showPercent: true, dataLabelFontSize: 8, dataLabelColor: T.white,
    chartArea: { fill: { color: T.card } },
    plotArea: { fill: { color: T.card } },
    holeSize: 52,
  });

  // ── Category table (right, fixed positions) ──
  const TX       = 6.55;
  const TW       = 6.33;
  const TABLE_Y  = CY + 0.32;
  const ROW_H    = 0.46;
  const TOTAL_Y  = 5.35; // FIXED — never moves

  label(slide, "Top Expense Categories", TX, CY, TW);

  const hdr = [[
    { text: "#",        options: { bold: true, color: T.acc, align: "center" as const } },
    { text: "Category", options: { bold: true, color: T.acc } },
    { text: "Amount",   options: { bold: true, color: T.acc } },
    { text: "Share",    options: { bold: true, color: T.acc } },
  ]];
  const trows = rows.map((x, i) => [
    { text: `${i + 1}`, options: { color: T.muted, align: "center" as const } },
    { text: x.name.length > 28 ? x.name.slice(0, 26) + "…" : x.name, options: { color: T.white } },
    { text: fmt(x.value, p.currency), options: { color: T.red, bold: true } },
    { text: `${((x.value / total) * 100).toFixed(1)}%`, options: { color: T.amber } },
  ]);

  slide.addTable([...hdr, ...trows], {
    x: TX, y: TABLE_Y, w: TW, h: (rows.length + 1) * ROW_H,
    fontSize: 9, fontFace: "Calibri", rowH: ROW_H,
    border: { type: "solid", color: T.bord, pt: 0.5 },
    fill: { color: T.card }, color: T.white, align: "left",
    colW: [0.42, 3.3, 1.6, 1.01],
  });

  // ── Total box (FIXED Y — always below all rows, never overlaps) ──
  slide.addShape("roundRect", { x: TX, y: TOTAL_Y, w: TW, h: 0.72,
    fill: { color: T.red, transparency: 88 }, line: { color: T.red, width: 1.2 }, rectRadius: 0.07 });
  slide.addText(`Total Expenses:  ${fmt(total, p.currency)}`, {
    x: TX, y: TOTAL_Y, w: TW, h: 0.72,
    fontSize: 13, bold: true, color: T.white, align: "center", fontFace: "Calibri" });
}

// ─── SLIDE 5: Cash & Bank ─────────────────────────────────────────────────────
export function addCashSlide(pres: PptxGenJS, p: PptxPayload) {
  const slide = pres.addSlide();
  chrome(slide, "Cash & Bank Position", sub(p), p.companyName);

  const accts   = p.cashAccounts.filter(a => Math.abs(a.currentBalance) > 0);
  const totals  = Object.entries(p.cashTotals).slice(0, 5);

  // ── Currency KPI boxes (up to 5) ──
  const N  = Math.max(1, totals.length);
  const BW = (CW - (N - 1) * 0.22) / N;
  totals.forEach(([cur, tot], i) => {
    kpi(slide, ML + i * (BW + 0.22), 0.85, BW, 1.05,
      `Total (${cur})`, fmt(tot, cur), "Current balance",
      tot >= 0 ? T.green : T.red);
  });

  if (!accts.length) {
    slide.addText("No active bank/cash accounts found.", { x: ML, y: 3, w: CW, h: 0.6,
      fontSize: 12, color: T.sub, align: "center", fontFace: "Calibri" });
    return;
  }

  // ── Accounts table (max 9 rows, fixed) ──
  label(slide, "Account Balances", ML, 2.10, CW);

  const hdr = [[
    { text: "Account Name", options: { bold: true, color: T.acc } },
    { text: "Type",         options: { bold: true, color: T.acc } },
    { text: "Currency",     options: { bold: true, color: T.acc, align: "center" as const } },
    { text: "Balance",      options: { bold: true, color: T.acc, align: "right"  as const } },
  ]];
  const rows = accts.slice(0, 9).map(a => [
    { text: a.name,          options: { color: T.white } },
    { text: "Bank / Cash",   options: { color: T.sub } },
    { text: a.currency,      options: { color: T.sub, align: "center" as const } },
    { text: fmt(a.currentBalance, a.currency),
      options: { color: a.currentBalance >= 0 ? T.green : T.red, bold: true, align: "right" as const } },
  ]);

  slide.addTable([...hdr, ...rows], {
    x: ML, y: 2.36, w: CW, h: (rows.length + 1) * 0.44,
    fontSize: 9.5, fontFace: "Calibri", rowH: 0.44,
    border: { type: "solid", color: T.bord, pt: 0.5 },
    fill: { color: T.card }, color: T.white, align: "left",
    colW: [5.5, 2.5, 2.0, 2.43],
  });
}

// ─── SLIDE 6: AR / AP ─────────────────────────────────────────────────────────
export function addArApSlide(pres: PptxGenJS, p: PptxPayload) {
  const slide = pres.addSlide();
  chrome(slide, "Accounts Receivable & Payable", sub(p), p.companyName);

  if (!p.arAp) {
    slide.addText("AR/AP data not available for this period.", { x: ML, y: 3, w: CW, h: 0.6,
      fontSize: 13, color: T.sub, align: "center", fontFace: "Calibri" });
    return;
  }

  const { totalPayables, totalReceivables, asOf, apAging } = p.arAp;
  const overdue    = apAging.reduce((s, v) => s + v["61_90"] + v["91_plus"], 0);
  const overduePct = totalPayables > 0 ? (overdue / totalPayables) * 100 : 0;
  const liq        = totalPayables > 0 ? totalReceivables / totalPayables : 0;
  const health     = overduePct > 30 ? "CRITICAL" : overduePct > 15 ? "CAUTION" : "HEALTHY";
  const hcol       = health === "HEALTHY" ? T.green : health === "CAUTION" ? T.amber : T.red;

  // ── Health banner ──
  slide.addShape("roundRect", { x: ML, y: 0.82, w: CW, h: 0.52,
    fill: { color: hcol, transparency: 85 }, line: { color: hcol, width: 1.2 }, rectRadius: 0.07 });
  slide.addText(
    `AP Health: ${health}  ·  As of ${asOf}  ·  ${overduePct.toFixed(1)}% overdue (61+ days)`,
    { x: ML + 0.2, y: 0.82, w: CW - 0.4, h: 0.52,
      fontSize: 10, bold: true, color: T.white, align: "center", fontFace: "Calibri" });

  // ── 4 KPI cards ──
  const BW = 2.94, BH = 1.05, GAP = 0.22;
  const kcards = [
    { l: "Total Payables",    v: fmt(totalPayables, p.currency),    n: "Accounts Payable",     c: T.red   },
    { l: "Total Receivables", v: fmt(totalReceivables, p.currency), n: "Accounts Receivable",  c: T.green },
    { l: "Liquidity Ratio",   v: liq.toFixed(2),                   n: "Receivables / Payables",c: liq >= 1 ? T.green : T.amber },
    { l: "Overdue AP (61d+)", v: fmt(overdue, p.currency),          n: `${overduePct.toFixed(1)}% of total AP`, c: hcol },
  ];
  kcards.forEach((c, i) => kpi(slide, ML + i * (BW + GAP), 1.47, BW, BH, c.l, c.v, c.n, c.c));

  // ── AP Aging table (max 7 vendors, fixed) ──
  label(slide, "AP Aging by Vendor", ML, 2.68, CW);

  const vendors = apAging.slice(0, 7);
  const hdr = [[
    { text: "Vendor",  options: { bold: true, color: T.acc } },
    { text: "Current", options: { bold: true, color: T.acc, align: "right" as const } },
    { text: "1–30 d",  options: { bold: true, color: T.acc, align: "right" as const } },
    { text: "31–60 d", options: { bold: true, color: T.acc, align: "right" as const } },
    { text: "61–90 d", options: { bold: true, color: T.amber,align: "right" as const } },
    { text: "91+ d",   options: { bold: true, color: T.red,  align: "right" as const } },
    { text: "Total",   options: { bold: true, color: T.acc, align: "right" as const } },
  ]];
  const rows = vendors.map(v => [
    { text: v.vendor.length > 22 ? v.vendor.slice(0, 20) + "…" : v.vendor, options: { color: T.white } },
    { text: fmt(v.current,    p.currency), options: { color: T.sub,   align: "right" as const } },
    { text: fmt(v["1_30"],    p.currency), options: { color: T.sub,   align: "right" as const } },
    { text: fmt(v["31_60"],   p.currency), options: { color: T.sub,   align: "right" as const } },
    { text: fmt(v["61_90"],   p.currency), options: { color: T.amber, align: "right" as const } },
    { text: fmt(v["91_plus"], p.currency), options: { color: T.red, bold: v["91_plus"] > 0, align: "right" as const } },
    { text: fmt(v.total,      p.currency), options: { color: T.white, bold: true, align: "right" as const } },
  ]);

  slide.addTable([...hdr, ...rows], {
    x: ML, y: 2.94, w: CW, h: (rows.length + 1) * 0.44,
    fontSize: 9, fontFace: "Calibri", rowH: 0.44,
    border: { type: "solid", color: T.bord, pt: 0.5 },
    fill: { color: T.card }, color: T.white, align: "left",
    colW: [3.2, 1.6, 1.6, 1.6, 1.6, 1.6, 1.63],
  });
}

// ─── SLIDE 7: Forecast ────────────────────────────────────────────────────────
export function addForecastSlide(pres: PptxGenJS, p: PptxPayload) {
  const slide = pres.addSlide();
  const horizon = p.forecast?.horizon ?? 6;
  chrome(slide, `${horizon}-Month Revenue & Expense Forecast`, sub(p), p.companyName);

  if (!p.forecast) {
    slide.addText("Forecast data not available.", { x: ML, y: 3, w: CW, h: 0.6,
      fontSize: 13, color: T.sub, align: "center", fontFace: "Calibri" });
    return;
  }

  const fc = p.forecast;
  const avgRev = fc.averages.avgMonthlyRevenue;
  const be     = fc.benchmarks.breakevenRevenue;

  // ── 4 stat KPI boxes ──
  const BW = 2.94, BH = 1.05, GAP = 0.22;
  const fcCards = [
    { l: "Avg Monthly Revenue",  v: fmt(avgRev, p.currency),                       c: T.acc   },
    { l: "Avg Monthly Expenses", v: fmt(fc.averages.avgMonthlyOpex, p.currency),   c: T.red   },
    { l: "Break-even Revenue",   v: fmt(be, p.currency),                            c: avgRev >= be ? T.green : T.amber },
    { l: "Revenue MoM Trend",    v: pct(fc.trends.revenueMoM * 100),               c: fc.trends.revenueMoM >= 0 ? T.green : T.red },
  ];
  fcCards.forEach((c, i) => kpi(slide, ML + i * (BW + GAP), 0.85, BW, BH, c.l, c.v, "", c.c));

  // ── Forecast line chart (full width, fixed) ──
  const lbl = fc.forecast.map(r => mo(r.month));
  slide.addChart(pres.ChartType.line, [
    { name: "Projected Revenue",  labels: lbl, values: fc.forecast.map(r => r.revenue) },
    { name: "Projected Expenses", labels: lbl, values: fc.forecast.map(r => r.opex)    },
    { name: "Projected Profit",   labels: lbl, values: fc.forecast.map(r => r.profit)  },
  ], {
    x: ML, y: 2.10, w: CW, h: 3.72,
    chartColors: [T.acc, T.red, T.green],
    showLegend: true, legendPos: "t", legendFontSize: 8.5,
    lineSize: 2.5,
    showValue: false,
    valAxisLabelFontSize: 8, catAxisLabelFontSize: 8,
    valAxisLabelFormatCode: '#,##0.0,,"M"',
    valAxisLabelColor: T.sub, catAxisLabelColor: T.sub,
    valAxisLineShow: false,
    chartArea: { fill: { color: T.card } },
    plotArea: { fill: { color: T.card } },
    valGridLine: { style: "solid", color: T.bord, size: 0.5 },
  });

  // ── 4 benchmark boxes (fixed Y = 6.0) ──
  const bmarks = [
    { l: "Break-even",  v: fc.benchmarks.breakevenRevenue },
    { l: "10% Margin",  v: fc.benchmarks.margin10 },
    { l: "20% Margin",  v: fc.benchmarks.margin20 },
    { l: "30% Margin",  v: fc.benchmarks.margin30 },
  ];
  const BMW = (CW - 3 * 0.22) / 4;
  bmarks.forEach((b, i) => {
    const col = avgRev >= b.v ? T.green : T.amber;
    slide.addShape("roundRect", { x: ML + i * (BMW + 0.22), y: 6.0, w: BMW, h: 0.82,
      fill: { color: col, transparency: 88 }, line: { color: col, width: 0.8 }, rectRadius: 0.06 });
    slide.addText(b.l, { x: ML + i * (BMW + 0.22) + 0.1, y: 6.06, w: BMW - 0.2, h: 0.22,
      fontSize: 7.5, color: T.sub, fontFace: "Calibri" });
    slide.addText(fmt(b.v, p.currency), { x: ML + i * (BMW + 0.22) + 0.1, y: 6.26, w: BMW - 0.2, h: 0.44,
      fontSize: 13, bold: true, color: col, fontFace: "Calibri Light", fit: "shrink" });
  });
}

// ─── SLIDE 8: Retained Earnings ───────────────────────────────────────────────
export function addRetainedSlide(pres: PptxGenJS, p: PptxPayload) {
  const slide = pres.addSlide();
  chrome(slide, "Retained Earnings & Investments", sub(p), p.companyName);

  if (!p.retained) {
    slide.addText("Retained earnings data not available.", { x: ML, y: 3, w: CW, h: 0.6,
      fontSize: 13, color: T.sub, align: "center", fontFace: "Calibri" });
    return;
  }

  const r = p.retained;

  // ── 5 KPI boxes ──
  // bw = (12.43 - 4×0.18) / 5 = 2.342"
  const BW = 2.34, BH = 1.0, GAP = 0.18;
  const rcards = [
    { l: "Net Profit",            v: fmt(r.netProfit, p.currency),            c: r.netProfit >= 0 ? T.green : T.red },
    { l: "Long-term Assets",      v: fmt(r.longTermAssets, p.currency),        c: T.acc   },
    { l: "Total Investments",     v: fmt(r.totalInvestments, p.currency),      c: T.viol  },
    { l: "Contribution Received", v: fmt(r.contributionReceived, p.currency),  c: T.amber },
    { l: "Retained Earnings",     v: fmt(r.retainedEarning, p.currency),       c: T.green },
  ];
  rcards.forEach((c, i) => kpi(slide, ML + i * (BW + GAP), 0.85, BW, BH, c.l, c.v, "", c.c));

  // ── Bar chart left ──
  const barLabels = ["Net Profit","Long-term Assets","Investments","Contribution","Retained Earnings"];
  const barVals   = [r.netProfit, r.longTermAssets, r.totalInvestments, r.contributionReceived, r.retainedEarning];
  slide.addChart(pres.ChartType.bar, [{ name: "Amount", labels: barLabels, values: barVals }], {
    x: ML, y: 2.05, w: 6.8, h: 4.68,
    barDir: "bar",
    chartColors: [T.green, T.acc, T.viol, T.amber, T.green],
    showLegend: false,
    showValue: true, dataLabelFontSize: 7.5,
    dataLabelFormatCode: '#,##0.0,,"M"',
    valAxisLabelFontSize: 8, catAxisLabelFontSize: 8,
    valAxisLabelFormatCode: '#,##0.0,,"M"',
    valAxisLabelColor: T.sub, catAxisLabelColor: T.sub,
    chartArea: { fill: { color: T.card } },
    plotArea: { fill: { color: T.card } },
    valGridLine: { style: "solid", color: T.bord, size: 0.5 },
  });

  // ── Doughnut right ──
  const donut = [
    { name: "Long-term Assets",  value: Math.max(0, r.longTermAssets)    },
    { name: "Net Investments",   value: Math.max(0, r.totalInvestments)  },
    { name: "Retained Earnings", value: Math.max(0, r.retainedEarning)   },
  ].filter(x => x.value > 0);

  if (donut.length) {
    slide.addChart(pres.ChartType.doughnut, [{ name: "Equity",
      labels: donut.map(d => d.name), values: donut.map(d => d.value),
    }], {
      x: 7.5, y: 2.05, w: 5.38, h: 4.68,
      chartColors: [T.acc, T.viol, T.green],
      showLegend: true, legendPos: "b", legendFontSize: 8.5,
      showPercent: true, dataLabelFontSize: 8.5, dataLabelColor: T.white,
      chartArea: { fill: { color: T.card } },
      plotArea: { fill: { color: T.card } },
      holeSize: 50,
    });
  }
}

// ─── SLIDE 9: Closing ─────────────────────────────────────────────────────────
export function addClosingSlide(pres: PptxGenJS, p: PptxPayload) {
  const slide = pres.addSlide();
  slide.background = { color: T.bg };

  // top + bottom accent bars
  slide.addShape("rect", { x: 0, y: 0,    w: SW, h: 0.12, fill: { color: T.acc }, line: { color: T.acc, width: 0 } });
  slide.addShape("rect", { x: 0, y: 7.38, w: SW, h: 0.12, fill: { color: T.acc }, line: { color: T.acc, width: 0 } });

  // centre content block
  slide.addShape("roundRect", { x: 1.8, y: 1.5, w: 9.73, h: 4.3,
    fill: { color: T.panel }, line: { color: T.bord, width: 1 }, rectRadius: 0.12 });

  slide.addText("Thank You", { x: 1.8, y: 1.75, w: 9.73, h: 1.5,
    fontSize: 60, bold: true, color: T.white, align: "center", fontFace: "Calibri Light" });

  slide.addText("Questions & Discussion", { x: 1.8, y: 3.22, w: 9.73, h: 0.6,
    fontSize: 20, color: T.acc, align: "center", fontFace: "Calibri Light", charSpacing: 1.5 });

  slide.addShape("line", { x: 3.5, y: 3.95, w: 6.33, h: 0,
    line: { color: T.bord, width: 1 } });

  slide.addText(
    `${p.companyName}  ·  ${p.dateRange.start} to ${p.dateRange.end}  ·  ${p.method} Basis`,
    { x: 1.8, y: 4.1, w: 9.73, h: 0.42, align: "center",
      fontSize: 9.5, color: T.sub, fontFace: "Calibri" });

  slide.addText("Confidential — For Internal Use Only", { x: 1.8, y: 5.55, w: 9.73, h: 0.28,
    fontSize: 8, color: T.muted, align: "center", fontFace: "Calibri" });
}

// ─── Master build ─────────────────────────────────────────────────────────────
export async function buildPresentation(payload: PptxPayload): Promise<Buffer> {
  const pres = new PptxGenJS();
  pres.layout  = "LAYOUT_WIDE";
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

  return await pres.write({ outputType: "nodebuffer" }) as Buffer;
}
