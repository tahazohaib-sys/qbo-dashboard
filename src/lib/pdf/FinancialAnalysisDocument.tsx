// The Financial Analysis PDF — a corporate-style report assembled from the
// same data every dashboard tab shows, built for a stakeholder to read start
// to finish or jump straight to a section from the executive summary.

import React from "react";
import { Document, Page, View, Text, Link } from "@react-pdf/renderer";
import {
  COLORS,
  FONT,
  PAGE,
  DONUT_PALETTE,
  formatMoney,
  formatCompact,
  formatPct,
  formatDateLong,
  formatMonthLabel,
} from "./theme";
import { ReportChrome, SectionHeader, SubHeading, Paragraph, KpiGrid, DataTable, BulletList, Callout, Divider } from "./blocks";
import { GroupedBarChart, LineTrendChart, DonutChart, DonutLegend, ChartLegend } from "./charts";
import type { FinancialReportData } from "./reportData";

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

const SECTIONS = [
  { id: "sec-summary", title: "Executive Summary", desc: "Period highlights, commentary, and key risk factors." },
  { id: "sec-pnl", title: "Profit & Loss Analysis", desc: "Revenue, expenses, and margin trend for the selected period." },
  { id: "sec-cash", title: "Cash & Bank Position", desc: "Balances across all connected bank and cash accounts." },
  { id: "sec-arap", title: "Accounts Receivable & Payable", desc: "Outstanding balances and aging by vendor." },
  { id: "sec-retained", title: "Retained Earnings", desc: "Movement in long-term assets, investments, and retained capital." },
  { id: "sec-forecast", title: "Financial Forecast", desc: "Projected trajectory and scenario comparison for the months ahead." },
];

export function FinancialAnalysisDocument({ data }: { data: FinancialReportData }) {
  const currency = data.dashboard?.currency ?? "PKR";
  const companyName = data.dashboard?.companyName ?? "Company";
  const period = `${formatDateLong(data.range.start)} — ${formatDateLong(data.range.end)}`;
  const generated = new Date(data.generatedAt).toLocaleString("en-US", {
    dateStyle: "long",
    timeStyle: "short",
  });

  const money = (n: number) => formatMoney(currency, n);
  const compact = (n: number) => formatCompact(currency, n);

  return (
    <Document title={`Financial Analysis — ${companyName}`} author={companyName} subject="Financial Analysis Report">
      <CoverPage companyName={companyName} period={period} generated={generated} method={data.range.method} />
      <TableOfContents companyName={companyName} />
      <ExecutiveSummarySection data={data} companyName={companyName} currency={currency} money={money} />
      <ProfitAndLossSection data={data} companyName={companyName} money={money} compact={compact} />
      <CashPositionSection data={data} companyName={companyName} />
      <ArApSection data={data} companyName={companyName} money={money} compact={compact} />
      <RetainedEarningsSection data={data} companyName={companyName} money={money} />
      <ForecastSection data={data} companyName={companyName} money={money} />
    </Document>
  );
}

/* --------------------------------- Cover --------------------------------- */

function CoverPage({ companyName, period, generated, method }: { companyName: string; period: string; generated: string; method: string }) {
  return (
    <Page size={PAGE.size} style={{ paddingTop: 0, paddingBottom: 0, paddingHorizontal: 0, backgroundColor: COLORS.page }}>
      <View style={{ height: 10, backgroundColor: COLORS.brand }} />
      <View style={{ paddingHorizontal: 56, paddingTop: 140 }}>
        <Text style={{ fontSize: 9, letterSpacing: 2, color: COLORS.brand, fontFamily: FONT.bold, textTransform: "uppercase" }}>
          Financial Analysis Report
        </Text>
        <Text style={{ fontSize: 30, fontFamily: FONT.bold, color: COLORS.ink, marginTop: 12, lineHeight: 1.15 }}>
          {companyName}
        </Text>
        <Text style={{ fontSize: 13, color: COLORS.body, marginTop: 10 }}>{period}</Text>

        <View style={{ marginTop: 40, borderTopWidth: 0.75, borderTopColor: COLORS.border, paddingTop: 18, width: 340 }}>
          <MetaRow label="Accounting Method" value={method} />
          <MetaRow label="Prepared" value={generated} />
          <MetaRow label="Classification" value="Confidential — internal use only" />
        </View>
      </View>

      <View style={{ position: "absolute", bottom: 48, left: 56, right: 56 }}>
        <Text style={{ fontSize: 8, color: COLORS.faint, lineHeight: 1.5 }}>
          This report is compiled directly from the finance dashboard for the period stated above. Figures reflect data
          available at the time of preparation and remain subject to routine reconciliation.
        </Text>
      </View>
    </Page>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}>
      <Text style={{ fontSize: 9, color: COLORS.muted }}>{label}</Text>
      <Text style={{ fontSize: 9, color: COLORS.ink, fontFamily: FONT.bold }}>{value}</Text>
    </View>
  );
}

