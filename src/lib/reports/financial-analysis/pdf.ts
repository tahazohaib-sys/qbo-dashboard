import {
  buildClosingNotes,
  buildExecutiveNarrative,
  FinancialReportAnalysis,
  formatCurrency,
  formatDateRange,
  formatPercent,
  monthLabel,
} from "@/lib/reports/financial-analysis/analysis";

type RetainedResponse = any;
type ForecastResponse = any;
type ArApResponse = any;

type ReportInput = {
  companyName: string;
  currency: string;
  startDate: string;
  endDate: string;
  accountingMethod: "Accrual" | "Cash";
  generatedAtIso: string;
  series: Array<{ month: string; revenue: number; expenses: number; profit: number }>;
  analysis: FinancialReportAnalysis;
  retained: RetainedResponse;
  forecast: ForecastResponse;
  arAp: ArApResponse;
  manualAdjustments: Array<{ section: "payables" | "receivables"; label: string; amount: number }>;
};

type PdfObj = { id: number; body: string };

class SimplePdf {
  private objects: PdfObj[] = [];
  private pages: { content: string[] }[] = [];
  private currentPage = 0;
  y = 780;
  readonly width = 595;
  readonly height = 842;
  readonly margin = 46;

  constructor() {
    this.pages.push({ content: [] });
  }

  addPage() {
    this.pages.push({ content: [] });
    this.currentPage = this.pages.length - 1;
    this.y = this.height - this.margin;
  }

  ensureSpace(required = 60) {
    if (this.y - required < this.margin) this.addPage();
  }

  private esc(text: string) {
    return text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  }

  text(text: string, x: number, y: number, size = 11, color: [number, number, number] = [0.9, 0.9, 0.9]) {
    this.pages[this.currentPage].content.push(`${color[0]} ${color[1]} ${color[2]} rg BT /F1 ${size} Tf ${x.toFixed(2)} ${y.toFixed(2)} Td (${this.esc(text)}) Tj ET`);
  }

  line(x1: number, y1: number, x2: number, y2: number, width = 1, color: [number, number, number] = [0.2, 0.6, 0.8]) {
    this.pages[this.currentPage].content.push(
      `${color[0]} ${color[1]} ${color[2]} RG ${width.toFixed(2)} w ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`
    );
  }

  rect(x: number, y: number, w: number, h: number, fill: [number, number, number], stroke?: [number, number, number]) {
    const strokePart = stroke ? `${stroke[0]} ${stroke[1]} ${stroke[2]} RG` : "";
    this.pages[this.currentPage].content.push(
      `${fill[0]} ${fill[1]} ${fill[2]} rg ${strokePart} ${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re ${stroke ? "B" : "f"}`
    );
  }

