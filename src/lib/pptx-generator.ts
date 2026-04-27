// src/lib/pptx-generator.ts — Corporate light-theme redesign
import PptxGenJS from "pptxgenjs";

// ─── Canvas ────────────────────────────────────────────────────────────────────
const SW = 13.33;  // slide width  (LAYOUT_WIDE)
const SH = 7.5;    // slide height
const ML = 0.45;   // left margin
const CW = 12.43;  // content width
const CY = 0.98;   // content Y (below header band)
const FY = 7.10;   // footer Y

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
  bg:     "FFFFFF",   // white slide
  bgAlt:  "F8FAFC",   // alternating rows / light panels
  bgCard: "EFF6FF",   // KPI card face
  bgHdr:  "0C2340",   // dark header band
  bgFoot: "F1F5F9",   // footer strip
  acc:    "0891B2",   // teal accent
  green:  "059669",   // positive
  red:    "DC2626",   // negative / alert
  amber:  "D97706",   // warning
  viol:   "7C3AED",   // violet
  textH:  "0C2340",   // dark headings
  textB:  "1E293B",   // body text
  textS:  "64748B",   // subtle
  bord:   "E2E8F0",   // light borders
  div:    "CBD5E1",   // dividers
  cc:     ["0891B2","059669","DC2626","D97706","7C3AED","0EA5E9","10B981","F97316"],
};

// ─── Formatters ───────────────────────────────────────────────────────────────
export function fmt(n: number, cur = "PKR"): string {
  const abs = Math.abs(n), s = n < 0 ? "-" : "";
  if (abs >= 1e9) return `${s}${cur} ${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${s}${cur} ${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${s}${cur} ${(abs / 1e3).toFixed(1)}K`;
  return `${s}${cur} ${abs.toFixed(0)}`;
}
function pct(n: number) { return `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`; }
function mo(ym: string) {
  const [y, m] = ym.split("-");
  return new Date(+y, +m - 1, 1).toLocaleString("en-US", { month: "short", year: "2-digit" });
}
function periodInfo(p: PptxPayload) {
  return `${p.dateRange.start} – ${p.dateRange.end}  ·  ${p.method}`;
}

// ─── Chart defaults (white bg, readable labels) ───────────────────────────────
const CHART_DEFAULTS = {
  valAxisLabelFontSize: 8,
  catAxisLabelFontSize: 8,
  valAxisLabelFormatCode: '#,##0.0,,"M"',
  valAxisLabelColor: "64748B",
  catAxisLabelColor: "64748B",
  valAxisLineShow: false,
  valGridLine: { style: "solid" as const, color: "E2E8F0", size: 0.5 },
  chartArea: { fill: { color: "FFFFFF" } },
  plotArea: { fill: { color: "FFFFFF" } },
};

// ─── Chrome — dark header band + footer on every content slide ────────────────
function chrome(
  slide: PptxGenJS.Slide,
  num: string,
  title: string,
  subtitle: string,
  company: string,
  info: string,
) {
  slide.background = { color: T.bg };

  // dark header band
  slide.addShape("rect", { x: 0, y: 0, w: SW, h: 0.88,
    fill: { color: T.bgHdr }, line: { color: T.bgHdr, width: 0 } });

  // teal accent line below header
  slide.addShape("rect", { x: 0, y: 0.88, w: SW, h: 0.04,
    fill: { color: T.acc }, line: { color: T.acc, width: 0 } });

  // section number
  slide.addText(num, { x: ML, y: 0.10, w: 0.75, h: 0.68,
    fontSize: 30, bold: true, color: T.acc, fontFace: "Calibri", valign: "middle" });

  // title
  slide.addText(title, { x: 1.35, y: 0.10, w: 9.0, h: 0.38,
    fontSize: 14, bold: true, color: "FFFFFF", fontFace: "Calibri" });

  // subtitle
  slide.addText(subtitle, { x: 1.35, y: 0.48, w: 9.0, h: 0.28,
    fontSize: 9, color: T.acc, fontFace: "Calibri" });

  // right info (period)
  slide.addText(info, { x: 10.5, y: 0.30, w: 2.38, h: 0.26, align: "right",
    fontSize: 8, color: "94A3B8", fontFace: "Calibri" });

  // footer
  slide.addShape("rect", { x: 0, y: FY, w: SW, h: SH - FY,
    fill: { color: T.bgFoot }, line: { color: T.bgFoot, width: 0 } });
  slide.addShape("line", { x: 0, y: FY, w: SW, h: 0,
    line: { color: T.div, width: 0.6 } });
  slide.addText(`${company}  ·  Confidential`, { x: ML, y: FY + 0.08, w: CW, h: 0.24,
    fontSize: 7.5, color: T.textS, align: "center", fontFace: "Calibri" });
}