/* ------------------------------ Table of contents ------------------------------ */

function TableOfContents({ companyName }: { companyName: string }) {
  return (
    <Page size={PAGE.size} style={{ paddingTop: PAGE.paddingTop, paddingBottom: PAGE.paddingBottom, paddingHorizontal: PAGE.paddingX }}>
      <ReportChrome companyName={companyName} pageLabel="Contents" />
      <SectionHeader eyebrow="Contents" title="What's in this report" />
      <View>
        {SECTIONS.map((s, i) => (
          <Link key={s.id} src={`#${s.id}`} style={{ textDecoration: "none" }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingVertical: 12,
                borderBottomWidth: 0.75,
                borderBottomColor: COLORS.border,
              }}
            >
              <Text style={{ fontSize: 10, fontFamily: FONT.bold, color: COLORS.brand, width: 20 }}>{String(i + 1).padStart(2, "0")}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 11.5, fontFamily: FONT.bold, color: COLORS.ink }}>{s.title}</Text>
                <Text style={{ fontSize: 8.5, color: COLORS.muted, marginTop: 2 }}>{s.desc}</Text>
              </View>
              <Text style={{ fontSize: 10, color: COLORS.brand }}>→</Text>
            </View>
          </Link>
        ))}
      </View>
    </Page>
  );
}

/* ------------------------------ Executive summary ------------------------------ */

function ExecutiveSummarySection({
  data,
  companyName,
  currency,
  money,
}: {
  data: FinancialReportData;
  companyName: string;
  currency: string;
  money: (n: number) => string;
}) {
  const ytd = data.dashboard?.kpis?.ytd;
  const revenue = num(ytd?.revenue);
  const expenses = num(ytd?.expenses);
  const profit = num(ytd?.profit);
  const margin = revenue !== 0 ? profit / revenue : 0;

  const cashTotals = data.cashBanks?.totalsByCurrency ?? {};
  const cashPrimary = cashTotals[currency] ?? Object.values(cashTotals)[0] ?? 0;
  const totalReceivables = num(data.arAp?.receivables?.totalReceivables);
  const totalPayables = num(data.arAp?.payables?.totalPayables);

  const insights = data.insights;

  return (
    <Page size={PAGE.size} style={{ paddingTop: PAGE.paddingTop, paddingBottom: PAGE.paddingBottom, paddingHorizontal: PAGE.paddingX }}>
      <ReportChrome companyName={companyName} pageLabel="Executive Summary" />
      <SectionHeader id="sec-summary" eyebrow="Section 01" title="Executive Summary" subtitle={`Period totals and commentary for ${companyName}.`} />

      <KpiGrid
        tiles={[
          { label: "Total Revenue", value: money(revenue), linkTo: "#sec-pnl" },
          { label: "Total Expenses", value: money(expenses), linkTo: "#sec-pnl" },
          { label: "Net Profit", value: money(profit), tone: profit >= 0 ? "positive" : "negative", linkTo: "#sec-pnl" },
          { label: "Net Margin", value: formatPct(margin), tone: margin >= 0 ? "positive" : "negative", linkTo: "#sec-pnl" },
        ]}
      />
      <View style={{ marginTop: 8 }}>
        <KpiGrid
          tiles={[
            { label: `Cash Position (${currency})`, value: money(cashPrimary), linkTo: "#sec-cash" },
            { label: "Total Receivables", value: money(totalReceivables), linkTo: "#sec-arap" },
            { label: "Total Payables", value: money(totalPayables), linkTo: "#sec-arap" },
            {
              label: "Net Working Position",
              value: money(totalReceivables - totalPayables),
              tone: totalReceivables - totalPayables >= 0 ? "positive" : "negative",
              linkTo: "#sec-arap",
            },
          ]}
        />
      </View>

      {insights?.summary ? (
        <>
          <SubHeading>Commentary</SubHeading>
          <Paragraph>{insights.summary}</Paragraph>
        </>
      ) : null}

      {insights?.highlights?.length ? (
        <>
          <SubHeading>Key Observations</SubHeading>
          <BulletList items={insights.highlights} />
        </>
      ) : null}

      {insights?.risks?.length ? (
        <>
          <SubHeading>Risk Factors</SubHeading>
          <BulletList items={insights.risks} tone="negative" />
        </>
      ) : null}

      {insights?.actions?.length ? (
        <>
          <SubHeading>Recommended Actions</SubHeading>
          <BulletList items={insights.actions} tone="positive" />
        </>
      ) : null}

      {data.warnings.length ? (
        <Callout title="Data Notes" tone="caution">
          <BulletList items={data.warnings} tone="caution" />
        </Callout>
      ) : null}
    </Page>
  );
}

