// src/lib/pptx-generator.ts — Dark corporate theme
import PptxGenJS from "pptxgenjs";

// ─── Canvas ──────────────────────────────────────────────────────────────────
const SW = 13.33;
const SH = 7.5;
const ML = 0.45;
const CW = 12.43;

// Layout zones
const KPI_Y = 1.68;   // KPI cards row Y
const KPI_H = 1.18;   // KPI cards row height
const CHT_Y = 3.00;   // chart/content area Y
const CHT_H = 3.44;   // chart/content area height  (ends at 6.44)
const INS_Y = 6.44;   // bottom banner Y
const INS_H = 0.92;   // bottom banner height

// ─── Payload ─────────────────────────────────────────────────────────────────
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

// ─── Theme ───────────────────────────────────────────────────────────────────
const T = {
  bg:     "0B1A2E",   // very dark navy
  bgCard: "0F2847",   // card face
  bgPanel:"0D2240",   // chart panel
  gold:   "C9A455",   // gold accent (section numbers, borders)
  teal:   "00C4D4",   // bright teal (values, highlights)
  tealD:  "0A7A9C",   // darker teal
  white:  "FFFFFF",
  textD:  "A8C0D8",   // dim text (labels)
  textM:  "7A9CC0",   // muted text (axis, sub-labels)
  red:    "E05252",
  green:  "22C55E",
  amber:  "F59E0B",
  viol:   "9B7AED",
  bord:   "1A3A60",   // subtle dark border
  cc:     ["00C4D4","C9A455","E05252","F59E0B","22C55E","9B7AED","0EA5E9","F97316"],
};

// ─── Formatters ──────────────────────────────────────────────────────────────
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

// ─── Chart defaults ───────────────────────────────────────────────────────────
const CHART_DEFAULTS = {
  valAxisLabelFontSize: 8,
  catAxisLabelFontSize: 8,
  valAxisLabelColor:    "7A9CC0",
  catAxisLabelColor:    "7A9CC0",
  valAxisLineShow:      false,
  valGridLine:  { style: "solid" as const, color: "1A3A60", size: 0.5 },
  chartArea:    { fill: { color: "0D2240" } },
  plotArea:     { fill: { color: "0D2240" } },
  dataLabelFontSize: 8,
  dataLabelColor:    "FFFFFF",
};

// ─── Chrome — breadcrumb + section header on every content slide ──────────────
function chrome(
  slide: PptxGenJS.Slide,
  sectionNum: string,
  title: string,
  subtitle: string,
  company: string,
  dateRange: { start: string; end: string },
  method: string,
) {
  slide.background = { color: T.bg };

  // Breadcrumb
  slide.addText(
    `Finance & Operations Report  |  ${dateRange.start} – ${dateRange.end}  |  ${method} Basis`,
    { x: ML, y: 0.05, w: 8.8, h: 0.26, fontSize: 8, color: T.teal, fontFace: "Calibri" }
  );

  // Logo circle + company name (top right)
  const abbr = company.split(/\s+/).map((w) => w[0] ?? "").join("").slice(0, 3).toUpperCase();
  slide.addShape("ellipse", { x: 11.36, y: 0.02, w: 0.54, h: 0.54,
    fill: { color: T.gold }, line: { color: T.gold, width: 0 } });
  slide.addText(abbr, { x: 11.36, y: 0.02, w: 0.54, h: 0.54,
    fontSize: 10, bold: true, color: T.bg, align: "center", valign: "middle", fontFace: "Calibri" });
  slide.addText(company, { x: 11.96, y: 0.04, w: 1.32, h: 0.48,
    fontSize: 10, bold: true, color: T.white, fontFace: "Calibri", fit: "shrink", valign: "middle" });

  // Gold separator line below breadcrumb
  slide.addShape("line", { x: 0, y: 0.34, w: SW, h: 0,
    line: { color: T.gold, width: 0.5 } });

  // Section number (large, gold)
  slide.addText(sectionNum, { x: ML, y: 0.42, w: 1.18, h: 1.04,
    fontSize: 60, bold: true, color: T.gold, fontFace: "Calibri", valign: "middle" });

  // Gold underline below section number
  slide.addShape("line", { x: ML, y: 1.48, w: 1.08, h: 0,
    line: { color: T.gold, width: 2.5 } });

  // Vertical gold separator
  slide.addShape("line", { x: 1.74, y: 0.42, w: 0, h: 1.10,
    line: { color: T.gold, width: 1.2 } });

  // Title
  slide.addText(title, { x: 1.92, y: 0.44, w: 9.4, h: 0.76,
    fontSize: 30, bold: true, color: T.white, fontFace: "Calibri", fit: "shrink" });

  // Subtitle
  slide.addText(subtitle, { x: 1.92, y: 1.20, w: 9.4, h: 0.30,
    fontSize: 10, color: T.teal, fontFace: "Calibri" });
}

// ─── KPI card ─────────────────────────────────────────────────────────────────
function kpiCard(
  slide: PptxGenJS.Slide,
  x: number, y: number, w: number, h: number,
  label: string, value: string, sub: string, col: string,
) {
  // Card body
  slide.addShape("roundRect", { x, y, w, h,
    fill: { color: T.bgCard }, line: { color: col, width: 1.0 }, rectRadius: 0.06 });

  // Icon circle
  const iS = 0.58, iX = x + 0.14, iY = y + (h - iS) / 2;
  slide.addShape("ellipse", { x: iX, y: iY, w: iS, h: iS,
    fill: { color: T.bg }, line: { color: col, width: 1.4 } });

  // Mini bar-chart icon inside circle
  const bW = 0.07, bMaxH = 0.22, bBase = iY + iS * 0.72;
  ([0.55, 1.0, 0.75] as const).forEach((frac, i) => {
    const bH = bMaxH * frac;
    slide.addShape("rect", {
      x: iX + 0.10 + i * (bW + 0.04), y: bBase - bH, w: bW, h: bH,
      fill: { color: col }, line: { color: col, width: 0 },
    });
  });

  // Label
  slide.addText(label, { x: x + 0.86, y: y + 0.10, w: w - 0.96, h: 0.28,
    fontSize: 8.5, color: T.textD, fontFace: "Calibri" });

  // Value
  slide.addText(value, { x: x + 0.86, y: y + 0.36, w: w - 0.96, h: 0.60,
    fontSize: 20, bold: true, color: col, fontFace: "Calibri", fit: "shrink" });

  // Sub label
  if (sub) {
    slide.addText(sub, { x: x + 0.86, y: y + 0.92, w: w - 0.96, h: 0.20,
      fontSize: 7.5, color: T.textM, fontFace: "Calibri" });
  }
}

// ─── Content panel (dark bg + teal title + gold underline) ───────────────────
function panel(
  slide: PptxGenJS.Slide,
  x: number, y: number, w: number, h: number,
  title?: string,
) {
  slide.addShape("roundRect", { x, y, w, h,
    fill: { color: T.bgPanel }, line: { color: T.bord, width: 0.7 }, rectRadius: 0.06 });
  if (title) {
    slide.addText(title, { x: x + 0.18, y: y + 0.10, w: w - 0.26, h: 0.24,
      fontSize: 9, bold: true, color: T.teal, fontFace: "Calibri" });
    slide.addShape("line", { x: x + 0.18, y: y + 0.36, w: Math.min(1.6, w - 0.28), h: 0,
      line: { color: T.gold, width: 1.2 } });
  }
}