// ─── KPI card — white face, coloured left bar, dark value ─────────────────────
function kpi(
  slide: PptxGenJS.Slide,
  x: number, y: number, w: number, h: number,
  label: string, value: string, note: string, col: string,
) {
  // white card
  slide.addShape("roundRect", { x, y, w, h,
    fill: { color: T.bgCard }, line: { color: T.bord, width: 0.8 }, rectRadius: 0.08 });
  // coloured left accent bar
  slide.addShape("rect", { x, y: y + 0.08, w: 0.06, h: h - 0.16,
    fill: { color: col }, line: { color: col, width: 0 } });
  // label
  slide.addText(label, { x: x + 0.22, y: y + 0.12, w: w - 0.32, h: 0.26,
    fontSize: 8, color: T.textS, fontFace: "Calibri" });
  // value (dark, large)
  slide.addText(value, { x: x + 0.22, y: y + 0.35, w: w - 0.32, h: 0.58,
    fontSize: 22, bold: true, color: T.textH, fontFace: "Calibri", fit: "shrink" });
  // note
  slide.addText(note, { x: x + 0.22, y: y + 0.90, w: w - 0.32, h: 0.22,
    fontSize: 7.5, color: T.textS, fontFace: "Calibri" });
}

// ─── Section label inside content area ───────────────────────────────────────
function sLabel(slide: PptxGenJS.Slide, text: string, x: number, y: number, w: number) {
  slide.addText(text.toUpperCase(), { x, y, w, h: 0.26,
    fontSize: 7.5, bold: true, color: T.textS, charSpacing: 1.8, fontFace: "Calibri" });
  slide.addShape("line", { x, y: y + 0.25, w, h: 0,
    line: { color: T.div, width: 0.7 } });
}

// ─── Slide 1: Cover ───────────────────────────────────────────────────────────
function addCoverSlide(pres: PptxGenJS, p: PptxPayload) {
  const slide = pres.addSlide();
  slide.background = { color: T.bg };

  // left dark panel
  slide.addShape("rect", { x: 0, y: 0, w: 5.3, h: 6.8,
    fill: { color: T.bgHdr }, line: { color: T.bgHdr, width: 0 } });

  // teal left accent bar
  slide.addShape("rect", { x: 0, y: 0, w: 0.12, h: 6.8,
    fill: { color: T.acc }, line: { color: T.acc, width: 0 } });

  // company name
  slide.addText(p.companyName, { x: 0.28, y: 0.55, w: 4.8, h: 0.65,
    fontSize: 28, bold: true, color: "FFFFFF", fontFace: "Calibri", fit: "shrink" });

  // sub-label
  slide.addText("Finance & Operations Report", { x: 0.28, y: 1.38, w: 4.8, h: 0.32,
    fontSize: 12, color: T.acc, fontFace: "Calibri" });

  // thin teal divider
  slide.addShape("line", { x: 0.28, y: 1.84, w: 4.6, h: 0,
    line: { color: T.acc, width: 1.2 } });

  // main headline
  slide.addText("Financial Performance\nPresentation", { x: 0.28, y: 2.1, w: 4.8, h: 1.8,
    fontSize: 36, bold: true, color: "FFFFFF", fontFace: "Calibri" });

  // period on left panel bottom
  slide.addText(periodInfo(p), { x: 0.28, y: 5.9, w: 4.8, h: 0.32,
    fontSize: 8, color: "94A3B8", fontFace: "Calibri" });

  // right light panel
  slide.addShape("rect", { x: 5.3, y: 0, w: 8.03, h: 6.8,
    fill: { color: T.bgAlt }, line: { color: T.bgAlt, width: 0 } });

  // badges on right panel — stacked
  const badges = [
    { label: "PERIOD",   value: `${p.dateRange.start}  to  ${p.dateRange.end}` },
    { label: "METHOD",   value: p.method },
    { label: "CURRENCY", value: p.currency },
    { label: "MONTHS",   value: String(p.series.length) },
  ];
  const bx = 6.3, bw = 6.0, bh = 0.9;
  badges.forEach((b, i) => {
    const by = 1.6 + i * 1.1;
    slide.addShape("roundRect", { x: bx, y: by, w: bw, h: bh,
      fill: { color: "FFFFFF" }, line: { color: T.bord, width: 0.8 }, rectRadius: 0.08 });
    slide.addShape("rect", { x: bx, y: by + 0.1, w: 0.06, h: bh - 0.2,
      fill: { color: T.acc }, line: { color: T.acc, width: 0 } });
    slide.addText(b.label, { x: bx + 0.22, y: by + 0.08, w: bw - 0.3, h: 0.24,
      fontSize: 7.5, bold: true, color: T.textS, charSpacing: 1.8, fontFace: "Calibri" });
    slide.addText(b.value, { x: bx + 0.22, y: by + 0.34, w: bw - 0.3, h: 0.44,
      fontSize: 17, bold: true, color: T.textH, fontFace: "Calibri", fit: "shrink" });
  });

  // generated-on at bottom of right panel
  slide.addText(`Generated  ${new Date().toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" })}`,
    { x: 5.3, y: 6.3, w: 8.03, h: 0.32, align: "center",
      fontSize: 8, color: T.textS, fontFace: "Calibri" });

  // bottom teal strip
  slide.addShape("rect", { x: 0, y: 6.8, w: SW, h: 0.7,
    fill: { color: T.acc }, line: { color: T.acc, width: 0 } });

  const chips = [
    { label: "PERIOD",   value: `${p.dateRange.start} – ${p.dateRange.end}` },
    { label: "METHOD",   value: p.method },
    { label: "CURRENCY", value: p.currency },
    { label: "MONTHS",   value: `${p.series.length} months` },
  ];
  const chipW = SW / chips.length;
  chips.forEach((c, i) => {
    slide.addText(`${c.label}\n${c.value}`, { x: i * chipW, y: 6.8, w: chipW, h: 0.7,
      align: "center", valign: "middle",
      fontSize: 8.5, bold: false, color: "FFFFFF", fontFace: "Calibri" });
  });
}