/* --------------------------------- Profit & Loss --------------------------------- */

function ProfitAndLossSection({
  data,
  companyName,
  money,
  compact,
}: {
  data: FinancialReportData;
  companyName: string;
  money: (n: number) => string;
  compact: (n: number) => string;
}) {
  const dash = data.dashboard;
  const series = dash?.series ?? [];
  const ytd = dash?.kpis?.ytd;
  const revenue = num(ytd?.revenue);
  const expenses = num(ytd?.expenses);
  const profit = num(ytd?.profit);
  const margin = revenue !== 0 ? profit / revenue : 0;

  const months = series.map((s) => formatMonthLabel(s.month));
  const expenseTop = data.pnlBreakdown.slice(0, 8);
  const expenseOther = data.pnlBreakdown.slice(8).reduce((s, x) => s + x.value, 0);
  const donutData = [
    ...expenseTop.map((e, i) => ({ name: e.name, value: e.value, color: DONUT_PALETTE[i % DONUT_PALETTE.length] })),
    ...(expenseOther > 0 ? [{ name: "Other categories", value: expenseOther, color: COLORS.faint }] : []),
  ];

  return (
    <Page size={PAGE.size} style={{ paddingTop: PAGE.paddingTop, paddingBottom: PAGE.paddingBottom, paddingHorizontal: PAGE.paddingX }} wrap>
      <ReportChrome companyName={companyName} pageLabel="Profit & Loss Analysis" />
      <SectionHeader
        id="sec-pnl"
        eyebrow="Section 02"
        title="Profit & Loss Analysis"
        subtitle="Monthly revenue, expenses, and profitability across the selected period."
      />

      {!dash ? (
        <Callout title="Data Unavailable" tone="negative">
          <Paragraph>Profit &amp; Loss data could not be retrieved for this period.</Paragraph>
        </Callout>
      ) : (
        <>
          <KpiGrid
            tiles={[
              { label: "Total Revenue", value: money(revenue) },
              { label: "Total Expenses", value: money(expenses) },
              { label: "Net Profit", value: money(profit), tone: profit >= 0 ? "positive" : "negative" },
              { label: "Net Margin", value: formatPct(margin), tone: margin >= 0 ? "positive" : "negative" },
            ]}
          />

          <SubHeading>Monthly Trend</SubHeading>
          {series.length ? (
            <>
              <GroupedBarChart
                categories={months}
                series={[
                  { name: "Revenue", color: COLORS.seriesA, values: series.map((s) => s.revenue) },
                  { name: "Expenses", color: COLORS.seriesB, values: series.map((s) => s.expenses) },
                ]}
              />
              <ChartLegend items={[{ label: "Revenue", color: COLORS.seriesA }, { label: "Expenses", color: COLORS.seriesB }]} />
            </>
          ) : (
            <Paragraph>No monthly data available for the selected period.</Paragraph>
          )}

          <SubHeading>Monthly Detail</SubHeading>
          <DataTable
            columns={[
              { key: "month", header: "Month" },
              { key: "revenue", header: "Revenue", align: "right" },
              { key: "expenses", header: "Expenses", align: "right" },
              { key: "profit", header: "Net Profit", align: "right" },
              { key: "margin", header: "Margin", align: "right" },
            ]}
            rows={series.map((s) => ({
              month: formatMonthLabel(s.month),
              revenue: money(s.revenue),
              expenses: money(s.expenses),
              profit: money(s.profit),
              margin: formatPct(s.revenue !== 0 ? s.profit / s.revenue : 0),
            }))}
            totalRow={{
              month: "Period Total",
              revenue: money(revenue),
              expenses: money(expenses),
              profit: money(profit),
              margin: formatPct(margin),
            }}
          />

          <SubHeading>Expense Composition</SubHeading>
          {donutData.length ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 20 }}>
              <DonutChart data={donutData} size={140} />
              <DonutLegend data={donutData} formatValue={compact} />
            </View>
          ) : (
            <Paragraph>No expense line items were recorded for the selected period.</Paragraph>
          )}
          {data.pnlBreakdown.length > 8 ? (
            <Text style={{ fontSize: 7.5, color: COLORS.faint, marginTop: 6 }}>
              Showing the 8 largest expense categories. {data.pnlBreakdown.length - 8} additional categories are grouped under
              &quot;Other categories&quot;.
            </Text>
          ) : null}
        </>
      )}
    </Page>
  );
}