// ─── Star banner (bottom of slide) ───────────────────────────────────────────
function starBanner(
  slide: PptxGenJS.Slide,
  runs: Array<{ text: string; teal?: boolean }>,
) {
  slide.addShape("roundRect", { x: ML, y: INS_Y, w: CW, h: INS_H,
    fill: { color: T.bgCard }, line: { color: T.gold, width: 0.8 }, rectRadius: 0.06 });

  // Gold star circle
  const cS = 0.58, cX = ML + 0.14, cY = INS_Y + (INS_H - cS) / 2;
  slide.addShape("ellipse", { x: cX, y: cY, w: cS, h: cS,
    fill: { color: T.bgCard }, line: { color: T.gold, width: 1.5 } });
  slide.addText("★", { x: cX, y: cY, w: cS, h: cS,
    fontSize: 22, color: T.gold, align: "center", valign: "middle", fontFace: "Calibri" });

  // Rich-text message
  const parts = runs.map((r) => ({
    text: r.text,
    options: { color: r.teal ? T.teal : T.white, bold: !r.teal } as PptxGenJS.TextPropsOptions,
  }));
  slide.addText(parts, { x: ML + 0.88, y: INS_Y + 0.08, w: CW - 1.02, h: INS_H - 0.16,
    fontSize: 12, fontFace: "Calibri", valign: "middle" });
}

// ─── Slide 1: Cover ──────────────────────────────────────────────────────────
function addCoverSlide(pres: PptxGenJS, p: PptxPayload) {
  const slide = pres.addSlide();
  slide.background = { color: T.bg };

  // Decorative diagonal shapes (top right)
  slide.addShape("rect", { x: 7.8, y: -0.3, w: 3.2, h: 4.2,
    fill: { color: "0D2240" }, line: { color: T.teal, width: 0.8 }, rotate: 20 });
  slide.addShape("rect", { x: 8.6, y: -0.5, w: 2.6, h: 4.0,
    fill: { color: "091828" }, line: { color: T.gold, width: 0.6 }, rotate: 20 });

  // Company abbreviation circle (top left)
  const abbr = p.companyName.split(/\s+/).map((w) => w[0] ?? "").join("").slice(0, 3).toUpperCase();
  slide.addShape("ellipse", { x: ML, y: 0.30, w: 1.60, h: 1.60,
    fill: { color: T.bgCard }, line: { color: T.gold, width: 2.0 } });
  slide.addText(abbr, { x: ML, y: 0.30, w: 1.60, h: 1.60,
    fontSize: 32, bold: true, color: T.gold, align: "center", valign: "middle", fontFace: "Calibri" });

  // Gold underline decoration below logo
  slide.addShape("line", { x: ML + 0.28, y: 2.10, w: 1.04, h: 0,
    line: { color: T.gold, width: 1.5 } });

  // Company name (large, white)
  slide.addText(p.companyName, { x: ML, y: 2.30, w: 6.8, h: 0.92,
    fontSize: 38, bold: true, color: T.white, fontFace: "Calibri", fit: "shrink" });

  // Thin teal line under company name
  slide.addShape("line", { x: ML, y: 3.30, w: 3.8, h: 0,
    line: { color: T.teal, width: 1.5 } });

  // "Finance & Operations Report" subtitle
  slide.addText("Finance & Operations Report", { x: ML, y: 3.44, w: 6.8, h: 0.58,
    fontSize: 22, color: T.teal, fontFace: "Calibri", bold: false });

  // Info rows with icons
  const infos = [
    { icon: "▦", label: `Period:  ${p.dateRange.start}  to  ${p.dateRange.end}` },
    { icon: "⊞", label: `${p.method} Basis` },
    { icon: "₨", label: `Currency: ${p.currency}` },
    { icon: "▣", label: `Generated on  ${new Date().toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" })}` },
  ];
  infos.forEach((info, i) => {
    const iy = 4.20 + i * 0.46;
    slide.addShape("ellipse", { x: ML, y: iy + 0.04, w: 0.34, h: 0.34,
      fill: { color: T.bgCard }, line: { color: T.teal, width: 0.8 } });
    slide.addText(info.icon, { x: ML, y: iy + 0.04, w: 0.34, h: 0.34,
      fontSize: 9, color: T.teal, align: "center", valign: "middle" });
    slide.addShape("line", { x: ML + 0.44, y: iy + 0.21, w: 0, h: 0.20,
      line: { color: T.bord, width: 0.8 } });
    slide.addText(info.label, { x: ML + 0.56, y: iy + 0.04, w: 6.0, h: 0.36,
      fontSize: 11, color: i === 3 ? T.gold : T.white, fontFace: "Calibri",
      bold: i === 3 });
  });

  // Confidential badge
  slide.addShape("roundRect", { x: ML, y: 6.68, w: 2.8, h: 0.40,
    fill: { color: T.bgCard }, line: { color: T.bord, width: 0.8 }, rectRadius: 0.04 });
  slide.addText("🔒  Confidential — For Internal Use Only", { x: ML + 0.12, y: 6.68, w: 2.56, h: 0.40,
    fontSize: 8, color: T.textM, fontFace: "Calibri", valign: "middle" });
}

// ─── Numbered insights panel (right column) ───────────────────────────────────
function insightsPanel(
  slide: PptxGenJS.Slide,
  x: number, y: number, w: number, h: number,
  items: Array<{ text: string; col?: string }>,
) {
  panel(slide, x, y, w, h, "Key Insights");
  const rowH = (h - 0.52) / Math.max(items.length, 1);
  items.slice(0, 5).forEach((item, i) => {
    const ry = y + 0.52 + i * rowH;
    const col = item.col ?? T.teal;
    // Circle
    slide.addShape("ellipse", { x: x + 0.16, y: ry + (rowH - 0.34) / 2, w: 0.34, h: 0.34,
      fill: { color: T.bg }, line: { color: col, width: 1.0 } });
    slide.addText("◉", { x: x + 0.16, y: ry + (rowH - 0.34) / 2, w: 0.34, h: 0.34,
      fontSize: 9, color: col, align: "center", valign: "middle" });
    // Text
    slide.addText(item.text, { x: x + 0.60, y: ry, w: w - 0.70, h: rowH,
      fontSize: 8.5, color: T.textD, fontFace: "Calibri", valign: "middle" });
    // Separator
    if (i < items.length - 1) {
      slide.addShape("line", { x: x + 0.16, y: ry + rowH - 0.02, w: w - 0.26, h: 0,
        line: { color: T.bord, width: 0.5 } });
    }
  });
}