// ─── Slide 2: Executive Summary ───────────────────────────────────────────────
function addExecutiveSummarySlide(pres: PptxGenJS, p: PptxPayload) {
  const slide = pres.addSlide();
  chrome(slide, "01", "Executive Summary", "Period performance at a glance", p.companyName, periodInfo(p));

  const margin = p.kpis.profit >= 0 ? p.kpis.revenue > 0 ? (p.kpis.profit / p.kpis.revenue) * 100 : 0 : (p.kpis.profit / p.kpis.revenue) * 100;

  // 4 KPI cards
  const cards = [
    { label: "Total Revenue",  value: fmt(p.kpis.revenue, p.currency),  note: `${p.series.length} months`, col: T.acc },
    { label: "Total Expenses", value: fmt(p.kpis.expenses, p.currency), note: "Operating costs",            col: T.red },
    { label: "Net Profit",     value: fmt(p.kpis.profit, p.currency),   note: p.kpis.profit >= 0 ? "Profitable" : "Loss period", col: p.kpis.profit >= 0 ? T.green : T.red },
    { label: "Profit Margin",  value: pct(margin),                      note: margin >= 20 ? "Healthy" : margin >= 10 ? "Fair" : "Low", col: margin >= 20 ? T.green : margin >= 0 ? T.amber : T.red },
  ];
  const cw = CW / 4 - 0.12;
  cards.forEach((c, i) => kpi(slide, ML + i * (cw + 0.12), 1.08, cw, 1.2, c.label, c.value, c.note, c.col));

  // Monthly table
  sLabel(slide, "Monthly Breakdown", ML, 2.44, CW);
  const hdrFill = { color: T.bgHdr };
  const hdrFont = { bold: true, color: "FFFFFF" as string, fontSize: 8 as number, fontFace: "Calibri" as string };
  const bodyFont = { fontSize: 8 as number, fontFace: "Calibri" as string, color: T.textB };

  const rows: PptxGenJS.TableRow[] = [
    [
      { text: "Month",    options: { ...hdrFont, fill: hdrFill, align: "left" } },
      { text: "Revenue",  options: { ...hdrFont, fill: hdrFill, align: "right" } },
      { text: "Expenses", options: { ...hdrFont, fill: hdrFill, align: "right" } },
      { text: "Profit",   options: { ...hdrFont, fill: hdrFill, align: "right" } },
      { text: "Margin",   options: { ...hdrFont, fill: hdrFill, align: "right" } },
    ],
  ];
  const display = p.series.slice(-6);
  display.forEach((s, i) => {
    const m = s.revenue > 0 ? (s.profit / s.revenue) * 100 : 0;
    const rowFill = { color: i % 2 === 0 ? T.bg : T.bgAlt };
    rows.push([
      { text: mo(s.month),               options: { ...bodyFont, fill: rowFill, align: "left" } },
      { text: fmt(s.revenue, p.currency), options: { ...bodyFont, fill: rowFill, align: "right" } },
      { text: fmt(s.expenses, p.currency),options: { ...bodyFont, fill: rowFill, align: "right" } },
      { text: fmt(s.profit, p.currency),  options: { ...bodyFont, fill: rowFill, align: "right", color: s.profit >= 0 ? T.green : T.red } },
      { text: pct(m),                     options: { ...bodyFont, fill: rowFill, align: "right", color: m >= 0 ? T.green : T.red } },
    ]);
  });
  slide.addTable(rows, {
    x: ML, y: 2.70, w: CW, rowH: 0.38,
    border: { type: "solid", color: T.bord, pt: 0.5 },
  });

  // Insight banner
  const best = p.series.reduce((a, b) => b.profit > a.profit ? b : a, p.series[0]);
  const insightY = 5.22;
  slide.addShape("roundRect", { x: ML, y: insightY, w: CW, h: 0.70,
    fill: { color: "EFF6FF" }, line: { color: T.acc, width: 0.8 }, rectRadius: 0.08 });
  slide.addShape("rect", { x: ML, y: insightY + 0.08, w: 0.06, h: 0.54,
    fill: { color: T.acc }, line: { color: T.acc, width: 0 } });
  const insightText = best
    ? `Best month: ${mo(best.month)} with ${fmt(best.profit, p.currency)} profit. Period total revenue ${fmt(p.kpis.revenue, p.currency)}, expenses ${fmt(p.kpis.expenses, p.currency)}, net profit ${fmt(p.kpis.profit, p.currency)}.`
    : `Period total revenue ${fmt(p.kpis.revenue, p.currency)}, expenses ${fmt(p.kpis.expenses, p.currency)}, net profit ${fmt(p.kpis.profit, p.currency)}.`;
  slide.addText(insightText, { x: ML + 0.22, y: insightY + 0.12, w: CW - 0.32, h: 0.46,
    fontSize: 8.5, color: T.textB, fontFace: "Calibri" });
}