/* --------------------------------- Cash & banks --------------------------------- */

function CashPositionSection({
  data,
  companyName,
}: {
  data: FinancialReportData;
  companyName: string;
}) {
  const cash = data.cashBanks;
  const totals = cash?.totalsByCurrency ?? {};
  const currencies = Object.keys(totals).sort();

  return (
    <Page size={PAGE.size} style={{ paddingTop: PAGE.paddingTop, paddingBottom: PAGE.paddingBottom, paddingHorizontal: PAGE.paddingX }} wrap>
      <ReportChrome companyName={companyName} pageLabel="Cash & Bank Position" />
      <SectionHeader id="sec-cash" eyebrow="Section 03" title="Cash & Bank Position" subtitle="Current balances across all connected bank and cash accounts." />

      {!cash ? (
        <Callout title="Data Unavailable" tone="negative">
          <Paragraph>Bank and cash balance data could not be retrieved.</Paragraph>
        </Callout>
      ) : (
        <>
          {currencies.length ? (
            <KpiGrid tiles={currencies.slice(0, 4).map((c) => ({ label: `${c} Total`, value: formatMoney(c, totals[c]) }))} />
          ) : (
            <Paragraph>No bank or cash accounts were found.</Paragraph>
          )}

          <SubHeading>Accounts</SubHeading>
          {cash.accounts.length ? (
            <DataTable
              columns={[
                { key: "name", header: "Account", width: 2 },
                { key: "type", header: "Type", width: 1.4 },
                { key: "currency", header: "Currency", align: "center" },
                { key: "balance", header: "Balance", align: "right", width: 1.3 },
              ]}
              rows={cash.accounts.map((a) => ({
                name: a.name,
                type: a.accountSubType || a.accountType,
                currency: a.currency,
                balance: formatMoney(a.currency, a.currentBalance),
              }))}
            />
          ) : (
            <Paragraph>No accounts to display.</Paragraph>
          )}
        </>
      )}
    </Page>
  );
}

/* --------------------------------- AR / AP --------------------------------- */