// ─── Slide 2: Executive Summary ───────────────────────────────────────────────
function addExecutiveSummarySlide(pres: PptxGenJS, p: PptxPayload) {
  const slide = pres.addSlide();
  chrome(slide, "01", "Executive Summary", "Quarterly financial snapshot and management takeaways",
    p.companyName, p.dateRange, p.method);

  const margin = p.kpis.revenue > 0 ? (p.kpis.profit / p.kpis.revenue) * 100 : 0;

  // 4 KPI cards
  const kw = CW / 4 - 0.12;
  const cards = [
    { label: "Total Revenue",  value: fmt(p.kpis.revenue, p.currency),  sub: `${p.series.length} months`,  col: T.teal },
    { label: "Total Expenses", value: fmt(p.kpis.expenses, p.currency), sub: "Operating costs",              col: T.red },
    { label: "Net Profit",     value: fmt(p.kpis.profit, p.currency),   sub: p.kpis.profit >= 0 ? "Profitable" : "Loss", col: p.kpis.profit >= 0 ? T.teal : T.red },
    { label: "Profit Margin",  value: `${Math.abs(margin).toFixed(1)}%`,sub: margin >= 0 ? "Positive" : "Negative",  col: margin >= 10 ? T.green : margin >= 0 ? T.amber : T.red },
  ];
  cards.forEach((c, i) => kpiCard(slide, ML + i * (kw + 0.12), KPI_Y, kw, KPI_H, c.label, c.value, c.sub, c.col));

  // Left panel: Monthly Performance Overview
  const lw = 7.42, lx = ML;
  panel(slide, lx, CHT_Y, lw, CHT_H, "Monthly Performance Overview");

  // Table header row
  const hf = { fontSize: 8 as number, bold: true, color: T.teal, fontFace: "Calibri" as string };
  const bf = { fontSize: 8.5 as number, color: T.textD, fontFace: "Calibri" as string };
  const hdrFill = { color: T.bgPanel };

  const hdrRow: PptxGenJS.TableRow = [
    { text: "",         options: { ...hf, fill: hdrFill, align: "left" } },
    { text: "Revenue\n(PKR)",  options: { ...hf, fill: hdrFill, align: "center" } },
    { text: "Expenses\n(PKR)", options: { ...hf, fill: hdrFill, align: "center" } },
    { text: "Profit\n(PKR)",   options: { ...hf, fill: hdrFill, align: "center" } },
    { text: "Margin\n(%)",     options: { ...hf, fill: hdrFill, align: "center" } },
  ];
  const rows: PptxGenJS.TableRow[] = [hdrRow];
  const display = p.series.slice(-6);
  display.forEach((s, i) => {
    const m = s.revenue > 0 ? (s.profit / s.revenue) * 100 : 0;
    const rf = { color: i % 2 === 0 ? T.bgPanel : "0B2040" };
    rows.push([
      { text: mo(s.month),                options: { ...bf, fill: rf, align: "left", color: T.textD } },
      { text: fmt(s.revenue, p.currency), options: { ...bf, fill: rf, align: "center", color: T.teal } },
      { text: fmt(s.expenses, p.currency),options: { ...bf, fill: rf, align: "center", color: T.textD } },
      { text: fmt(s.profit, p.currency),  options: { ...bf, fill: rf, align: "center", color: s.profit >= 0 ? T.teal : T.red } },
      { text: `${m.toFixed(1)}%`,         options: { ...bf, fill: rf, align: "center", color: m >= 0 ? T.green : T.red } },
    ]);
  });
  slide.addTable(rows, {
    x: lx + 0.18, y: CHT_Y + 0.48, w: lw - 0.28, rowH: 0.44,
    border: { type: "solid", color: T.bord, pt: 0.5 },
  });

  // Right panel: Key Insights
  const rx = lx + lw + 0.14, rw = CW - lw - 0.14;
  const best = p.series.length ? p.series.reduce((a, b) => b.profit > a.profit ? b : a, p.series[0]) : null;
  const worst = p.series.length ? p.series.reduce((a, b) => b.profit < a.profit ? b : a, p.series[0]) : null;
  insightsPanel(slide, rx, CHT_Y, rw, CHT_H, [
    { text: `Quarter ${p.kpis.profit >= 0 ? "remained profitable" : "posted a net loss"} overall.`, col: p.kpis.profit >= 0 ? T.teal : T.red },
    { text: `Revenue exceeded expenses by a ${margin >= 0 ? "positive" : "negative"} margin in the period.` },
    { text: best ? `${mo(best.month)} was the strongest month of the period.` : "Review monthly trends." },
    { text: worst && worst.profit < 0 ? `${mo(worst.month)} loss indicates fragile profitability.` : "Margins remain stable across months.", col: worst && worst.profit < 0 ? T.amber : T.teal },
  ]);

  // Star banner
  starBanner(slide, [
    { text: "Overall performance was ", teal: false },
    { text: p.kpis.profit >= 0 ? "positive" : "negative", teal: true },
    { text: `, but `, teal: false },
    { text: "margin resilience", teal: true },
    { text: ` requires close monitoring.`, teal: false },
  ]);
}

// ─── Slide 3: P&L Monthly Overview ───────────────────────────────────────────
function addPnlChartSlide(pres: PptxGenJS, p: PptxPayload) {
  const slide = pres.addSlide();
  chrome(slide, "02", "Profit & Loss — Monthly Overview",
    `Revenue, expenses and profitability trend across ${p.dateRange.start} – ${p.dateRange.end}`,
    p.companyName, p.dateRange, p.method);

  const labels = p.series.map((s) => mo(s.month));
  const totalRev = p.kpis.revenue, totalExp = p.kpis.expenses, totalProf = p.kpis.profit;
  const margin = totalRev > 0 ? (totalProf / totalRev) * 100 : 0;
  const best = p.series.length ? p.series.reduce((a, b) => b.profit > a.profit ? b : a, p.series[0]) : null;

  // 4 KPI cards
  const kw = CW / 4 - 0.12;
  [
    { label: "Period Revenue",  value: fmt(totalRev, p.currency),  sub: "Total income",           col: T.teal },
    { label: "Period Expenses", value: fmt(totalExp, p.currency),  sub: "Total costs",             col: T.red },
    { label: "Period Profit",   value: fmt(totalProf, p.currency), sub: totalProf >= 0 ? "Net positive" : "Net loss", col: totalProf >= 0 ? T.teal : T.red },
    { label: "Best Month",      value: best ? mo(best.month) : "—", sub: best ? fmt(best.profit, p.currency) : "", col: T.gold },
  ].forEach((c, i) => kpiCard(slide, ML + i * (kw + 0.12), KPI_Y, kw, KPI_H, c.label, c.value, c.sub, c.col));

  // Left: bar chart (Revenue vs Expenses)
  const lw = 7.42;
  panel(slide, ML, CHT_Y, lw, CHT_H, `Revenue vs Expenses (${p.currency} M)`);
  slide.addChart(pres.ChartType.bar,
    [
      { name: `Revenue (${p.currency} M)`,  labels, values: p.series.map((s) => s.revenue) },
      { name: `Expenses (${p.currency} M)`, labels, values: p.series.map((s) => s.expenses) },
    ],
    {
      ...CHART_DEFAULTS,
      x: ML + 0.14, y: CHT_Y + 0.44, w: lw - 0.22, h: CHT_H - 0.52,
      barDir: "col", barGrouping: "clustered",
      chartColors: [T.teal, T.gold],
      showLegend: true, legendPos: "t", legendFontSize: 8, legendColor: "A8C0D8",
      showValue: true,
      valAxisLabelFormatCode: '#,##0.00,,"M"',
      dataLabelFormatCode: '#,##0.00,,"M"',
    } as any
  );

  // Right: line chart (Net Profit Trend)
  const rw = CW - lw - 0.14, rx = ML + lw + 0.14;
  panel(slide, rx, CHT_Y, rw, CHT_H, `Net Profit Trend (${p.currency} K)`);
  slide.addChart(pres.ChartType.line,
    [{ name: "Net Profit", labels, values: p.series.map((s) => s.profit) }],
    {
      ...CHART_DEFAULTS,
      x: rx + 0.14, y: CHT_Y + 0.44, w: rw - 0.22, h: CHT_H - 0.52,
      chartColors: [T.teal],
      lineSize: 2.5,
      showLegend: false,
      showValue: true,
      valAxisLabelFormatCode: '#,##0.0,"K"',
      dataLabelFormatCode: '#,##0.0,"K"',
    } as any
  );

  // Star banner
  starBanner(slide, [
    { text: "Revenue peaked in ", teal: false },
    { text: best ? mo(best.month) : "the period", teal: true },
    { text: `.  Overall margin: `, teal: false },
    { text: `${Math.abs(margin).toFixed(1)}%${margin < 0 ? " (loss)" : ""}`, teal: margin >= 5 },
    { text: ".  Monitor expense trends closely.", teal: false },
  ]);
}