// ─── Slide 3: P&L Monthly Overview ───────────────────────────────────────────
function addPnlChartSlide(pres: PptxGenJS, p: PptxPayload) {
  const slide = pres.addSlide();
  chrome(slide, "02", "Profit & Loss", "Monthly revenue, expenses & profit", p.companyName, periodInfo(p));

  const labels = p.series.map((s) => mo(s.month));

  // Left: Revenue vs Expenses bar chart
  slide.addChart(
    pres.ChartType.bar,
    [
      { name: "Revenue",  labels, values: p.series.map((s) => s.revenue) },
      { name: "Expenses", labels, values: p.series.map((s) => s.expenses) },
    ],
    {
      ...CHART_DEFAULTS,
      x: ML, y: 1.05, w: 8.2, h: 4.72,
      barDir: "col",
      barGrouping: "clustered",
      chartColors: [T.acc, T.red],
      legendPos: "b",
      legendFontSize: 8,
      showLegend: true,
      dataLabelFontSize: 0,
      showValue: false,
      title: "Revenue vs Expenses",
      titleFontSize: 9,
      titleColor: T.textH,
    } as any
  );

  // Right: Profit trend line chart
  slide.addChart(
    pres.ChartType.line,
    [{ name: "Net Profit", labels, values: p.series.map((s) => s.profit) }],
    {
      ...CHART_DEFAULTS,
      x: 8.85, y: 1.05, w: 4.03, h: 4.72,
      chartColors: [p.kpis.profit >= 0 ? T.green : T.red],
      lineSize: 2.5,
      showLegend: false,
      showValue: false,
      title: "Profit Trend",
      titleFontSize: 9,
      titleColor: T.textH,
    } as any
  );

  // 5 stat boxes at bottom
  const totalRev  = p.kpis.revenue;
  const totalExp  = p.kpis.expenses;
  const totalProf = p.kpis.profit;
  const margin    = totalRev > 0 ? (totalProf / totalRev) * 100 : 0;
  const avgMonthly = p.series.length > 0 ? totalRev / p.series.length : 0;

  const stats = [
    { label: "Total Revenue",   value: fmt(totalRev, p.currency),  col: T.acc },
    { label: "Total Expenses",  value: fmt(totalExp, p.currency),  col: T.red },
    { label: "Net Profit",      value: fmt(totalProf, p.currency), col: totalProf >= 0 ? T.green : T.red },
    { label: "Profit Margin",   value: pct(margin),                col: margin >= 15 ? T.green : T.amber },
    { label: "Avg Monthly Rev", value: fmt(avgMonthly, p.currency),col: T.viol },
  ];
  const sw = CW / stats.length - 0.08;
  const sy = 5.90;
  stats.forEach((s, i) => {
    const sx = ML + i * (sw + 0.08);
    slide.addShape("roundRect", { x: sx, y: sy, w: sw, h: 0.95,
      fill: { color: T.bgCard }, line: { color: T.bord, width: 0.8 }, rectRadius: 0.06 });
    slide.addShape("rect", { x: sx, y: sy + 0.07, w: 0.06, h: 0.81,
      fill: { color: s.col }, line: { color: s.col, width: 0 } });
    slide.addText(s.label, { x: sx + 0.18, y: sy + 0.08, w: sw - 0.24, h: 0.22,
      fontSize: 7, color: T.textS, fontFace: "Calibri" });
    slide.addText(s.value, { x: sx + 0.18, y: sy + 0.30, w: sw - 0.24, h: 0.50,
      fontSize: 14, bold: true, color: T.textH, fontFace: "Calibri", fit: "shrink" });
  });
}