  writeParagraph(text: string, options?: { size?: number; leading?: number; color?: [number, number, number] }) {
    const size = options?.size ?? 10;
    const leading = options?.leading ?? 14;
    const color = options?.color ?? [0.84, 0.88, 0.95];
    const maxWidth = this.width - this.margin * 2;
    const words = text.split(/\s+/);
    let line = "";

    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      const approxWidth = next.length * (size * 0.5);
      if (approxWidth > maxWidth) {
        this.ensureSpace(leading + 20);
        this.text(line, this.margin, this.y, size, color);
        this.y -= leading;
        line = word;
      } else {
        line = next;
      }
    }
    if (line) {
      this.ensureSpace(leading + 20);
      this.text(line, this.margin, this.y, size, color);
      this.y -= leading;
    }
    this.y -= 4;
  }

  sectionTitle(title: string) {
    this.ensureSpace(40);
    this.text(title, this.margin, this.y, 14, [0.32, 0.78, 0.95]);
    this.y -= 10;
    this.line(this.margin, this.y, this.width - this.margin, this.y, 1, [0.2, 0.37, 0.58]);
    this.y -= 18;
  }

  table(headers: string[], rows: string[][], widths: number[]) {
    const rowHeight = 18;
    const startX = this.margin;

    this.ensureSpace(rowHeight * (rows.length + 2));
    this.rect(startX, this.y - rowHeight + 4, widths.reduce((s, n) => s + n, 0), rowHeight, [0.1, 0.2, 0.34]);

    let x = startX + 4;
    headers.forEach((h, idx) => {
      this.text(h, x, this.y - 9, 9, [0.88, 0.95, 1]);
      x += widths[idx];
    });
    this.y -= rowHeight;

    for (const row of rows) {
      this.ensureSpace(rowHeight + 14);
      let cx = startX + 4;
      row.forEach((cell, idx) => {
        this.text(cell, cx, this.y - 9, 9, [0.8, 0.85, 0.93]);
        cx += widths[idx];
      });
      this.line(startX, this.y - rowHeight + 4, startX + widths.reduce((s, n) => s + n, 0), this.y - rowHeight + 4, 0.5, [0.2, 0.2, 0.25]);
      this.y -= rowHeight;
    }
    this.y -= 8;
  }

  trendChart(title: string, data: Array<{ label: string; value: number }>, color: [number, number, number]) {
    this.ensureSpace(170);
    const chartX = this.margin;
    const chartY = this.y - 130;
    const w = this.width - this.margin * 2;
    const h = 120;
    this.rect(chartX, chartY, w, h, [0.07, 0.09, 0.16], [0.16, 0.22, 0.35]);
    this.text(title, chartX + 10, chartY + h - 16, 10, [0.7, 0.9, 1]);
    if (!data.length) {
      this.text("No data available", chartX + 10, chartY + h / 2, 10, [0.8, 0.8, 0.8]);
      this.y = chartY - 18;
      return;
    }

    const max = Math.max(...data.map((d) => Math.abs(d.value)), 1);
    const points = data.map((d, i) => {
      const px = chartX + 24 + (i * (w - 48)) / Math.max(data.length - 1, 1);
      const py = chartY + 20 + (h - 44) * (1 - Math.abs(d.value) / max);
      return { ...d, x: px, y: py };
    });

    points.forEach((p, i) => {
      if (i > 0) this.line(points[i - 1].x, points[i - 1].y, p.x, p.y, 1.5, color);
      this.rect(p.x - 2, p.y - 2, 4, 4, color);
      this.text(p.label, p.x - 12, chartY + 6, 8, [0.75, 0.78, 0.86]);
    });
    this.y = chartY - 18;
  }

  build(): Uint8Array {
    const fontObjId = this.pushObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");

    const pageObjIds: number[] = [];
    for (const page of this.pages) {
      const stream = page.content.join("\n");
      const contentId = this.pushObject(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
      const pageId = this.pushObject(`<< /Type /Page /Parent 0 0 R /MediaBox [0 0 ${this.width} ${this.height}] /Contents ${contentId} 0 R /Resources << /Font << /F1 ${fontObjId} 0 R >> >> >>`);
      pageObjIds.push(pageId);
    }

    const pagesId = this.pushObject(`<< /Type /Pages /Kids [${pageObjIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageObjIds.length} >>`);

    this.objects = this.objects.map((obj) => ({ id: obj.id, body: obj.body.replace("/Parent 0 0 R", `/Parent ${pagesId} 0 R`) }));

    const catalogId = this.pushObject(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);

    const chunks: string[] = ["%PDF-1.4\n"]; 
    const offsets: number[] = [0];
    for (const obj of this.objects) {
      offsets.push(chunks.join("").length);
      chunks.push(`${obj.id} 0 obj\n${obj.body}\nendobj\n`);
    }

    const xrefPos = chunks.join("").length;
    chunks.push(`xref\n0 ${this.objects.length + 1}\n0000000000 65535 f \n`);
    for (let i = 1; i <= this.objects.length; i += 1) {
      const off = offsets[i] ?? 0;
      chunks.push(`${off.toString().padStart(10, "0")} 00000 n \n`);
    }
    chunks.push(`trailer\n<< /Size ${this.objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefPos}\n%%EOF`);

    return new TextEncoder().encode(chunks.join(""));
  }

  private pushObject(body: string): number {
    const id = this.objects.length + 1;
    this.objects.push({ id, body });
    return id;
  }
}