// ─── Slide 4: Expense Breakdown ───────────────────────────────────────────────
function addExpenseBreakdownSlide(pres: PptxGenJS, p: PptxPayload) {
  const slide = pres.addSlide();
  chrome(slide, "03", "Expense Breakdown — Category Analysis",
    "Understanding the cost structure for the quarter",
    p.companyName, p.dateRange, p.method);

  const items = p.expenseBreakdown.slice(0, 9);
  const total = items.reduce((s, x) => s + x.value, 0);
  const top = items[0];
  const topPct = top && total > 0 ? (top.value / total) * 100 : 0;
  const other = items.find((x) => x.name === "Other");

  // 4 KPI cards
  const kw = CW / 4 - 0.12;
  [
    { label: "Total Expenses",    value: fmt(total, p.currency),                   sub: "All categories",         col: T.red },
    { label: "Largest Category",  value: top ? top.name.slice(0, 20) : "—",        sub: top ? fmt(top.value, p.currency) : "", col: T.teal },
    { label: "Top Category Mix",  value: top ? `${topPct.toFixed(0)}%` : "—",      sub: "approx.",                col: T.gold },
    { label: "Other Categories",  value: other ? fmt(other.value, p.currency) : fmt(0, p.currency), sub: "Remaining", col: T.viol },
  ].forEach((c, i) => kpiCard(slide, ML + i * (kw + 0.12), KPI_Y, kw, KPI_H, c.label, c.value, c.sub, c.col));

  // Left: doughnut chart
  const lw = 5.90;
  panel(slide, ML, CHT_Y, lw, CHT_H, "Expense Mix by Category");
  const dLabels = items.map((x) => x.name.length > 18 ? x.name.slice(0, 17) + "…" : x.name);
  slide.addChart(pres.ChartType.doughnut,
    [{ name: "Expenses", labels: dLabels, values: items.map((x) => x.value) }],
    {
      ...CHART_DEFAULTS,
      x: ML + 0.12, y: CHT_Y + 0.44, w: lw - 0.22, h: CHT_H - 0.52,
      chartColors: T.cc,
      holeSize: 52,
      showLegend: true, legendPos: "r", legendFontSize: 7.5, legendColor: "A8C0D8",
      showValue: true,
      dataLabelFormatCode: '0.0%',
      dataLabelFontSize: 7.5,
    } as any
  );

  // Right: ranked category table
  const rw = CW - lw - 0.14, rx = ML + lw + 0.14;
  panel(slide, rx, CHT_Y, rw, CHT_H, "Top Expense Categories");

  const hf = { fontSize: 7.5 as number, bold: true, color: T.teal, fontFace: "Calibri" as string };
  const bf = { fontSize: 7.5 as number, color: T.textD, fontFace: "Calibri" as string };
  const hFill = { color: T.bgPanel };
  const trows: PptxGenJS.TableRow[] = [[
    { text: "#",          options: { ...hf, fill: hFill, align: "center" } },
    { text: "Category",   options: { ...hf, fill: hFill, align: "left" } },
    { text: `Amount (${p.currency})`, options: { ...hf, fill: hFill, align: "right" } },
    { text: "Share (%)",  options: { ...hf, fill: hFill, align: "right" } },
  ]];
  items.slice(0, 8).forEach((item, i) => {
    const share = total > 0 ? (item.value / total) * 100 : 0;
    const rf = { color: i % 2 === 0 ? T.bgPanel : "0B2040" };
    const name = item.name.length > 20 ? item.name.slice(0, 19) + "…" : item.name;
    trows.push([
      { text: String(i + 1),              options: { ...bf, fill: rf, align: "center", color: T.teal } },
      { text: name,                        options: { ...bf, fill: rf, align: "left" } },
      { text: fmt(item.value, p.currency), options: { ...bf, fill: rf, align: "right", color: T.teal } },
      { text: `${share.toFixed(1)}%`,      options: { ...bf, fill: rf, align: "right" } },
    ]);
  });
  // Total row
  trows.push([
    { text: "",                    options: { ...bf, fill: { color: T.bgCard }, bold: true } },
    { text: "Total",               options: { ...bf, fill: { color: T.bgCard }, bold: true, color: T.gold } },
    { text: fmt(total, p.currency),options: { ...bf, fill: { color: T.bgCard }, bold: true, color: T.gold, align: "right" } },
    { text: "100.0%",              options: { ...bf, fill: { color: T.bgCard }, bold: true, color: T.gold, align: "right" } },
  ]);
  slide.addTable(trows, {
    x: rx + 0.14, y: CHT_Y + 0.48, w: rw - 0.22, rowH: 0.36,
    border: { type: "solid", color: T.bord, pt: 0.5 },
  });

  starBanner(slide, [
    { text: "People costs dominate the cost base.  ", teal: false },
    { text: top ? top.name : "Top category", teal: true },
    { text: ` represents `, teal: false },
    { text: `${topPct.toFixed(0)}%`, teal: true },
    { text: " of total expenses.", teal: false },
  ]);
}