// ─── Slide 4: Expense Breakdown ───────────────────────────────────────────────
function addExpenseBreakdownSlide(pres: PptxGenJS, p: PptxPayload) {
  const slide = pres.addSlide();
  chrome(slide, "03", "Expense Analysis", "Where the money is going", p.companyName, periodInfo(p));

  const items = p.expenseBreakdown.slice(0, 9);
  const labels = items.map((x) => x.name.length > 18 ? x.name.slice(0, 17) + "…" : x.name);

  // Doughnut chart (left)
  slide.addChart(
    pres.ChartType.doughnut,
    [{ name: "Expenses", labels, values: items.map((x) => x.value) }],
    {
      ...CHART_DEFAULTS,
      x: ML, y: 1.05, w: 5.7, h: 5.56,
      chartColors: T.cc,
      holeSize: 55,
      showLegend: true,
      legendPos: "b",
      legendFontSize: 7.5,
      dataLabelFontSize: 0,
      showValue: false,
    } as any
  );

  // Category table (right)
  const tx = 6.4, tw = 6.48;
  sLabel(slide, "Category Breakdown", tx, 1.05, tw);

  const hdrFill = { color: T.bgHdr };
  const hdrFont = { bold: true, color: "FFFFFF" as string, fontSize: 8 as number, fontFace: "Calibri" as string };
  const bodyFont = { fontSize: 8 as number, fontFace: "Calibri" as string, color: T.textB };

  const total = items.reduce((s, x) => s + x.value, 0);
  const rows: PptxGenJS.TableRow[] = [
    [
      { text: "Category", options: { ...hdrFont, fill: hdrFill, align: "left" } },
      { text: "Amount",   options: { ...hdrFont, fill: hdrFill, align: "right" } },
      { text: "Share",    options: { ...hdrFont, fill: hdrFill, align: "right" } },
    ],
  ];
  items.slice(0, 8).forEach((item, i) => {
    const share = total > 0 ? (item.value / total) * 100 : 0;
    const rowFill = { color: i % 2 === 0 ? T.bg : T.bgAlt };
    const name = item.name.length > 26 ? item.name.slice(0, 25) + "…" : item.name;
    rows.push([
      { text: name,                        options: { ...bodyFont, fill: rowFill, align: "left" } },
      { text: fmt(item.value, p.currency), options: { ...bodyFont, fill: rowFill, align: "right" } },
      { text: pct(share).replace("+",""),  options: { ...bodyFont, fill: rowFill, align: "right", color: T.acc } },
    ]);
  });
  slide.addTable(rows, {
    x: tx, y: 1.30, w: tw, rowH: 0.40,
    border: { type: "solid", color: T.bord, pt: 0.5 },
  });

  // Total box fixed at bottom
  const TOTAL_Y = 5.36;
  slide.addShape("roundRect", { x: tx, y: TOTAL_Y, w: tw, h: 0.72,
    fill: { color: "FEF2F2" }, line: { color: T.red, width: 0.8 }, rectRadius: 0.06 });
  slide.addShape("rect", { x: tx, y: TOTAL_Y + 0.08, w: 0.06, h: 0.56,
    fill: { color: T.red }, line: { color: T.red, width: 0 } });
  slide.addText("Total Expenses", { x: tx + 0.20, y: TOTAL_Y + 0.08, w: tw - 0.28, h: 0.22,
    fontSize: 7.5, color: T.textS, fontFace: "Calibri" });
  slide.addText(fmt(p.kpis.expenses, p.currency), { x: tx + 0.20, y: TOTAL_Y + 0.30, w: tw - 0.28, h: 0.34,
    fontSize: 16, bold: true, color: T.red, fontFace: "Calibri", fit: "shrink" });
}

// ─── Slide 5: Cash & Bank ─────────────────────────────────────────────────────
function addCashSlide(pres: PptxGenJS, p: PptxPayload) {
  const slide = pres.addSlide();
  chrome(slide, "04", "Cash & Bank Position", "Liquidity across accounts", p.companyName, periodInfo(p));

  // Currency KPI boxes
  const currencies = Object.entries(p.cashTotals);
  const kpiW = currencies.length > 0 ? Math.min(3.8, CW / currencies.length - 0.12) : CW;
  currencies.forEach(([cur, total], i) => {
    kpi(slide, ML + i * (kpiW + 0.12), 1.05, kpiW, 1.1,
      `${cur} Balance`, fmt(total, cur), `${p.cashAccounts.filter(a => a.currency === cur).length} account(s)`,
      total >= 0 ? T.green : T.red);
  });
  if (currencies.length === 0) {
    kpi(slide, ML, 1.05, CW, 1.1, "Total Cash", fmt(0, p.currency), "No accounts found", T.acc);
  }

  // Accounts table
  sLabel(slide, "Account Detail", ML, 2.28, CW);

  const hdrFill = { color: T.bgHdr };
  const hdrFont = { bold: true, color: "FFFFFF" as string, fontSize: 8 as number, fontFace: "Calibri" as string };
  const bodyFont = { fontSize: 8 as number, fontFace: "Calibri" as string, color: T.textB };

  const rows: PptxGenJS.TableRow[] = [
    [
      { text: "Account",  options: { ...hdrFont, fill: hdrFill, align: "left" } },
      { text: "Currency", options: { ...hdrFont, fill: hdrFill, align: "center" } },
      { text: "Balance",  options: { ...hdrFont, fill: hdrFill, align: "right" } },
    ],
  ];
  p.cashAccounts.slice(0, 9).forEach((a, i) => {
    const rowFill = { color: i % 2 === 0 ? T.bg : T.bgAlt };
    const name = a.name.length > 36 ? a.name.slice(0, 35) + "…" : a.name;
    rows.push([
      { text: name,                             options: { ...bodyFont, fill: rowFill, align: "left" } },
      { text: a.currency,                       options: { ...bodyFont, fill: rowFill, align: "center" } },
      { text: fmt(a.currentBalance, a.currency),options: { ...bodyFont, fill: rowFill, align: "right", color: a.currentBalance >= 0 ? T.textB : T.red } },
    ]);
  });
  slide.addTable(rows, {
    x: ML, y: 2.52, w: CW, rowH: 0.44,
    border: { type: "solid", color: T.bord, pt: 0.5 },
  });
}