function ArApSection({
  data,
  companyName,
  money,
  compact,
}: {
  data: FinancialReportData;
  companyName: string;
  money: (n: number) => string;
  compact: (n: number) => string;
}) {
  const arAp = data.arAp;
  const payables = arAp?.payables;
  const receivables = arAp?.receivables;
  const aging = arAp?.apAging;
  const topVendors = (aging?.vendors ?? []).slice(0, 10);
  const monthlySeries = (arAp?.monthlySeries ?? []).filter((m) => !m.error);

  return (
    <Page size={PAGE.size} style={{ paddingTop: PAGE.paddingTop, paddingBottom: PAGE.paddingBottom, paddingHorizontal: PAGE.paddingX }} wrap>
      <ReportChrome companyName={companyName} pageLabel="Accounts Receivable & Payable" />
      <SectionHeader
        id="sec-arap"
        eyebrow="Section 04"
        title="Accounts Receivable & Payable"
        subtitle={`Balances as of ${formatDateLong(arAp?.asOf ?? data.range.end)}.`}
      />

      {!arAp ? (
        <Callout title="Data Unavailable" tone="negative">
          <Paragraph>Receivable and payable data could not be retrieved.</Paragraph>
        </Callout>
      ) : (
        <>
          <KpiGrid
            tiles={[
              { label: "Total Receivables", value: money(num(receivables?.totalReceivables)) },
              { label: "Current Payables", value: money(num(payables?.current?.totalCurrentPayables)) },
              { label: "Long-term Payables", value: money(num(payables?.longTerm?.totalLongTermPayables)) },
              { label: "Total Payables", value: money(num(payables?.totalPayables)), tone: "negative" },
            ]}
          />

          <SubHeading>Payables Breakdown</SubHeading>
          <DataTable
            columns={[
              { key: "label", header: "Category", width: 2 },
              { key: "amount", header: "Amount", align: "right" },
            ]}
            rows={[
              { label: "Payroll Payable", amount: money(num(payables?.current?.payrollPayable)) },
              { label: "Withholding Tax Payable (Vendors)", amount: money(num(payables?.current?.withHoldingTaxPayableVendors)) },
              { label: "Accounts Payable (Vendor Bills)", amount: money(num(payables?.current?.accountsPayable)) },
              { label: "Sir Aatif Loan to Company", amount: money(num(payables?.longTerm?.sirAatifLoanToCompany)) },
              { label: "Payroll Withholding Tax Payable", amount: money(num(payables?.longTerm?.payrollWithHoldingTaxPayable)) },
            ]}
            totalRow={{ label: "Total Payables", amount: money(num(payables?.totalPayables)) }}
          />

          <SubHeading>Receivables Breakdown</SubHeading>
          <DataTable
            columns={[
              { key: "label", header: "Category", width: 2 },
              { key: "amount", header: "Amount", align: "right" },
            ]}
            rows={[
              { label: "Loan Against Salary", amount: money(num(receivables?.loanAgainstSalary)) },
              { label: "Tax Withheld", amount: money(num(receivables?.taxWithheld)) },
            ]}
            totalRow={{ label: "Total Receivables", amount: money(num(receivables?.totalReceivables)) }}
          />

          <SubHeading>Accounts Payable Aging by Vendor</SubHeading>
          {topVendors.length ? (
            <>
              <DataTable
                dense
                columns={[
                  { key: "vendor", header: "Vendor", width: 1.8 },
                  { key: "current", header: "Current", align: "right" },
                  { key: "d30", header: "1-30", align: "right" },
                  { key: "d60", header: "31-60", align: "right" },
                  { key: "d90", header: "61-90", align: "right" },
                  { key: "d90p", header: "91+", align: "right" },
                  { key: "total", header: "Total", align: "right" },
                ]}
                rows={topVendors.map((v) => ({
                  vendor: v.vendor,
                  current: compact(v.current),
                  d30: compact(v["1_30"]),
                  d60: compact(v["31_60"]),
                  d90: compact(v["61_90"]),
                  d90p: compact(v["91_plus"]),
                  total: compact(v.total),
                }))}
                totalRow={{ vendor: "Total Accounts Payable", current: "", d30: "", d60: "", d90: "", d90p: "", total: money(num(aging?.totalAP)) }}
              />
              {(aging?.vendors?.length ?? 0) > 10 ? (
                <Text style={{ fontSize: 7.5, color: COLORS.faint, marginTop: 6 }}>
                  Showing the 10 largest vendor balances. {(aging?.vendors?.length ?? 0) - 10} additional vendors are included in
                  the total above.
                </Text>
              ) : null}
            </>
          ) : (
            <Paragraph>No outstanding vendor bills for the selected period.</Paragraph>
          )}

          {monthlySeries.length > 1 ? (
            <>
              <SubHeading>Monthly Trend</SubHeading>
              <LineTrendChart
                categories={monthlySeries.map((m) => formatMonthLabel(m.month))}
                series={[
                  { name: "Payables", color: COLORS.negative, values: monthlySeries.map((m) => m.payables) },
                  { name: "Receivables", color: COLORS.seriesC, values: monthlySeries.map((m) => m.receivables) },
                ]}
              />
              <ChartLegend items={[{ label: "Payables", color: COLORS.negative }, { label: "Receivables", color: COLORS.seriesC }]} />
            </>
          ) : null}
        </>
      )}
    </Page>
  );
}

/* --------------------------------- Retained earnings --------------------------------- */