// ─── Slide 5: Cash & Bank ─────────────────────────────────────────────────────
function addCashSlide(pres: PptxGenJS, p: PptxPayload) {
  const slide = pres.addSlide();
  chrome(slide, "04", "Cash & Bank Position",
    `Current balances and liquidity visibility as of ${p.dateRange.end}`,
    p.companyName, p.dateRange, p.method);

  const currencies = Object.entries(p.cashTotals);
  const grandTotal = currencies.reduce((s, [, v]) => s + v, 0);
  const isLow = grandTotal < 100_000;

  // 4 KPI cards
  const kw = CW / 4 - 0.12;
  const kpiDefs = currencies.slice(0, 3).map(([cur, tot]) => ({
    label: `Total ${cur} Balance`, value: fmt(tot, cur),
    sub: `${p.cashAccounts.filter((a) => a.currency === cur).length} account(s)`,
    col: tot >= 0 ? T.teal : T.red,
  }));
  while (kpiDefs.length < 3) kpiDefs.push({ label: "Balance", value: fmt(0, p.currency), sub: "No accounts", col: T.textM });
  kpiDefs.push({ label: "Liquidity Status", value: isLow ? "Critical" : "Adequate", sub: "Overall health", col: isLow ? T.red : T.green });
  kpiDefs.forEach((c, i) => kpiCard(slide, ML + i * (kw + 0.12), KPI_Y, kw, KPI_H, c.label, c.value, c.sub, c.col));

  // Left panel: account table
  const lw = 7.42;
  panel(slide, ML, CHT_Y, lw, CHT_H, "Account Balances");
  const hf = { fontSize: 8 as number, bold: true, color: T.teal, fontFace: "Calibri" as string };
  const bf = { fontSize: 8 as number, color: T.textD, fontFace: "Calibri" as string };
  const hFill = { color: T.bgPanel };
  const rows: PptxGenJS.TableRow[] = [[
    { text: "Account Name", options: { ...hf, fill: hFill, align: "left" } },
    { text: "Type",         options: { ...hf, fill: hFill, align: "center" } },
    { text: "Currency",     options: { ...hf, fill: hFill, align: "center" } },
    { text: "Balance",      options: { ...hf, fill: hFill, align: "right" } },
  ]];
  p.cashAccounts.slice(0, 8).forEach((a, i) => {
    const rf = { color: i % 2 === 0 ? T.bgPanel : "0B2040" };
    const name = a.name.length > 22 ? a.name.slice(0, 21) + "…" : a.name;
    rows.push([
      { text: name,                              options: { ...bf, fill: rf, align: "left" } },
      { text: "Bank / Cash",                     options: { ...bf, fill: rf, align: "center" } },
      { text: a.currency,                        options: { ...bf, fill: rf, align: "center" } },
      { text: fmt(a.currentBalance, a.currency), options: { ...bf, fill: rf, align: "right", color: a.currentBalance >= 0 ? T.teal : T.red } },
    ]);
  });
  // Grand total row
  rows.push([
    { text: "Grand Total (All Currencies)", options: { ...bf, fill: { color: T.bgCard }, bold: true, color: T.gold } },
    { text: "", options: { fill: { color: T.bgCard } } },
    { text: "", options: { fill: { color: T.bgCard } } },
    { text: fmt(grandTotal, p.currency),   options: { ...bf, fill: { color: T.bgCard }, bold: true, color: T.gold, align: "right" } },
  ]);
  slide.addTable(rows, {
    x: ML + 0.14, y: CHT_Y + 0.48, w: lw - 0.22, rowH: 0.36,
    border: { type: "solid", color: T.bord, pt: 0.5 },
  });

  // Right panel: currency composition doughnut
  const rw = CW - lw - 0.14, rx = ML + lw + 0.14;
  panel(slide, rx, CHT_Y, rw, CHT_H, `Currency Composition (By Balance)`);
  if (currencies.length > 0) {
    slide.addChart(pres.ChartType.doughnut,
      [{ name: "Balance", labels: currencies.map(([c]) => c), values: currencies.map(([, v]) => Math.abs(v)) }],
      {
        ...CHART_DEFAULTS,
        x: rx + 0.12, y: CHT_Y + 0.44, w: rw - 0.22, h: CHT_H * 0.55,
        chartColors: T.cc,
        holeSize: 55,
        showLegend: false,
        showValue: false,
      } as any
    );
  }
  // Currency breakdown text
  currencies.slice(0, 3).forEach(([cur, tot], i) => {
    const share = grandTotal > 0 ? (Math.abs(tot) / Math.abs(grandTotal)) * 100 : 0;
    const ty = CHT_Y + 0.44 + CHT_H * 0.58 + i * 0.48;
    slide.addShape("ellipse", { x: rx + 0.18, y: ty + 0.08, w: 0.22, h: 0.22,
      fill: { color: T.cc[i] ?? T.teal }, line: { color: T.cc[i] ?? T.teal, width: 0 } });
    slide.addText(cur, { x: rx + 0.46, y: ty, w: 1.0, h: 0.38, fontSize: 8.5, color: T.textD, fontFace: "Calibri" });
    slide.addText(fmt(tot, cur), { x: rx + 1.5, y: ty, w: rw - 1.7, h: 0.38, fontSize: 8.5, color: T.teal, fontFace: "Calibri", align: "right" });
    slide.addText(`${share.toFixed(1)}%`, { x: rx + 0.46, y: ty + 0.20, w: rw - 0.60, h: 0.24, fontSize: 7.5, color: T.textM, fontFace: "Calibri" });
  });

  starBanner(slide, [
    { text: isLow ? "Cash reserves are " : "Cash position is ", teal: false },
    { text: isLow ? "critically thin" : "adequate", teal: true },
    { text: ".  " + (isLow ? "Working capital support and tighter cash planning are needed." : "Monitor multi-currency exposure regularly."), teal: false },
  ]);
}