// ─── Slide 6: AR / AP ─────────────────────────────────────────────────────────
function addArApSlide(pres: PptxGenJS, p: PptxPayload) {
  const slide = pres.addSlide();
  chrome(slide, "05", "Receivables & Payables", "Aging and liquidity health", p.companyName, periodInfo(p));

  if (!p.arAp) {
    slide.addText("AR/AP data not available for this period.", {
      x: ML, y: 3.0, w: CW, h: 0.5, align: "center", fontSize: 12, color: T.textS, fontFace: "Calibri",
    });
    return;
  }

  const { totalPayables, totalReceivables, apAging } = p.arAp;
  const netPos = totalReceivables - totalPayables;

  // Health banner
  const healthColor = netPos >= 0 ? T.green : T.red;
  const healthBg    = netPos >= 0 ? "F0FDF4" : "FEF2F2";
  slide.addShape("roundRect", { x: ML, y: 1.05, w: CW, h: 0.52,
    fill: { color: healthBg }, line: { color: healthColor, width: 0.8 }, rectRadius: 0.06 });
  slide.addText(
    netPos >= 0
      ? `Healthy: Receivables exceed Payables by ${fmt(netPos, p.currency)} — net positive liquidity position.`
      : `Alert: Payables exceed Receivables by ${fmt(Math.abs(netPos), p.currency)} — monitor cash outflows.`,
    { x: ML + 0.18, y: 1.10, w: CW - 0.26, h: 0.36, fontSize: 8.5, color: healthColor, fontFace: "Calibri", bold: true }
  );

  // 4 KPI cards
  const cards = [
    { label: "Total Receivables", value: fmt(totalReceivables, p.currency), note: "Owed to you",      col: T.green },
    { label: "Total Payables",    value: fmt(totalPayables, p.currency),    note: "Owed by you",      col: T.red },
    { label: "Net Position",      value: fmt(netPos, p.currency),           note: netPos >= 0 ? "Surplus" : "Deficit", col: netPos >= 0 ? T.green : T.red },
    { label: "AP Vendors",        value: String(apAging.length),            note: "With open balances", col: T.amber },
  ];
  const cw = CW / 4 - 0.12;
  cards.forEach((c, i) => kpi(slide, ML + i * (cw + 0.12), 1.68, cw, 1.05, c.label, c.value, c.note, c.col));

  // AP Aging table
  sLabel(slide, "AP Aging Detail", ML, 2.85, CW);

  const hdrFill = { color: T.bgHdr };
  const hdrFont = { bold: true, color: "FFFFFF" as string, fontSize: 7.5 as number, fontFace: "Calibri" as string };
  const bodyFont = { fontSize: 7.5 as number, fontFace: "Calibri" as string, color: T.textB };

  const rows: PptxGenJS.TableRow[] = [
    [
      { text: "Vendor",   options: { ...hdrFont, fill: hdrFill, align: "left" } },
      { text: "Current",  options: { ...hdrFont, fill: hdrFill, align: "right" } },
      { text: "1–30d",    options: { ...hdrFont, fill: hdrFill, align: "right" } },
      { text: "31–60d",   options: { ...hdrFont, fill: hdrFill, align: "right" } },
      { text: "61–90d",   options: { ...hdrFont, fill: hdrFill, align: "right" } },
      { text: "90d+",     options: { ...hdrFont, fill: hdrFill, align: "right" } },
      { text: "Total",    options: { ...hdrFont, fill: hdrFill, align: "right" } },
    ],
  ];
  apAging.slice(0, 7).forEach((v, i) => {
    const rowFill = { color: i % 2 === 0 ? T.bg : T.bgAlt };
    const name = v.vendor.length > 20 ? v.vendor.slice(0, 19) + "…" : v.vendor;
    rows.push([
      { text: name,                         options: { ...bodyFont, fill: rowFill, align: "left" } },
      { text: fmt(v.current, p.currency),   options: { ...bodyFont, fill: rowFill, align: "right" } },
      { text: fmt(v["1_30"], p.currency),   options: { ...bodyFont, fill: rowFill, align: "right" } },
      { text: fmt(v["31_60"], p.currency),  options: { ...bodyFont, fill: rowFill, align: "right" } },
      { text: fmt(v["61_90"], p.currency),  options: { ...bodyFont, fill: rowFill, align: "right" } },
      { text: fmt(v["91_plus"], p.currency),options: { ...bodyFont, fill: rowFill, align: "right", color: v["91_plus"] > 0 ? T.red : T.textB } },
      { text: fmt(v.total, p.currency),     options: { ...bodyFont, fill: rowFill, align: "right", bold: true } },
    ]);
  });
  slide.addTable(rows, {
    x: ML, y: 3.10, w: CW, rowH: 0.44,
    border: { type: "solid", color: T.bord, pt: 0.5 },
  });
}