export function buildFinancialAnalysisPdf(input: ReportInput): Uint8Array {
  const pdf = new SimplePdf();
  const generated = new Date(input.generatedAtIso).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });

  pdf.rect(0, 0, pdf.width, pdf.height, [0.03, 0.05, 0.11]);
  pdf.rect(0, pdf.height - 160, pdf.width, 160, [0.06, 0.14, 0.26]);
  pdf.text(input.companyName, 52, pdf.height - 86, 20, [0.95, 0.98, 1]);
  pdf.text("Financial Analysis Report", 52, pdf.height - 116, 28, [0.56, 0.9, 1]);
  pdf.text(`Period: ${formatDateRange(input.startDate, input.endDate)}`, 52, pdf.height - 145, 11, [0.8, 0.9, 1]);
  pdf.text(`Accounting Method: ${input.accountingMethod} | Generated: ${generated}`, 52, pdf.height - 162, 10, [0.7, 0.82, 0.98]);
  pdf.y = pdf.height - 210;

  pdf.sectionTitle("B. Executive Summary");
  const executiveNarrative = buildExecutiveNarrative({
    trend: input.analysis.revenueTrend,
    totals: input.analysis.totals,
    margin: input.analysis.margin,
    strongestRevenueMonth: input.analysis.revenueHigh,
    weakestRevenueMonth: input.analysis.revenueLow,
    strongestProfitMonth: input.analysis.profitHigh,
    weakestProfitMonth: input.analysis.profitLow,
  });
  pdf.writeParagraph(executiveNarrative);
  pdf.table(
    ["Metric", "Value"],
    [
      ["Total Revenue", formatCurrency(input.currency, input.analysis.totals.revenue)],
      ["Total Expenses", formatCurrency(input.currency, input.analysis.totals.expenses)],
      ["Net Profit / Loss", formatCurrency(input.currency, input.analysis.totals.profit)],
      ["Net Margin", formatPercent(input.analysis.margin)],
      ["Revenue Trend", input.analysis.revenueTrend],
    ],
    [260, 240]
  );

  pdf.sectionTitle("C. Revenue Growth Analysis");
  pdf.trendChart(
    "Revenue Trend",
    input.series.map((p) => ({ label: p.month.slice(5), value: p.revenue })),
    [0.2, 0.76, 0.93]
  );
  pdf.table(
    ["Month", "Revenue", "MoM Direction"],
    input.series.map((row, idx) => {
      const prev = idx > 0 ? input.series[idx - 1].revenue : row.revenue;
      const direction = idx === 0 ? "Base" : row.revenue > prev ? "Up" : row.revenue < prev ? "Down" : "Flat";
      return [monthLabel(row.month), formatCurrency(input.currency, row.revenue), direction];
    }),
    [190, 160, 150]
  );
  pdf.writeParagraph(
    `Revenue trend is classified as ${input.analysis.revenueTrend}. Strongest month was ${
      input.analysis.revenueHigh ? monthLabel(input.analysis.revenueHigh.month) : "N/A"
    }, weakest was ${input.analysis.revenueLow ? monthLabel(input.analysis.revenueLow.month) : "N/A"}. Average monthly revenue stood at ${formatCurrency(
      input.currency,
      input.analysis.avgRevenue
    )}, while first-to-last growth was ${formatPercent(input.analysis.revenueGrowth)}.`
  );

  pdf.sectionTitle("D. Expense Growth & Cost Pressure Analysis");
  pdf.trendChart(
    "Expense Trend",
    input.series.map((p) => ({ label: p.month.slice(5), value: p.expenses })),
    [0.95, 0.65, 0.2]
  );
  pdf.table(
    ["Expense Category", "Total", "Period Growth"],
    input.analysis.topExpenseCategories.slice(0, 6).map((row) => [row.name.slice(0, 28), formatCurrency(input.currency, row.total), formatPercent(row.growth)]),
    [250, 130, 130]
  );
  pdf.writeParagraph(
    `Expense trend is ${input.analysis.expenseTrend}. Expense growth from first to last month is ${formatPercent(
      input.analysis.expenseGrowth
    )} versus revenue growth of ${formatPercent(input.analysis.revenueGrowth)}. Highest growing expense heads include ${
      input.analysis.fastestGrowingExpenseCategories.length
        ? input.analysis.fastestGrowingExpenseCategories.map((x) => x.name).slice(0, 3).join(", ")
        : "no material positive growth categories"
    }.`
  );

  pdf.sectionTitle("E. Profitability Analysis");
  pdf.trendChart(
    "Profit Trend",
    input.series.map((p) => ({ label: p.month.slice(5), value: p.profit })),
    [0.28, 0.85, 0.58]
  );
  pdf.writeParagraph(
    `Total net ${input.analysis.totals.profit >= 0 ? "profit" : "loss"} for the period is ${formatCurrency(
      input.currency,
      input.analysis.totals.profit
    )}, with average monthly profit of ${formatCurrency(input.currency, input.analysis.avgProfit)} and net margin at ${formatPercent(
      input.analysis.margin
    )}. Best month by profit was ${input.analysis.profitHigh ? monthLabel(input.analysis.profitHigh.month) : "N/A"}, while the weakest was ${
      input.analysis.profitLow ? monthLabel(input.analysis.profitLow.month) : "N/A"
    }. Operational performance trend is ${input.analysis.profitTrend.toLowerCase()} across the review window.`
  );

  pdf.sectionTitle("F. Retained Earning Deep Analysis");
  const retained = input.retained ?? {};
  const investments = retained?.investments ?? {};
  pdf.table(
    ["Metric", "Amount"],
    [
      ["Net Profit Contribution", formatCurrency(input.currency, retained?.netProfit ?? 0)],
      ["Long-term Asset Movement", formatCurrency(input.currency, retained?.longTermAssetsMovement ?? 0)],
      ["Total Investments", formatCurrency(input.currency, investments?.totalInvestments ?? 0)],
      ["Contribution Received", formatCurrency(input.currency, investments?.contribution ?? 0)],
      ["Net Investments", formatCurrency(input.currency, investments?.netInvestments ?? 0)],
      ["Retained Earning Position", formatCurrency(input.currency, retained?.retainedEarning ?? 0)],
    ],
    [290, 210]
  );
  const ltRows = (retained?.longTermAssets?.detail ?? []).slice(0, 6).map((x: any) => [x.label, formatCurrency(input.currency, x.end), formatCurrency(input.currency, x.movement)]);
  if (ltRows.length) pdf.table(["Long-term Asset", "Ending", "Movement"], ltRows, [210, 130, 130]);

  const invRows = [
    ["Buraq", formatCurrency(input.currency, investments?.buraq ?? 0)],
    ["Convoi", formatCurrency(input.currency, investments?.convoi ?? 0)],
    ["Stratger", formatCurrency(input.currency, investments?.stratger ?? 0)],
  ];
  pdf.table(["Investment", "Amount"], invRows, [290, 210]);
  pdf.writeParagraph(
    `Retained earnings indicate ${
      (retained?.retainedEarning ?? 0) >= 0 ? "positive accumulation" : "pressure on earnings"
    }. Net investments of ${formatCurrency(input.currency, investments?.netInvestments ?? 0)} and long-term asset movement of ${formatCurrency(
      input.currency,
      retained?.longTermAssetsMovement ?? 0
    )} were absorbed against period profitability.`
  );

  pdf.sectionTitle("G. CFO Forecast Deep Analysis");
  const forecast = input.forecast ?? {};
  const fRows = (forecast?.forecast ?? []).map((x: any) => ({ label: x.month.slice(5), value: x.revenue - x.opex }));
  pdf.trendChart("Forecast Revenue vs Opex Spread", fRows.slice(0, 8), [0.58, 0.64, 0.97]);
  pdf.table(
    ["Forecast Metric", "Value"],
    [
      ["Horizon", `${forecast?.horizon ?? 6} months`],
      ["Avg Monthly Revenue", formatCurrency(input.currency, forecast?.averages?.avgMonthlyRevenue ?? 0)],
      ["Avg Monthly Opex", formatCurrency(input.currency, forecast?.averages?.avgMonthlyOpex ?? 0)],
      ["Avg Monthly Profit", formatCurrency(input.currency, forecast?.averages?.avgMonthlyProfit ?? 0)],
      ["Break-even Revenue", formatCurrency(input.currency, forecast?.benchmarks?.breakevenRevenue ?? 0)],
      ["10% Margin Revenue", formatCurrency(input.currency, forecast?.benchmarks?.margin10 ?? 0)],
      ["20% Margin Revenue", formatCurrency(input.currency, forecast?.benchmarks?.margin20 ?? 0)],
      ["30% Margin Revenue", formatCurrency(input.currency, forecast?.benchmarks?.margin30 ?? 0)],
    ],
    [280, 220]
  );
  pdf.writeParagraph(
    `Forecast implies a ${forecast?.trends?.revenueMoM >= 0 ? "positive" : "negative"} revenue drift and ${
      forecast?.trends?.expensesMoM >= 0 ? "rising" : "softening"
    } opex pattern. Current average revenue is ${(forecast?.averages?.avgMonthlyRevenue ?? 0) >= (forecast?.benchmarks?.breakevenRevenue ?? 0) ? "above" : "below"} the estimated break-even line.`
  );

  pdf.sectionTitle("H. AR/AP Snapshot Summary");
  const totalPayables = input.arAp?.payables?.totalPayables ?? 0;
  const totalReceivables = input.arAp?.receivables?.totalReceivables ?? 0;
  pdf.table(
    ["AR/AP Metric", "Value"],
    [
      ["Total Payables", formatCurrency(input.currency, totalPayables)],
      ["Total Receivables", formatCurrency(input.currency, totalReceivables)],
      ["Net Position (AR-AP)", formatCurrency(input.currency, totalReceivables - totalPayables)],
      ["AP Aging Source", input.arAp?.apAging?.source ?? "N/A"],
      ["Manual Adjustments", input.manualAdjustments.length ? `${input.manualAdjustments.length} entries` : "None"],
    ],
    [260, 240]
  );

  pdf.sectionTitle("I. Closing Observations / Management Notes");
  const closing = buildClosingNotes({
    trend: input.analysis.revenueTrend,
    margin: input.analysis.margin,
    revenueGrowth: input.analysis.revenueGrowth,
    expenseGrowth: input.analysis.expenseGrowth,
    avgRevenue: forecast?.averages?.avgMonthlyRevenue ?? input.analysis.avgRevenue,
    breakEven: forecast?.benchmarks?.breakevenRevenue ?? input.analysis.avgExpenses,
  });
  closing.forEach((line, idx) => pdf.writeParagraph(`${idx + 1}. ${line}`));

  return pdf.build();
}