// ─── Slide 6: AR / AP ─────────────────────────────────────────────────────────
function addArApSlide(pres: PptxGenJS, p: PptxPayload) {
  const slide = pres.addSlide();
  chrome(slide, "05", "Accounts Receivable & Payable",
    `Working capital position and AP aging as of ${p.dateRange.end}`,
    p.companyName, p.dateRange, p.method);

  if (!p.arAp) {
    slide.addText("AR/AP data not available for this period.",
      { x: ML, y: 3.5, w: CW, h: 0.5, align: "center", fontSize: 14, color: T.textM });
    starBanner(slide, [{ text: "AR/AP data unavailable. Check QBO connection.", teal: false }]);
    return;
  }

  const { totalPayables, totalReceivables, apAging } = p.arAp;
  const liqRatio = totalPayables > 0 ? totalReceivables / totalPayables : 0;
  const overdue91 = apAging.reduce((s, v) => s + v["91_plus"], 0);
  const overduePct = totalPayables > 0 ? (overdue91 / totalPayables) * 100 : 0;

  // 4 KPI cards
  const kw = CW / 4 - 0.12;
  [
    { label: "Total Payables",     value: fmt(totalPayables, p.currency),     sub: "Owed by you",         col: T.red },
    { label: "Total Receivables",  value: fmt(totalReceivables, p.currency),  sub: "Owed to you",         col: totalReceivables >= 0 ? T.teal : T.amber },
    { label: "Liquidity Ratio",    value: liqRatio.toFixed(2),                sub: "AR / AP",             col: liqRatio >= 1 ? T.green : T.amber },
    { label: "Overdue AP (61+ d)", value: fmt(overdue91, p.currency),         sub: `${overduePct.toFixed(1)}% of payables`, col: overdue91 > 0 ? T.red : T.green },
  ].forEach((c, i) => kpiCard(slide, ML + i * (kw + 0.12), KPI_Y, kw, KPI_H, c.label, c.value, c.sub, c.col));

  // Left panel: AP Aging bar chart (proportional buckets)
  const lw = 7.42;
  panel(slide, ML, CHT_Y, lw, CHT_H, `AP Aging (${p.currency})`);
  const bucketTotals = apAging.reduce(
    (acc, v) => { acc[0] += v.current; acc[1] += v["1_30"]; acc[2] += v["31_60"]; acc[3] += v["61_90"]; acc[4] += v["91_plus"]; return acc; },
    [0, 0, 0, 0, 0]
  );
  const bucketLabels = ["Current\n(0–30 days)", "1–30 days", "31–60 days", "61–90 days", "91+ days"];
  const bucketCols = [T.teal, T.tealD, T.amber, T.red, "8B0000"];
  slide.addChart(pres.ChartType.bar,
    [{ name: "AP Aging", labels: bucketLabels, values: bucketTotals }],
    {
      ...CHART_DEFAULTS,
      x: ML + 0.14, y: CHT_Y + 0.44, w: lw - 0.22, h: CHT_H - 0.52,
      barDir: "col", barGrouping: "clustered",
      chartColors: bucketCols,
      showLegend: false,
      showValue: true,
      valAxisLabelFormatCode: '#,##0.0,,"M"',
      dataLabelFormatCode: '#,##0.0,,"M"',
    } as any
  );

  // Right panel: AP Aging by bucket table + AP Health
  const rw = CW - lw - 0.14, rx = ML + lw + 0.14;
  panel(slide, rx, CHT_Y, rw, CHT_H, `AP Aging by Bucket (${p.currency})`);
  const hf = { fontSize: 8 as number, bold: true, color: T.teal, fontFace: "Calibri" as string };
  const bf = { fontSize: 8 as number, color: T.textD, fontFace: "Calibri" as string };
  const hFill = { color: T.bgPanel };
  const bucketRows: PptxGenJS.TableRow[] = [[
    { text: "Bucket",         options: { ...hf, fill: hFill, align: "left" } },
    { text: `Amount (${p.currency})`, options: { ...hf, fill: hFill, align: "right" } },
  ]];
  const bNames = ["Current (0–30 days)", "1–30 days", "31–60 days", "61–90 days", "91+ days"];
  bucketTotals.forEach((val, i) => {
    const rf = { color: i % 2 === 0 ? T.bgPanel : "0B2040" };
    bucketRows.push([
      { text: bNames[i],          options: { ...bf, fill: rf, align: "left" } },
      { text: fmt(val, p.currency),options: { ...bf, fill: rf, align: "right", color: i >= 3 && val > 0 ? T.red : T.teal } },
    ]);
  });
  bucketRows.push([
    { text: "Total Payables",         options: { ...bf, fill: { color: T.bgCard }, bold: true, color: T.gold } },
    { text: fmt(totalPayables, p.currency), options: { ...bf, fill: { color: T.bgCard }, bold: true, color: T.gold, align: "right" } },
  ]);
  slide.addTable(bucketRows, {
    x: rx + 0.14, y: CHT_Y + 0.48, w: rw - 0.22, rowH: 0.38,
    border: { type: "solid", color: T.bord, pt: 0.5 },
  });

  // AP Health box
  const healthY = CHT_Y + 0.48 + 0.38 * (bucketRows.length) + 0.20;
  const healthy = overduePct < 5;
  slide.addShape("roundRect", { x: rx + 0.14, y: healthY, w: rw - 0.22, h: 0.72,
    fill: { color: T.bgCard }, line: { color: healthy ? T.green : T.red, width: 1.0 }, rectRadius: 0.05 });
  slide.addText(`AP Health: ${healthy ? "Healthy" : "At Risk"}`, { x: rx + 0.28, y: healthY + 0.08, w: rw - 0.50, h: 0.26,
    fontSize: 10, bold: true, color: healthy ? T.green : T.red, fontFace: "Calibri" });
  slide.addText(`${overduePct.toFixed(1)}% overdue (61+ days)`, { x: rx + 0.28, y: healthY + 0.36, w: rw - 0.50, h: 0.26,
    fontSize: 8.5, color: T.textD, fontFace: "Calibri" });

  starBanner(slide, [
    { text: overdue91 > 0 ? "Long-overdue payables detected — " : "No material long-overdue payables.  ", teal: false },
    { text: overdue91 > 0 ? "immediate review required." : "Payables " + (totalPayables > totalReceivables ? "significantly exceed receivables." : "are well-managed."), teal: overdue91 > 0 },
  ]);
}

// ─── Slide 7: Forecast ────────────────────────────────────────────────────────
function addForecastSlide(pres: PptxGenJS, p: PptxPayload) {
  const slide = pres.addSlide();
  const fStart = p.forecast?.forecast[0]?.month ? mo(p.forecast.forecast[0].month) : "";
  const fEnd   = p.forecast?.forecast.at(-1)?.month ? mo(p.forecast.forecast.at(-1)!.month) : "";
  chrome(slide, "06", "6-Month Revenue & Expense Forecast",
    `Projected performance from ${fStart} to ${fEnd}`,
    p.companyName, p.dateRange, p.method);

  if (!p.forecast) {
    slide.addText("Forecast unavailable — need at least 3 months of history.",
      { x: ML, y: 3.5, w: CW, h: 0.5, align: "center", fontSize: 14, color: T.textM });
    starBanner(slide, [{ text: "Insufficient historical data for forecasting.", teal: false }]);
    return;
  }

  const { forecast, averages, trends, benchmarks } = p.forecast;

  // 4 KPI cards
  const kw = CW / 4 - 0.12;
  [
    { label: "Avg Monthly Revenue",  value: fmt(averages.avgMonthlyRevenue, p.currency),  sub: "Historical avg",      col: T.teal },
    { label: "Avg Monthly Expenses", value: fmt(averages.avgMonthlyOpex, p.currency),     sub: "Historical avg",      col: T.red },
    { label: "Break-even Revenue",   value: fmt(benchmarks.breakevenRevenue, p.currency), sub: "Min to cover costs",  col: T.amber },
    { label: "Revenue MoM Trend",    value: pct(trends.revenueMoM),                       sub: "Month-over-month",    col: trends.revenueMoM >= 0 ? T.green : T.red },
  ].forEach((c, i) => kpiCard(slide, ML + i * (kw + 0.12), KPI_Y, kw, KPI_H, c.label, c.value, c.sub, c.col));

  const fLabels = forecast.map((f) => mo(f.month));

  // Left: Revenue & Expense forecast line chart
  const lw = 7.42;
  panel(slide, ML, CHT_Y, lw, CHT_H, `6-Month Revenue & Expense Forecast`);
  slide.addChart(pres.ChartType.line,
    [
      { name: "Projected Revenue",  labels: fLabels, values: forecast.map((f) => f.revenue) },
      { name: "Projected Expenses", labels: fLabels, values: forecast.map((f) => f.opex) },
    ],
    {
      ...CHART_DEFAULTS,
      x: ML + 0.14, y: CHT_Y + 0.44, w: lw - 0.22, h: CHT_H - 0.52,
      chartColors: [T.teal, T.gold],
      lineSize: 2.5,
      showLegend: true, legendPos: "t", legendFontSize: 8, legendColor: "A8C0D8",
      showValue: true,
      valAxisLabelFormatCode: '#,##0.00,,"M"',
      dataLabelFormatCode: '#,##0.00,,"M"',
    } as any
  );

  // Middle: Projected Profit bar chart
  const mw = 2.80, mx = ML + lw + 0.14;
  panel(slide, mx, CHT_Y, mw, CHT_H, "Projected Profit / (Loss)");
  slide.addChart(pres.ChartType.bar,
    [{ name: "Profit", labels: fLabels, values: forecast.map((f) => f.profit) }],
    {
      ...CHART_DEFAULTS,
      x: mx + 0.12, y: CHT_Y + 0.44, w: mw - 0.20, h: CHT_H - 0.52,
      barDir: "col",
      chartColors: forecast.map((f) => f.profit >= 0 ? T.teal : T.red),
      showLegend: false,
      showValue: true,
      valAxisLabelFormatCode: '#,##0.0,,"M"',
      dataLabelFormatCode: '#,##0.00,,"M"',
    } as any
  );

  // Right: Revenue Benchmarks panel
  const rw = CW - lw - mw - 0.28, rx = mx + mw + 0.14;
  panel(slide, rx, CHT_Y, rw, CHT_H, "Revenue Benchmarks");
  const bmarks = [
    { label: "Break-even",  value: fmt(benchmarks.breakevenRevenue, p.currency), col: T.amber },
    { label: "10% Margin",  value: fmt(benchmarks.margin10, p.currency),          col: T.teal },
    { label: "20% Margin",  value: fmt(benchmarks.margin20, p.currency),          col: T.green },
    { label: "30% Margin",  value: fmt(benchmarks.margin30, p.currency),          col: T.viol },
  ];
  const bRowH = (CHT_H - 0.52) / bmarks.length;
  bmarks.forEach((b, i) => {
    const by = CHT_Y + 0.52 + i * bRowH;
    slide.addShape("roundRect", { x: rx + 0.14, y: by + 0.06, w: rw - 0.22, h: bRowH - 0.10,
      fill: { color: T.bgCard }, line: { color: b.col, width: 0.8 }, rectRadius: 0.04 });
    slide.addShape("ellipse", { x: rx + 0.22, y: by + 0.16, w: 0.34, h: 0.34,
      fill: { color: T.bg }, line: { color: b.col, width: 0.8 } });
    slide.addText(b.label[0], { x: rx + 0.22, y: by + 0.16, w: 0.34, h: 0.34,
      fontSize: 9, bold: true, color: b.col, align: "center", valign: "middle" });
    slide.addText(b.label, { x: rx + 0.64, y: by + 0.10, w: rw - 0.80, h: 0.26,
      fontSize: 7.5, color: T.textD, fontFace: "Calibri" });
    slide.addText(b.value, { x: rx + 0.64, y: by + 0.32, w: rw - 0.80, h: 0.36,
      fontSize: 12, bold: true, color: b.col, fontFace: "Calibri", fit: "shrink" });
  });

  const revTrend = trends.revenueMoM;
  starBanner(slide, [
    { text: "Forecast indicates ", teal: false },
    { text: revTrend < 0 ? "widening losses" : "improving outlook", teal: true },
    { text: revTrend < 0 ? " unless revenue " : " if " , teal: false },
    { text: revTrend < 0 ? "recovers" : "growth continues", teal: true },
    { text: revTrend < 0 ? " or the cost base is reduced." : " and costs are controlled.", teal: false },
  ]);
}