// ─── Slide 7: Forecast ────────────────────────────────────────────────────────
function addForecastSlide(pres: PptxGenJS, p: PptxPayload) {
  const slide = pres.addSlide();
  chrome(slide, "06", "6-Month Forecast", "Projected revenue, expenses & profit", p.companyName, periodInfo(p));

  if (!p.forecast) {
    slide.addText("Forecast data not available — need at least 3 months of history.", {
      x: ML, y: 3.0, w: CW, h: 0.5, align: "center", fontSize: 12, color: T.textS, fontFace: "Calibri",
    });
    return;
  }

  const { forecast, averages, trends, benchmarks } = p.forecast;

  // 4 KPI boxes
  const kpiItems = [
    { label: "Avg Monthly Revenue",  value: fmt(averages.avgMonthlyRevenue, p.currency),  note: `MoM trend: ${pct(trends.revenueMoM)}`,   col: T.acc },
    { label: "Avg Monthly Expenses", value: fmt(averages.avgMonthlyOpex, p.currency),     note: `MoM trend: ${pct(trends.expensesMoM)}`,  col: T.red },
    { label: "Avg Monthly Profit",   value: fmt(averages.avgMonthlyProfit, p.currency),   note: "Historical average",                      col: averages.avgMonthlyProfit >= 0 ? T.green : T.red },
    { label: "Forecast Horizon",     value: `${p.forecast.horizon} months`,               note: "Forward projection",                      col: T.viol },
  ];
  const kw = CW / 4 - 0.12;
  kpiItems.forEach((k, i) => kpi(slide, ML + i * (kw + 0.12), 1.05, kw, 1.05, k.label, k.value, k.note, k.col));

  // Forecast line chart (full width)
  const fLabels = forecast.map((f) => mo(f.month));
  slide.addChart(
    pres.ChartType.line,
    [
      { name: "Revenue",  labels: fLabels, values: forecast.map((f) => f.revenue) },
      { name: "Expenses", labels: fLabels, values: forecast.map((f) => f.opex) },
      { name: "Profit",   labels: fLabels, values: forecast.map((f) => f.profit) },
    ],
    {
      ...CHART_DEFAULTS,
      x: ML, y: 2.22, w: CW, h: 3.62,
      chartColors: [T.acc, T.red, T.green],
      lineSize: 2.2,
      showLegend: true,
      legendPos: "b",
      legendFontSize: 8,
      showValue: false,
      title: "6-Month Projection",
      titleFontSize: 9,
      titleColor: T.textH,
    } as any
  );

  // 4 benchmark boxes at bottom
  const benches = [
    { label: "Breakeven Revenue",  value: fmt(benchmarks.breakevenRevenue, p.currency), col: T.amber },
    { label: "10% Margin Target",  value: fmt(benchmarks.margin10, p.currency),          col: T.acc },
    { label: "20% Margin Target",  value: fmt(benchmarks.margin20, p.currency),          col: T.green },
    { label: "30% Margin Target",  value: fmt(benchmarks.margin30, p.currency),          col: T.viol },
  ];
  const bw = CW / 4 - 0.10;
  const BY = 5.98;
  benches.forEach((b, i) => {
    const bx = ML + i * (bw + 0.10);
    slide.addShape("roundRect", { x: bx, y: BY, w: bw, h: 0.82,
      fill: { color: T.bgCard }, line: { color: T.bord, width: 0.8 }, rectRadius: 0.06 });
    slide.addShape("rect", { x: bx, y: BY + 0.07, w: 0.06, h: 0.68,
      fill: { color: b.col }, line: { color: b.col, width: 0 } });
    slide.addText(b.label, { x: bx + 0.18, y: BY + 0.07, w: bw - 0.24, h: 0.22,
      fontSize: 7, color: T.textS, fontFace: "Calibri" });
    slide.addText(b.value, { x: bx + 0.18, y: BY + 0.28, w: bw - 0.24, h: 0.46,
      fontSize: 13, bold: true, color: T.textH, fontFace: "Calibri", fit: "shrink" });
  });
}