function RetainedEarningsSection({
  data,
  companyName,
  money,
}: {
  data: FinancialReportData;
  companyName: string;
  money: (n: number) => string;
}) {
  const retained = data.retained;
  const ltDetail = retained?.longTermAssets?.detail ?? [];
  const invItems = retained?.investments?.items ?? [];
  const donutSource = retained?.charts?.retainedDonut ?? [];
  const donutData = donutSource
    .filter((d) => d.value > 0)
    .map((d, i) => ({ name: d.name, value: d.value, color: DONUT_PALETTE[i % DONUT_PALETTE.length] }));

  return (
    <Page size={PAGE.size} style={{ paddingTop: PAGE.paddingTop, paddingBottom: PAGE.paddingBottom, paddingHorizontal: PAGE.paddingX }} wrap>
      <ReportChrome companyName={companyName} pageLabel="Retained Earnings" />
      <SectionHeader
        id="sec-retained"
        eyebrow="Section 05"
        title="Retained Earnings"
        subtitle="Movement in long-term assets, investments, and retained capital for the period."
      />

      {!retained ? (
        <Callout title="Data Unavailable" tone="negative">
          <Paragraph>Retained earnings data could not be retrieved for this period.</Paragraph>
        </Callout>
      ) : (
        <>
          <KpiGrid
            tiles={[
              { label: "Net Profit", value: money(num(retained.netProfit)) },
              { label: "Long-term Assets Movement", value: money(num(retained.longTermAssetsMovement)) },
              { label: "Net Investments", value: money(num(retained.investments?.netInvestments)) },
              { label: "Retained Earnings", value: money(num(retained.retainedEarning)), tone: num(retained.retainedEarning) >= 0 ? "positive" : "negative" },
            ]}
          />

          <SubHeading>Long-term Assets Movement</SubHeading>
          {ltDetail.length ? (
            <DataTable
              columns={[
                { key: "label", header: "Asset", width: 1.6 },
                { key: "end", header: "Period End", align: "right" },
                { key: "prior", header: "Prior", align: "right" },
                { key: "movement", header: "Movement", align: "right" },
              ]}
              rows={ltDetail.map((d) => ({
                label: d.label,
                end: money(d.end),
                prior: money(d.prior),
                movement: money(d.movement),
              }))}
              totalRow={{
                label: "Total",
                end: money(num(retained.longTermAssets?.end)),
                prior: money(num(retained.longTermAssets?.prior)),
                movement: money(num(retained.longTermAssetsMovement)),
              }}
            />
          ) : (
            <Paragraph>No long-term asset movement recorded for the selected period.</Paragraph>
          )}

          <SubHeading>Investments & Contributions</SubHeading>
          {invItems.length ? (
            <DataTable
              columns={[
                { key: "label", header: "Item", width: 2 },
                { key: "type", header: "Type" },
                { key: "amount", header: "Amount", align: "right" },
              ]}
              rows={invItems.map((it) => ({
                label: it.label,
                type: it.type === "contribution" ? "Contribution" : "Investment",
                amount: money(it.amount),
              }))}
              totalRow={{ label: "Net Investments", type: "", amount: money(num(retained.investments?.netInvestments)) }}
            />
          ) : (
            <Paragraph>No investment or contribution activity for the selected period.</Paragraph>
          )}

          <SubHeading>Retained Earnings Composition</SubHeading>
          {donutData.length ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 20 }}>
              <DonutChart data={donutData} size={130} />
              <DonutLegend data={donutData} formatValue={money} />
            </View>
          ) : (
            <Paragraph>Not enough data to break down retained earnings composition.</Paragraph>
          )}
        </>
      )}
    </Page>
  );
}

/* --------------------------------- Forecast --------------------------------- */