// ─── Slide 8: Retained Earnings & Investments ─────────────────────────────────
function addRetainedSlide(pres: PptxGenJS, p: PptxPayload) {
  const slide = pres.addSlide();
  chrome(slide, "07", "Retained Earnings & Investments",
    "Capital position overview for the quarter",
    p.companyName, p.dateRange, p.method);

  if (!p.retained) {
    slide.addText("Retained earnings data not available.",
      { x: ML, y: 3.5, w: CW, h: 0.5, align: "center", fontSize: 14, color: T.textM });
    starBanner(slide, [{ text: "Balance sheet data unavailable. Check QBO connection.", teal: false }]);
    return;
  }

  const { netProfit, longTermAssets, totalInvestments, contributionReceived, retainedEarning } = p.retained;

  // 5 KPI cards
  const kw = CW / 5 - 0.10;
  [
    { label: "Net Profit",           value: fmt(netProfit, p.currency),           sub: "Period earnings",   col: netProfit >= 0 ? T.teal : T.red },
    { label: "Long-term Assets",     value: fmt(longTermAssets, p.currency),      sub: "Fixed + LT",        col: T.teal },
    { label: "Total Investments",    value: fmt(totalInvestments, p.currency),    sub: "Portfolio",          col: totalInvestments >= 0 ? T.teal : T.amber },
    { label: "Contribution Received",value: fmt(contributionReceived, p.currency),sub: "Owner injection",   col: T.gold },
    { label: "Retained Earnings",    value: fmt(retainedEarning, p.currency),     sub: "Cumulative equity", col: retainedEarning >= 0 ? T.green : T.red },
  ].forEach((c, i) => kpiCard(slide, ML + i * (kw + 0.10), KPI_Y, kw, KPI_H, c.label, c.value, c.sub, c.col));

  // Left: bar chart
  const lw = 7.42;
  panel(slide, ML, CHT_Y, lw, CHT_H, `Capital Position Comparison (${p.currency})`);
  const barLabels = ["Net Profit", "Long-term\nAssets", "Total\nInvestments", "Contribution\nReceived", "Retained\nEarnings"];
  const barValues = [netProfit, longTermAssets, totalInvestments, contributionReceived, retainedEarning];
  const barColors = barValues.map((v) => v >= 0 ? T.teal : T.red);
  slide.addChart(pres.ChartType.bar,
    [{ name: "Value", labels: barLabels, values: barValues }],
    {
      ...CHART_DEFAULTS,
      x: ML + 0.14, y: CHT_Y + 0.44, w: lw - 0.22, h: CHT_H - 0.52,
      barDir: "col",
      chartColors: barColors,
      showLegend: false,
      showValue: true,
      valAxisLabelFormatCode: '#,##0.0,,"M"',
      dataLabelFormatCode: '#,##0.0,,"M"',
    } as any
  );

  // Right: Equity Lens panel + Key Insights
  const rw = CW - lw - 0.14, rx = ML + lw + 0.14;
  const ph = CHT_H * 0.46;
  panel(slide, rx, CHT_Y, rw, ph, "Equity Lens");

  // Two equity items
  [[longTermAssets, "Long-term Assets", longTermAssets > 0 ? "Strong asset base" : "Limited assets"],
   [retainedEarning, "Retained Earnings", retainedEarning > 0 ? "Accumulated profits" : "No accumulated earnings"]
  ].forEach(([val, lbl, note], i) => {
    const ex = rx + 0.14 + i * (rw / 2);
    const ew = rw / 2 - 0.14;
    slide.addText(lbl as string, { x: ex, y: CHT_Y + 0.50, w: ew, h: 0.28,
      fontSize: 8.5, color: T.textD, fontFace: "Calibri", align: "center" });
    slide.addText(fmt(val as number, p.currency), { x: ex, y: CHT_Y + 0.78, w: ew, h: 0.52,
      fontSize: 16, bold: true, color: (val as number) >= 0 ? T.teal : T.red, fontFace: "Calibri", align: "center", fit: "shrink" });
    slide.addText(note as string, { x: ex, y: CHT_Y + 1.28, w: ew, h: 0.24,
      fontSize: 7.5, color: T.textM, fontFace: "Calibri", align: "center" });
  });

  // Key Insights sub-panel
  insightsPanel(slide, rx, CHT_Y + ph + 0.12, rw, CHT_H - ph - 0.12, [
    { text: "Asset base is meaningful relative to earnings.", col: longTermAssets > netProfit * 5 ? T.teal : T.amber },
    { text: retainedEarning > 0 ? "Retained earnings reflect accumulated profitability." : "Retained earnings have not yet accumulated.", col: retainedEarning > 0 ? T.green : T.amber },
    { text: "Capital efficiency and profitability need improvement to strengthen equity.", col: T.red },
  ]);

  starBanner(slide, [
    { text: "Strong asset foundation is in place, but ", teal: false },
    { text: "profitability", teal: true },
    { text: " and ", teal: false },
    { text: "retained earnings", teal: true },
    { text: " require focused improvement.", teal: false },
  ]);
}