// ─── Slide 8: Retained Earnings ───────────────────────────────────────────────
function addRetainedSlide(pres: PptxGenJS, p: PptxPayload) {
  const slide = pres.addSlide();
  chrome(slide, "07", "Retained Earnings", "Net profit, assets and investments", p.companyName, periodInfo(p));

  if (!p.retained) {
    slide.addText("Retained earnings data not available for this period.", {
      x: ML, y: 3.0, w: CW, h: 0.5, align: "center", fontSize: 12, color: T.textS, fontFace: "Calibri",
    });
    return;
  }

  const { netProfit, longTermAssets, totalInvestments, retainedEarning } = p.retained;

  // 4 KPI boxes
  const kpiItems = [
    { label: "Net Profit",        value: fmt(netProfit, p.currency),       note: "Period earnings",     col: netProfit >= 0 ? T.green : T.red },
    { label: "Long-Term Assets",  value: fmt(longTermAssets, p.currency),  note: "Fixed + Long-term",   col: T.acc },
    { label: "Total Investments", value: fmt(totalInvestments, p.currency),note: "Portfolio value",      col: T.viol },
    { label: "Retained Earnings", value: fmt(retainedEarning, p.currency), note: "Cumulative equity",   col: retainedEarning >= 0 ? T.green : T.red },
  ];
  const kw = CW / 4 - 0.12;
  kpiItems.forEach((k, i) => kpi(slide, ML + i * (kw + 0.12), 1.05, kw, 1.0, k.label, k.value, k.note, k.col));

  // Left: horizontal bar chart
  const barLabels = ["Net Profit", "Long-Term Assets", "Investments", "Retained Earnings"];
  const barValues = [netProfit, longTermAssets, totalInvestments, retainedEarning];
  slide.addChart(
    pres.ChartType.bar,
    [{ name: "Value", labels: barLabels, values: barValues }],
    {
      ...CHART_DEFAULTS,
      x: ML, y: 2.18, w: 6.8, h: 4.65,
      barDir: "bar",
      chartColors: [T.acc, T.green, T.viol, T.amber],
      showLegend: false,
      showValue: true,
      dataLabelFontSize: 7.5,
      dataLabelColor: T.textB,
      title: "Balance Overview",
      titleFontSize: 9,
      titleColor: T.textH,
    } as any
  );

  // Right: doughnut of the four components (absolute values)
  const dLabels = ["Net Profit", "LT Assets", "Investments", "Retained Earnings"];
  const dValues = barValues.map(Math.abs);
  slide.addChart(
    pres.ChartType.doughnut,
    [{ name: "Composition", labels: dLabels, values: dValues }],
    {
      ...CHART_DEFAULTS,
      x: 7.5, y: 2.18, w: 5.38, h: 4.65,
      chartColors: [T.acc, T.green, T.viol, T.amber],
      holeSize: 55,
      showLegend: true,
      legendPos: "b",
      legendFontSize: 8,
      showValue: false,
      title: "Equity Composition",
      titleFontSize: 9,
      titleColor: T.textH,
    } as any
  );
}

// ─── Slide 9: Closing ─────────────────────────────────────────────────────────
function addClosingSlide(pres: PptxGenJS, p: PptxPayload) {
  const slide = pres.addSlide();
  slide.background = { color: T.bgHdr };

  // top teal accent bar
  slide.addShape("rect", { x: 0, y: 0, w: SW, h: 0.12,
    fill: { color: T.acc }, line: { color: T.acc, width: 0 } });
  // bottom teal accent bar
  slide.addShape("rect", { x: 0, y: SH - 0.12, w: SW, h: 0.12,
    fill: { color: T.acc }, line: { color: T.acc, width: 0 } });

  // centred white panel
  slide.addShape("roundRect", { x: 2.0, y: 1.6, w: 9.33, h: 4.2,
    fill: { color: "FFFFFF" }, line: { color: T.bord, width: 0.8 }, rectRadius: 0.12 });

  // Thank You
  slide.addText("Thank You", { x: 2.2, y: 1.85, w: 8.93, h: 1.4,
    fontSize: 56, bold: true, color: T.textH, fontFace: "Calibri", align: "center" });

  // subtitle
  slide.addText("Questions & Discussion", { x: 2.2, y: 3.28, w: 8.93, h: 0.48,
    fontSize: 18, color: T.acc, fontFace: "Calibri", align: "center" });

  // thin divider
  slide.addShape("line", { x: 3.5, y: 3.88, w: 6.33, h: 0,
    line: { color: T.div, width: 0.7 } });

  // footer info
  slide.addText(`${p.companyName}  ·  ${periodInfo(p)}`, { x: 2.2, y: 4.00, w: 8.93, h: 0.38,
    fontSize: 9, color: T.textS, fontFace: "Calibri", align: "center" });

  slide.addText("Confidential — For Internal Use Only", { x: 2.2, y: 4.44, w: 8.93, h: 0.28,
    fontSize: 8, color: T.textS, fontFace: "Calibri", align: "center" });
}

// ─── Entry point ──────────────────────────────────────────────────────────────
export async function buildPresentation(p: PptxPayload): Promise<Buffer> {
  const pres = new PptxGenJS();
  pres.layout = "LAYOUT_WIDE";
  pres.author  = p.companyName;
  pres.company = p.companyName;
  pres.subject = "Finance & Operations Report";
  pres.title   = `Finance Report ${p.dateRange.start} – ${p.dateRange.end}`;

  addCoverSlide(pres, p);
  addExecutiveSummarySlide(pres, p);
  addPnlChartSlide(pres, p);
  addExpenseBreakdownSlide(pres, p);
  addCashSlide(pres, p);
  addArApSlide(pres, p);
  if (p.forecast) addForecastSlide(pres, p);
  if (p.retained) addRetainedSlide(pres, p);
  addClosingSlide(pres, p);

  return pres.write({ outputType: "nodebuffer" }) as Promise<Buffer>;
}