function ForecastSection({
  data,
  companyName,
  money,
}: {
  data: FinancialReportData;
  companyName: string;
  money: (n: number) => string;
}) {
  const forecast = data.forecast;
  const base = forecast?.scenarios?.base ?? forecast?.forecast ?? [];
  const scenarioSummary = forecast?.scenarios?.summary;
  const months = base.map((b) => formatMonthLabel(b.month));

  return (
    <Page size={PAGE.size} style={{ paddingTop: PAGE.paddingTop, paddingBottom: PAGE.paddingBottom, paddingHorizontal: PAGE.paddingX }} wrap>
      <ReportChrome companyName={companyName} pageLabel="Financial Forecast" />
      <SectionHeader
        id="sec-forecast"
        eyebrow="Section 06"
        title="Financial Forecast"
        subtitle={`Projected trajectory for the ${forecast?.horizon ?? 6} months following the selected period, based on recent trend.`}
      />

      {!forecast ? (
        <Callout title="Forecast Unavailable" tone="caution">
          <Paragraph>A forecast could not be generated — the selected period may not contain enough monthly data.</Paragraph>
        </Callout>
      ) : (
        <>
          <KpiGrid
            tiles={[
              { label: "Avg Monthly Revenue", value: money(num(forecast.averages?.avgMonthlyRevenue)) },
              { label: "Avg Monthly Profit", value: money(num(forecast.averages?.avgMonthlyProfit)) },
              { label: "Avg Net Margin", value: formatPct(num(forecast.averages?.avgNetMarginPct)) },
              forecast.summary?.runwayMonths != null
                ? { label: "Cash Runway", value: `${forecast.summary.runwayMonths.toFixed(1)} months` }
                : { label: "Breakeven Revenue", value: money(num(forecast.benchmarks?.breakevenRevenue)) },
            ]}
          />

          <SubHeading>Scenario Comparison ({forecast.horizon}-Month Outlook)</SubHeading>
          {scenarioSummary ? (
            <DataTable
              columns={[
                { key: "scenario", header: "Scenario", width: 1.4 },
                { key: "endRevenue", header: "End Revenue", align: "right" },
                { key: "endProfit", header: "End Profit", align: "right" },
                { key: "totalProfit", header: "Cumulative Profit", align: "right" },
                { key: "endMargin", header: "End Margin", align: "right" },
              ]}
              rows={[
                {
                  scenario: "Pessimistic",
                  endRevenue: money(scenarioSummary.pessimistic.endRevenue),
                  endProfit: money(scenarioSummary.pessimistic.endProfit),
                  totalProfit: money(scenarioSummary.pessimistic.totalProfit),
                  endMargin: formatPct(scenarioSummary.pessimistic.endMarginPct),
                },
                {
                  scenario: "Base",
                  endRevenue: money(scenarioSummary.base.endRevenue),
                  endProfit: money(scenarioSummary.base.endProfit),
                  totalProfit: money(scenarioSummary.base.totalProfit),
                  endMargin: formatPct(scenarioSummary.base.endMarginPct),
                },
                {
                  scenario: "Optimistic",
                  endRevenue: money(scenarioSummary.optimistic.endRevenue),
                  endProfit: money(scenarioSummary.optimistic.endProfit),
                  totalProfit: money(scenarioSummary.optimistic.totalProfit),
                  endMargin: formatPct(scenarioSummary.optimistic.endMarginPct),
                },
              ]}
            />
          ) : (
            <Paragraph>Scenario comparison is not available for this period.</Paragraph>
          )}

          <SubHeading>Base Scenario Trajectory</SubHeading>
          {base.length ? (
            <>
              <LineTrendChart
                categories={months}
                series={[
                  { name: "Revenue", color: COLORS.seriesA, values: base.map((b) => b.revenue) },
                  { name: "Profit", color: COLORS.seriesC, values: base.map((b) => b.profit) },
                ]}
              />
              <ChartLegend items={[{ label: "Revenue", color: COLORS.seriesA }, { label: "Profit", color: COLORS.seriesC }]} />
            </>
          ) : (
            <Paragraph>No forecast trajectory available.</Paragraph>
          )}

          <SubHeading>Breakeven Benchmarks</SubHeading>
          <DataTable
            columns={[
              { key: "label", header: "Benchmark", width: 2 },
              { key: "value", header: "Revenue Required", align: "right" },
            ]}
            rows={[
              { label: "Breakeven Revenue", value: money(num(forecast.benchmarks?.breakevenRevenue)) },
              { label: "Revenue for 10% Net Margin", value: money(num(forecast.benchmarks?.margin10)) },
              { label: "Revenue for 20% Net Margin", value: money(num(forecast.benchmarks?.margin20)) },
              { label: "Revenue for 30% Net Margin", value: money(num(forecast.benchmarks?.margin30)) },
            ]}
          />
          {forecast.benchmarks?.monthsToBreakeven != null ? (
            <Text style={{ fontSize: 8.5, color: COLORS.muted, marginTop: 8 }}>
              Base scenario reaches breakeven in {forecast.benchmarks.monthsToBreakeven} month(s).
            </Text>
          ) : null}

          <Divider />
          <Text style={{ fontSize: 7.5, color: COLORS.faint, lineHeight: 1.5 }}>
            Forecast figures are model-based projections derived from historical trend in the selected period. They are provided
            for planning purposes only and are not a guarantee of future results.
          </Text>
        </>
      )}
    </Page>
  );
}