// ─── Slide 9: Management Priorities & Closing ─────────────────────────────────
function addClosingSlide(pres: PptxGenJS, p: PptxPayload) {
  const slide = pres.addSlide();
  slide.background = { color: T.bg };

  // Top-right decorative geometry
  slide.addShape("rect", { x: 9.2, y: -0.4, w: 3.2, h: 4.5,
    fill: { color: "0D2240" }, line: { color: T.teal, width: 0.8 }, rotate: 20 });
  slide.addShape("rect", { x: 10.0, y: -0.6, w: 2.6, h: 4.3,
    fill: { color: "091828" }, line: { color: T.gold, width: 0.6 }, rotate: 20 });

  // Section header (no breadcrumb — closing slide)
  slide.addText("08", { x: ML, y: 0.20, w: 1.18, h: 0.96,
    fontSize: 60, bold: true, color: T.gold, fontFace: "Calibri", valign: "middle" });
  slide.addShape("line", { x: ML, y: 1.18, w: 1.08, h: 0, line: { color: T.gold, width: 2.5 } });
  slide.addShape("line", { x: 1.74, y: 0.20, w: 0, h: 1.00, line: { color: T.gold, width: 1.2 } });
  slide.addText("Management Priorities & Next Steps", { x: 1.92, y: 0.22, w: 9.4, h: 0.70,
    fontSize: 28, bold: true, color: T.white, fontFace: "Calibri", fit: "shrink" });
  slide.addText("Focused actions to strengthen performance and drive sustainable growth",
    { x: 1.92, y: 0.94, w: 9.4, h: 0.28, fontSize: 10, color: T.teal, fontFace: "Calibri" });

  // 4 action cards
  const margin = p.kpis.revenue > 0 ? (p.kpis.profit / p.kpis.revenue) * 100 : 0;
  const priorities = [
    { title: "Stabilize Revenue",      body: "Improve pipeline conversion\nand reduce client volatility.", col: T.teal },
    { title: "Control Costs",          body: "Review salaries, subscriptions,\nand overhead.",             col: T.gold },
    { title: "Protect Liquidity",      body: "Tighten cash planning and\npreserve working capital.",       col: T.red },
    { title: "Improve Profitability",  body: `Raise margin discipline and\ntrack monthly performance.`,   col: margin >= 15 ? T.green : T.amber },
  ];
  const cw = CW / 4 - 0.14, cy = 1.40;
  priorities.forEach((pr, i) => {
    const cx = ML + i * (cw + 0.14);
    slide.addShape("roundRect", { x: cx, y: cy, w: cw, h: 2.80,
      fill: { color: T.bgCard }, line: { color: pr.col, width: 1.0 }, rectRadius: 0.06 });
    // Icon circle
    const iS = 0.70, iX = cx + (cw - iS) / 2, iY = cy + 0.28;
    slide.addShape("ellipse", { x: iX, y: iY, w: iS, h: iS,
      fill: { color: T.bg }, line: { color: pr.col, width: 1.5 } });
    // Mini bars in icon
    const bW = 0.09, bBase = iY + iS * 0.78;
    ([0.50, 1.0, 0.72] as const).forEach((frac, bi) => {
      const bH = 0.28 * frac;
      slide.addShape("rect", { x: iX + 0.10 + bi * (bW + 0.05), y: bBase - bH, w: bW, h: bH,
        fill: { color: pr.col }, line: { color: pr.col, width: 0 } });
    });
    // Title
    slide.addText(pr.title, { x: cx + 0.12, y: cy + 1.12, w: cw - 0.22, h: 0.48,
      fontSize: 12, bold: true, color: pr.col, fontFace: "Calibri", align: "center" });
    // Gold divider
    slide.addShape("line", { x: cx + (cw / 2) - 0.50, y: cy + 1.62, w: 1.0, h: 0,
      line: { color: T.gold, width: 0.8 } });
    // Body text
    slide.addText(pr.body, { x: cx + 0.12, y: cy + 1.74, w: cw - 0.22, h: 0.90,
      fontSize: 9, color: T.textD, fontFace: "Calibri", align: "center" });
  });

  // Summary banner
  starBanner(slide, [
    { text: `${p.dateRange.start.slice(0, 7)} – ${p.dateRange.end.slice(0, 7)} remained `, teal: false },
    { text: p.kpis.profit >= 0 ? "profitable" : "loss-making", teal: true },
    { text: ", but the outlook and forecast require ", teal: false },
    { text: "immediate management attention", teal: true },
    { text: ".", teal: false },
  ]);

  // Thank You section
  slide.addShape("line", { x: 2.5, y: INS_Y + INS_H + 0.12, w: 8.33, h: 0,
    line: { color: T.gold, width: 0.8 } });
  slide.addText("Thank You", { x: ML, y: INS_Y + INS_H + 0.18, w: CW, h: 0.62,
    fontSize: 38, bold: true, color: T.gold, fontFace: "Calibri", align: "center" });
  slide.addShape("line", { x: 2.5, y: INS_Y + INS_H + 0.82, w: 8.33, h: 0,
    line: { color: T.gold, width: 0.8 } });
  slide.addText("Questions & Discussion", { x: ML, y: INS_Y + INS_H + 0.86, w: CW, h: 0.32,
    fontSize: 14, color: T.teal, fontFace: "Calibri", align: "center" });

  // Footer info bar
  const FY = 7.02;
  slide.addShape("rect", { x: 0, y: FY, w: SW, h: SH - FY,
    fill: { color: T.bgCard }, line: { color: T.bgCard, width: 0 } });
  slide.addShape("line", { x: 0, y: FY, w: SW, h: 0, line: { color: T.gold, width: 0.5 } });
  const footItems = [
    p.companyName, "Finance & Operations Report",
    `${p.dateRange.start} – ${p.dateRange.end}`, p.method + " Basis", "Confidential — For Internal Use Only",
  ];
  const fw = SW / footItems.length;
  footItems.forEach((txt, i) => {
    if (i > 0) slide.addShape("line", { x: i * fw, y: FY + 0.06, w: 0, h: SH - FY - 0.10,
      line: { color: T.bord, width: 0.5 } });
    slide.addText(txt, { x: i * fw + 0.08, y: FY, w: fw - 0.10, h: SH - FY,
      fontSize: 7.5, color: T.textM, fontFace: "Calibri", align: "center", valign: "middle" });
  });
}

// ─── Entry point ──────────────────────────────────────────────────────────────
export async function buildPresentation(p: PptxPayload): Promise<Buffer> {
  const pres = new PptxGenJS();
  pres.layout  = "LAYOUT_WIDE";
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







