// src/app/dashboard/page.tsx
"use client";

import Image from "next/image";
import Link from "next/link";

import React, { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

type DashboardResp = {
  ok: boolean;
  companyName: string;
  currency: string;
  asOf: string;
  accounting_method: "Accrual" | "Cash";
  series: Array<{ month: string; revenue: number; expenses: number; profit: number }>;
  kpis: { mtd: any; ytd: { revenue: number; expenses: number; profit: number } };
  error?: string;
};

type PnlRow = {
  path: string;
  rowType: "Section" | "Data";
  label: string;
  amount: number;
};

type PnlTableResp = {
  ok: boolean;
  start_date: string;
  end_date: string;
  currency: string;
  rows: PnlRow[];
  error?: string;
};

type CashBankAccount = {
  id: string;
  name: string;
  accountType: string;
  accountSubType?: string;
  currency: string;
  currentBalance: number;
};

type CashBanksResp = {
  ok: boolean;
  count: number;
  accounts: CashBankAccount[];
  totalsByCurrency: Record<string, number>;
  error?: string;
};

type AccountTxnsResp = {
  ok: boolean;
  accountId: string;
  accountName: string | null;
  accountCurrency: string | null;
  homeCurrency: string | null;
  count: number;
  transactions: Array<{
    txnId: string | null;
    date: string;
    txnType: string;
    name: string;
    memo: string;
    amountHome: number;
    foreignCurrency: string | null;
    exchangeRate: number | null;
    amountForeign: number | null;
    entity: string | null;
  }>;
  error?: string;
};

/** ✅ Retained earning API shape (kept as-is for the Retained tab) */
type RetainedResp = {
  ok: boolean;
  currency: string;
  start_date?: string;
  end_date?: string;
  prior_as_of_date?: string;
  accounting_method?: "Accrual" | "Cash";

  netProfit?: number;
  longTermAssetsMovement?: number;

  longTermAssets?: {
    end: number;
    prior: number;
    method?: string;
    detail?: Array<{ label: string; end: number; prior: number; movement: number }>;
  };

  investments?: {
    buraq: number;
    convoi: number;
    stratger: number;
    contribution: number;
    totalInvestments: number;
    netInvestments: number;

    period?: {
      buraq: number;
      convoi: number;
      stratger: number;
      contribution: number;
      totalInvestments: number;
      netInvestments: number;
    };
  };

  retainedEarning?: number;

  charts?: {
    investmentBars: Array<{ name: string; value: number }>;
    retainedDonut: Array<{ name: string; value: number }>;
  };

  // old/fallback fields
  profit?: number;
  longTermAssetsAdditions?: number;
  totalInvestments?: number;
  contributionReceived?: number;
  netInvestments?: number;
  fixedAssetAdditions?: Array<{ label: string; amount: number }>;
  investmentsByEntity?: Array<{ label: string; amount: number }>;

  error?: string;
};

/** ✅ CFO Forecast API response (OPEX ONLY) */
type ForecastApiResp = {
  ok: boolean;
  horizon: number;
  meta?: {
    monthsUsed: number;
    lastMonth?: string;
  };
  trends?: {
    revenueMoM: number;
    expensesMoM: number;
    revenueTrendLabel?: "Increasing" | "Decreasing" | "Stable";
    expenseTrendLabel?: "Increasing" | "Decreasing" | "Stable";
  };
  averages?: {
    avgMonthlyRevenue: number;
    avgMonthlyOpex: number;
    avgMonthlyProfit: number;
  };
  benchmarks?: {
    breakevenRevenue: number;
    margin10: number;
    margin20: number;
    margin30: number;
  };
  forecast?: Array<{
    month: string;
    revenue: number;
    opex: number;
    profit: number;
  }>;
  error?: string;
};

/** ✅ AI Insights response */
type AiInsightsResp =
  | {
      ok: true;
      meta: {
        companyName: string;
        currency: string;
        start_date: string;
        end_date: string;
        accounting_method: "Accrual" | "Cash";
        generated_at: string;
      };
      summary: string;
      highlights: string[];
      risks: string[];
      actions: string[];
    }
  | { ok: false; error: string };

/** ✅ AR/AP response */
type ArApResp = {
  ok: boolean;
  asOf: string;
  currency: string;

  payables: {
    current: {
      payrollPayable: number;
      withHoldingTaxPayableVendors: number;
      accountsPayable: number;
      totalCurrentPayables: number;
      vendorBills?: number; // (your API sends this)
    };
    longTerm: {
      sirAatifLoanToCompany: number;
      payrollWithHoldingTaxPayable: number;
      totalLongTermPayables: number;
    };
    totalPayables: number;
  };

  receivables: {
    loanAgainstSalary: number;
    taxWithheld: number;
    totalReceivables: number;
  };

  apAging: {
    totalAP: number;
    vendors: Array<{
      vendor: string;
      current: number;
      "1_30": number;
      "31_60": number;
      "61_90": number;
      "91_plus": number;
      total: number;
    }>;
    source: string;
  };

  error?: string;
};

/* ---------------------- helpers ---------------------- */

// Local YYYY-MM-DD (prevents UTC shifting)
function formatLocalYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Build last N month-end dates ending at selected (year, month)
function monthEndDatesFrom(endY: number, endM: number, months = 6) {
  const dates: string[] = [];
  for (let i = months - 1; i >= 0; i--) {
    // month-end of (endM - i)
    const d = new Date(endY, endM - i, 0);
    dates.push(formatLocalYMD(d));
  }
  return dates;
}

function formatMoneyByCurrency(currency: string, n: number) {
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);

  const symbols: Record<string, string> = {
    PKR: "Rs",
    USD: "$",
    EUR: "€",
    GBP: "£",
    AED: "AED",
    SAR: "SAR",
  };

  const sym = symbols[currency] ?? currency;
  const decimals = currency === "PKR" ? 0 : 2;

  return `${sign}${sym} ${new Intl.NumberFormat("en", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(abs)}`;
}

function formatPKRCompact(n: number) {
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  return `${sign}Rs ${new Intl.NumberFormat("en-PK", { maximumFractionDigits: 0 }).format(abs)}`;
}

function formatPct(n: number) {
  if (!Number.isFinite(n)) return "0%";
  return `${(n * 100).toFixed(1)}%`;
}

function ymOptions(lastYears = 6) {
  const now = new Date();
  const years: number[] = [];
  for (let i = 0; i < lastYears; i++) years.push(now.getFullYear() - i);
  return years;
}

const MONTHS = [
  { v: 1, label: "Jan" },
  { v: 2, label: "Feb" },
  { v: 3, label: "Mar" },
  { v: 4, label: "Apr" },
  { v: 5, label: "May" },
  { v: 6, label: "Jun" },
  { v: 7, label: "Jul" },
  { v: 8, label: "Aug" },
  { v: 9, label: "Sep" },
  { v: 10, label: "Oct" },
  { v: 11, label: "Nov" },
  { v: 12, label: "Dec" },
];

const DONUT_COLORS = [
  "#60a5fa",
  "#34d399",
  "#fbbf24",
  "#a78bfa",
  "#fb7185",
  "#22d3ee",
  "#f97316",
  "#94a3b8",
];

type TabKey = "pnl" | "cash" | "retained" | "forecast" | "revenue" | "arAp";

function displayTxnAmount(
  txn: AccountTxnsResp["transactions"][number],
  homeCurrency: string | null | undefined
) {
  if (txn.amountForeign != null && txn.foreignCurrency) {
    return {
      main: formatMoneyByCurrency(txn.foreignCurrency, txn.amountForeign),
      sub:
        txn.amountHome != null
          ? `${homeCurrency ?? "PKR"} eq. ${formatMoneyByCurrency(homeCurrency ?? "PKR", txn.amountHome)}`
          : null,
    };
  }

  const cur = homeCurrency ?? "PKR";
  return { main: formatMoneyByCurrency(cur, txn.amountHome ?? 0), sub: null };
}

/* ------------ chart axis/ticks: clearer visibility ------------ */

const AXIS_TICK = { fill: "#e2e8f0", fontSize: 12, fontWeight: 600 } as const;
const AXIS_LINE = { stroke: "rgba(226,232,240,0.55)" } as const;
const TICK_LINE = { stroke: "rgba(226,232,240,0.35)" } as const;
const GRID = { strokeDasharray: "3 3", opacity: 0.22 } as const;

function trendLabelFromMoM(mom: number): "Increasing" | "Decreasing" | "Stable" {
  if (!Number.isFinite(mom)) return "Stable";
  if (mom > 0.01) return "Increasing";
  if (mom < -0.01) return "Decreasing";
  return "Stable";
}

function fmtAxisPKR(v: any) {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n)) return "0";
  // compact ticks for readability
  if (Math.abs(n) >= 1_000_000_000) return `${Math.round(n / 1_000_000_000)}B`;
  if (Math.abs(n) >= 1_000_000) return `${Math.round(n / 1_000_000)}M`;
  if (Math.abs(n) >= 1_000) return `${Math.round(n / 1_000)}K`;
  return `${Math.round(n)}`;
}

export default function DashboardPage() {
  const years = useMemo(() => ymOptions(6), []);
  const now = new Date();

  const [tab, setTab] = useState<TabKey>("pnl");

  const [fromYear, setFromYear] = useState<number>(now.getFullYear());
  const [fromMonth, setFromMonth] = useState<number>(1);
  const [toYear, setToYear] = useState<number>(now.getFullYear());
  const [toMonth, setToMonth] = useState<number>(now.getMonth() + 1);
  const [method, setMethod] = useState<"Accrual" | "Cash">("Accrual");

  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<DashboardResp | null>(null);
  const [pnlBreakdown, setPnlBreakdown] = useState<{ name: string; value: number }[]>([]);
  const [cashBanks, setCashBanks] = useState<CashBanksResp | null>(null);

  const [selectedAccount, setSelectedAccount] = useState<CashBankAccount | null>(null);
  const [txnLoading, setTxnLoading] = useState(false);
  const [txns, setTxns] = useState<AccountTxnsResp | null>(null);

  const [retained, setRetained] = useState<RetainedResp | null>(null);
  const [retainedLoading, setRetainedLoading] = useState(false);

  // ✅ CFO Forecasting (Opex-only)
  const [forecastHorizon, setForecastHorizon] = useState<6 | 12>(6);
  const [forecastLoading, setForecastLoading] = useState(false);
  const [forecastData, setForecastData] = useState<ForecastApiResp | null>(null);

  // ✅ AI Insights
  const [aiLoading, setAiLoading] = useState(false);
  const [aiErr, setAiErr] = useState<string>("");
  const [ai, setAi] = useState<AiInsightsResp | null>(null);

  // ✅ AR/AP
  const [arApLoading, setArApLoading] = useState(false);
  const [arAp, setArAp] = useState<ArApResp | null>(null);
  const [monthlyArAp, setMonthlyArAp] = useState<Array<{ month: string; payables: number; receivables: number }>>([]);

  const [err, setErr] = useState<string>("");

  function buildStartEnd(fy: number, fm: number, ty: number, tm: number) {
    const start = `${fy}-${String(fm).padStart(2, "0")}-01`;
    const endDate = new Date(ty, tm, 0);
    const end = `${ty}-${String(tm).padStart(2, "0")}-${String(endDate.getDate()).padStart(2, "0")}`;
    return { start, end };
  }

  async function fetchForecast(series: DashboardResp["series"], horizon: 6 | 12) {
    setForecastLoading(true);
    try {
      const res = await fetch(`/api/forecast`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ series, horizon }),
      });
      const json: ForecastApiResp = await res.json();
      setForecastData(json?.ok ? json : null);
    } catch {
      setForecastData(null);
    } finally {
      setForecastLoading(false);
    }
  }

  async function fetchAiInsights(start: string, end: string, accounting_method: "Accrual" | "Cash") {
    setAiLoading(true);
    setAiErr("");

    try {
      const res = await fetch(
        `/api/ai/insights?start_date=${encodeURIComponent(start)}&end_date=${encodeURIComponent(
          end
        )}&accounting_method=${encodeURIComponent(accounting_method)}`,
        { cache: "no-store" }
      );

      const raw = await res.text();
      if (!raw || !raw.trim()) throw new Error(`AI insights returned empty response (status ${res.status}).`);

      let json: any;
      try {
        json = JSON.parse(raw);
      } catch {
        const preview = raw.slice(0, 200).replace(/\s+/g, " ");
        throw new Error(`AI insights returned non-JSON (status ${res.status}): ${preview}`);
      }

      if (!json?.ok) throw new Error(json?.error || "AI insights failed");
      setAi(json);
    } catch (e: any) {
      setAiErr(e?.message ?? "AI insights failed");
      setAi(null);
    } finally {
      setAiLoading(false);
    }
  }

  async function fetchArAp(asOfYmd: string) {
    const res = await fetch(`/api/qbo/ar-ap?asOf=${encodeURIComponent(asOfYmd)}`, { cache: "no-store" });
    const json: ArApResp = await res.json();
    if (!json.ok) throw new Error(json.error || "AR/AP API failed");
    return json;
  }

  async function loadArApAndMonthly(endYmd: string) {
    setArApLoading(true);
    try {
      const one = await fetchArAp(endYmd);
      setArAp(one);

      // IMPORTANT: build proper month-ends in local time (no UTC shift)
      const endDate = new Date(`${endYmd}T12:00:00`); // noon avoids DST/UTC edge
      const endY = endDate.getFullYear();
      const endM = endDate.getMonth() + 1;

      const dates = monthEndDatesFrom(endY, endM, 6);

      const rows: Array<{ month: string; payables: number; receivables: number }> = [];
      // sequential fetch (safe & predictable)
      for (const d of dates) {
        const j = await fetchArAp(d);
        rows.push({
          month: d.slice(0, 7),
          payables: j.payables.totalPayables,
          receivables: j.receivables.totalReceivables,
        });
      }

      setMonthlyArAp(rows);
    } catch {
      setArAp(null);
      setMonthlyArAp([]);
    } finally {
      setArApLoading(false);
    }
  }

  async function fetchAll() {
    setLoading(true);
    setErr("");

    try {
      // normalize range
      const fromKey = fromYear * 100 + fromMonth;
      const toKey = toYear * 100 + toMonth;

      const fy = fromKey <= toKey ? fromYear : toYear;
      const fm = fromKey <= toKey ? fromMonth : toMonth;
      const ty = fromKey <= toKey ? toYear : fromYear;
      const tm = fromKey <= toKey ? toMonth : fromMonth;

      const { start, end } = buildStartEnd(fy, fm, ty, tm);

      // ✅ AR/AP uses end date as "asOf"
      loadArApAndMonthly(end).catch(() => {});

      const dashUrl =
        `/api/dashboard?start_date=${encodeURIComponent(start)}` +
        `&end_date=${encodeURIComponent(end)}` +
        `&accounting_method=${encodeURIComponent(method)}`;

      const dashRes = await fetch(dashUrl, { cache: "no-store" });
      const dashJson: DashboardResp = await dashRes.json();
      if (!dashJson.ok) throw new Error(dashJson.error || "Dashboard API failed");
      setData(dashJson);

      fetchAiInsights(start, end, method).catch(() => {});

      if (dashJson?.series?.length) {
        await fetchForecast(dashJson.series, forecastHorizon);
      } else {
        setForecastData(null);
      }

      const pnlUrl =
        `/api/qbo/pnl-table?start_date=${encodeURIComponent(start)}` +
        `&end_date=${encodeURIComponent(end)}` +
        `&accounting_method=${encodeURIComponent(method)}`;

      const pnlRes = await fetch(pnlUrl, { cache: "no-store" });
      const pnlJson: PnlTableResp = await pnlRes.json();
      if (!pnlJson.ok) throw new Error(pnlJson.error || "P&L table API failed");

      const expenseRows = pnlJson.rows.filter((r) => {
        if (r.rowType !== "Data") return false;
        const p = r.path || "";
        return p.startsWith("P&L > Expenses") || p.startsWith("P&L > Other Expenses");
      });

      const map = new Map<string, number>();
      for (const r of expenseRows) map.set(r.label, (map.get(r.label) ?? 0) + (r.amount ?? 0));

      const sorted = Array.from(map.entries())
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value);

      const top = sorted.slice(0, 8);
      const rest = sorted.slice(8);
      const restSum = rest.reduce((s, x) => s + x.value, 0);
      setPnlBreakdown(restSum > 0 ? [...top, { name: "Other", value: restSum }] : top);

      const cbRes = await fetch(`/api/qbo/cash-banks?includeZero=true`, { cache: "no-store" });
      const cbJson: CashBanksResp = await cbRes.json();
      if (!cbJson.ok) throw new Error(cbJson.error || "Cash-banks API failed");
      setCashBanks(cbJson);

      setRetainedLoading(true);
      try {
        const reRes = await fetch(
          `/api/qbo/retained-earning?start_date=${encodeURIComponent(start)}&end_date=${encodeURIComponent(
            end
          )}&accounting_method=${encodeURIComponent(method)}`,
          { cache: "no-store" }
        );
        const reJson: RetainedResp = await reRes.json();
        setRetained(reJson?.ok ? reJson : null);
      } finally {
        setRetainedLoading(false);
      }

      if (selectedAccount) await fetchTransactions(selectedAccount.id);
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  async function fetchTransactions(accountId: string) {
    setTxnLoading(true);
    try {
      const res = await fetch(
        `/api/qbo/account-transactions?accountId=${encodeURIComponent(accountId)}&limit=5`,
        { cache: "no-store" }
      );
      const json: AccountTxnsResp = await res.json();
      setTxns(json.ok ? json : null);
    } finally {
      setTxnLoading(false);
    }
  }

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const series = data?.series ?? [];
  const kpi = data?.kpis?.ytd ?? { revenue: 0, expenses: 0, profit: 0 };

  const margin = useMemo(() => (kpi.revenue ? kpi.profit / kpi.revenue : 0), [kpi.profit, kpi.revenue]);

  const headerAsOf = useMemo(() => {
    if (!data?.asOf) return "";
    return new Date(data.asOf).toLocaleString();
  }, [data?.asOf]);

  const currencyTotals = useMemo(() => {
    const t = cashBanks?.totalsByCurrency ?? {};
    return Object.keys(t)
      .sort((a, b) => a.localeCompare(b))
      .map((k) => ({ currency: k, total: t[k] }));
  }, [cashBanks?.totalsByCurrency]);

  const accounts = (cashBanks?.accounts ?? []).filter((a) => Math.abs(a.currentBalance ?? 0) > 0);

  /* ---------------- retained normalized values ---------------- */

  const reOk = !!retained?.ok;
  const reProfit = (retained?.netProfit ?? retained?.profit ?? 0) || 0;
  const reLongTermAssets = (retained?.longTermAssetsMovement ?? retained?.longTermAssetsAdditions ?? 0) || 0;
  const reInvestments = retained?.investments ?? null;
  const reTotalInvestments = (reInvestments?.totalInvestments ?? retained?.totalInvestments ?? 0) || 0;
  const reContribution = (reInvestments?.contribution ?? retained?.contributionReceived ?? 0) || 0;
  const reNetInvestments = (reInvestments?.netInvestments ?? retained?.netInvestments ?? 0) || 0;
  const reRetained = (retained?.retainedEarning ?? 0) || 0;

  const retainedBreakdown = useMemo(() => {
    if (!reOk) return [];
    const parts = [
      { name: "Long-term Assets", value: Math.max(0, reLongTermAssets) },
      { name: "Net Investments", value: Math.max(0, reNetInvestments) },
    ];
    return parts.filter((x) => x.value > 0);
  }, [reOk, reLongTermAssets, reNetInvestments]);

  const investmentBarData = useMemo(() => {
    if (!reOk) return [];
    if (retained?.charts?.investmentBars?.length) return retained.charts.investmentBars;
    return [
      { name: "Investments", value: reTotalInvestments },
      { name: "Contribution Received", value: reContribution },
    ];
  }, [reOk, retained?.charts?.investmentBars, reTotalInvestments, reContribution]);

  const donutData = useMemo(() => {
    if (!reOk) return [];
    if (retained?.charts?.retainedDonut?.length) return retained.charts.retainedDonut;

    const parts = [
      { name: "Long-term Assets", value: Math.max(0, reLongTermAssets) },
      { name: "Net Investments", value: Math.max(0, reNetInvestments) },
      { name: "Retained Earning", value: Math.max(0, reRetained) },
    ].filter((x) => x.value > 0);

    return parts;
  }, [reOk, retained?.charts?.retainedDonut, reLongTermAssets, reNetInvestments, reRetained]);

  const ltDetail = useMemo(() => {
    if (retained?.longTermAssets?.detail?.length) return retained.longTermAssets.detail;

    if (retained?.fixedAssetAdditions?.length) {
      return retained.fixedAssetAdditions.map((x) => ({
        label: x.label,
        end: x.amount,
        prior: 0,
        movement: x.amount,
      }));
    }
    return [];
  }, [retained]);

  const invDetail = useMemo(() => {
    if (reInvestments) {
      return [
        { label: "Buraq AI Investment", amount: reInvestments.buraq ?? 0 },
        { label: "Convoi AI Investment", amount: reInvestments.convoi ?? 0 },
        { label: "Stratger AI Investment", amount: reInvestments.stratger ?? 0 },
        { label: "Strategr AI Contribution Received", amount: reInvestments.contribution ?? 0 },
      ];
    }

    if (retained?.investmentsByEntity?.length) return retained.investmentsByEntity;
    return [];
  }, [reInvestments, retained?.investmentsByEntity]);

  /* ---------------- forecast derived values (UI-safe) ---------------- */

  const fcOk = !!forecastData?.ok;
  const fcMonthsUsed = forecastData?.meta?.monthsUsed ?? (data?.series?.length ?? 0);

  const fcAvgRevenue = forecastData?.averages?.avgMonthlyRevenue ?? 0;
  const fcAvgOpex = forecastData?.averages?.avgMonthlyOpex ?? 0;
  const fcAvgProfit = forecastData?.averages?.avgMonthlyProfit ?? (fcAvgRevenue - fcAvgOpex);

  const fcRevMoM = forecastData?.trends?.revenueMoM ?? 0;
  const fcExpMoM = forecastData?.trends?.expensesMoM ?? 0;

  const fcRevLabel = forecastData?.trends?.revenueTrendLabel ?? trendLabelFromMoM(fcRevMoM);
  const fcExpLabel = forecastData?.trends?.expenseTrendLabel ?? trendLabelFromMoM(fcExpMoM);

  const fcBreakeven = forecastData?.benchmarks?.breakevenRevenue ?? fcAvgOpex;
  const fcGap = fcAvgRevenue - fcBreakeven;
  const fcMeetsBE = fcAvgRevenue >= fcBreakeven;

  const benchmarkBars = useMemo(() => {
    if (!fcOk) return [];
    return [
      { name: "Avg Revenue", value: fcAvgRevenue },
      { name: "Break-even", value: fcBreakeven },
      { name: "10% Margin", value: forecastData?.benchmarks?.margin10 ?? 0 },
      { name: "20% Margin", value: forecastData?.benchmarks?.margin20 ?? 0 },
      { name: "30% Margin", value: forecastData?.benchmarks?.margin30 ?? 0 },
    ];
  }, [fcOk, fcAvgRevenue, fcBreakeven, forecastData?.benchmarks?.margin10, forecastData?.benchmarks?.margin20, forecastData?.benchmarks?.margin30]);

  const forecastRows = forecastData?.forecast ?? [];

  return (
    <div className="min-h-screen bg-[radial-gradient(1200px_900px_at_15%_10%,rgba(16,185,129,0.12),transparent_55%),radial-gradient(1200px_900px_at_85%_20%,rgba(34,211,238,0.10),transparent_55%),radial-gradient(1000px_700px_at_55%_95%,rgba(99,102,241,0.10),transparent_55%),linear-gradient(180deg,#050814_0%,#070b1a_45%,#050814_100%)] text-slate-100">
      <div className="mx-auto max-w-7xl px-5 py-8">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div className="flex items-center gap-4">
            <div className="relative h-12 w-12 shrink-0">
              <Image src="/logo.png" alt="RTC League Logo" fill className="object-contain" priority />
            </div>

            <div>
              <h1 className="text-3xl font-semibold tracking-tight">Finance Dashboard</h1>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-300">
              <div className="font-medium text-slate-200">
                Company: {data?.companyName ?? "—"} ({data?.currency ?? "PKR"})
              </div>
              <div className="opacity-80">As of: {headerAsOf || "—"}</div>
            </div>

            <button
              onClick={fetchAll}
              className="rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-sm font-medium hover:bg-white/15 active:scale-[0.99]"
              disabled={loading}
            >
              {loading ? "Refreshing..." : "Refresh"}
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="mt-6 flex gap-2 flex-wrap">
          <TabButton active={tab === "pnl"} onClick={() => setTab("pnl")}>
            Profit & Loss
          </TabButton>
          <TabButton active={tab === "cash"} onClick={() => setTab("cash")}>
            Bank & Cash Balances
          </TabButton>
          <TabButton active={tab === "arAp"} onClick={() => setTab("arAp")}>
            AR/AP
          </TabButton>
          <TabButton active={tab === "retained"} onClick={() => setTab("retained")}>
            Retained Earning
          </TabButton>
          <TabButton active={tab === "forecast"} onClick={() => setTab("forecast")}>
            CFO Forecast
          </TabButton>

          <TabLinkButton active={tab === "revenue"} href="/dashboard/revenue-analytics" onActivate={() => setTab("revenue")}>
            Revenue Analytics
          </TabLinkButton>
        </div>

        {/* Filters */}
        <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              <div>
                <label className="text-xs text-slate-300">From Year</label>
                <select
                  value={fromYear}
                  onChange={(e) => setFromYear(Number(e.target.value))}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none"
                >
                  {years.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-slate-300">From Month</label>
                <select
                  value={fromMonth}
                  onChange={(e) => setFromMonth(Number(e.target.value))}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none"
                >
                  {MONTHS.map((m) => (
                    <option key={m.v} value={m.v}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-slate-300">To Year</label>
                <select
                  value={toYear}
                  onChange={(e) => setToYear(Number(e.target.value))}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none"
                >
                  {years.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-slate-300">To Month</label>
                <select
                  value={toMonth}
                  onChange={(e) => setToMonth(Number(e.target.value))}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none"
                >
                  {MONTHS.map((m) => (
                    <option key={m.v} value={m.v}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-slate-300">Accounting Method</label>
                <select
                  value={method}
                  onChange={(e) => setMethod(e.target.value as any)}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none"
                >
                  <option value="Accrual">Accrual</option>
                  <option value="Cash">Cash</option>
                </select>
              </div>
            </div>

            <button
              onClick={fetchAll}
              className="rounded-xl border border-white/10 bg-emerald-500/15 px-4 py-2 text-sm font-semibold hover:bg-emerald-500/20 active:scale-[0.99]"
              disabled={loading}
            >
              Apply
            </button>
          </div>

          {err ? (
            <div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{err}</div>
          ) : null}
        </div>

        {/* Revenue route helper */}
        {tab === "revenue" ? (
          <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-5">
            <div className="text-sm font-semibold">Revenue Analytics</div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                href="/dashboard/revenue-analytics"
                className="rounded-xl border border-white/10 bg-emerald-500/15 px-4 py-2 text-sm font-semibold hover:bg-emerald-500/20"
              >
                Open Revenue Analytics
              </Link>

              <button
                onClick={() => setTab("pnl")}
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold hover:bg-white/10"
              >
                Back
              </button>
            </div>
          </div>
        ) : null}

        {/* AR/AP TAB */}
        {tab === "arAp" ? (
          <div className="mt-6">
            <Panel title="AR/AP Overview">
              {arApLoading ? (
                <div className="py-3 text-slate-300">Loading…</div>
              ) : !arAp?.ok ? (
                <div className="py-3 text-slate-300">No AR/AP data.</div>
              ) : (
                <>
                  {/* ✅ KPIs: remove Current/Long-term. Show just Total Payables */}
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                    <KpiCard title="Total Payables" value={formatPKRCompact(arAp.payables.totalPayables)} highlight="bad" />
                    <KpiCard title="Total Receivables" value={formatPKRCompact(arAp.receivables.totalReceivables)} highlight="good" />
                    <KpiCard
                      title="Net (Receivables - Payables)"
                      value={formatPKRCompact(arAp.receivables.totalReceivables - arAp.payables.totalPayables)}
                      highlight={arAp.receivables.totalReceivables - arAp.payables.totalPayables >= 0 ? "good" : "bad"}
                    />
                    <KpiCard
                      title="AR/AP Gap"
                      value={formatPKRCompact(Math.abs(arAp.payables.totalPayables - arAp.receivables.totalReceivables))}
                    />
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
                    <Panel title={`Payables vs Receivables (As of ${arAp.asOf})`}>
                      <div className="h-[320px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Tooltip content={<MoneyTooltip pie />} />
                            <Legend />
                            <Pie
                              data={[
                                { name: "Payables", value: arAp.payables.totalPayables },
                                { name: "Receivables", value: arAp.receivables.totalReceivables },
                              ]}
                              dataKey="value"
                              nameKey="name"
                              innerRadius={75}
                              outerRadius={115}
                              paddingAngle={2}
                            >
                              <Cell fill="#ef4444" />
                              <Cell fill="#22c55e" />
                            </Pie>
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    </Panel>

                    <Panel title="Monthly Payables & Receivables Growth (Month-end)">
                      <div className="h-[320px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={monthlyArAp} margin={{ top: 10, right: 12, left: 6, bottom: 6 }}>
                            <CartesianGrid {...GRID} />
                            <XAxis dataKey="month" tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={TICK_LINE} />
                            <YAxis
                              tick={AXIS_TICK}
                              axisLine={AXIS_LINE}
                              tickLine={TICK_LINE}
                              tickFormatter={fmtAxisPKR}
                            />
                            <Tooltip content={<MoneyTooltip />} />
                            <Legend />
                            <Line type="monotone" dataKey="payables" name="Total Payables" stroke="#ef4444" strokeWidth={3} dot={false} />
                            <Line type="monotone" dataKey="receivables" name="Total Receivables" stroke="#22c55e" strokeWidth={3} dot={false} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </Panel>
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
                    {/* ✅ Payables Detail without Current/Long-term sections */}
                    <Panel title="Payables Detail">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="text-left text-xs text-slate-300">
                            <tr>
                              <th className="py-2 pr-3">Category</th>
                              <th className="py-2 text-right">Amount</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr className="border-t border-white/10">
                              <td className="py-2 pr-3 text-slate-200 font-medium">Payroll Payable</td>
                              <td className="py-2 text-right font-semibold">{formatPKRCompact(arAp.payables.current.payrollPayable)}</td>
                            </tr>

                            <tr className="border-t border-white/10">
                              <td className="py-2 pr-3 text-slate-200 font-medium">With Holding Tax Payable Vendors</td>
                              <td className="py-2 text-right font-semibold">{formatPKRCompact(arAp.payables.current.withHoldingTaxPayableVendors)}</td>
                            </tr>

                            <tr className="border-t border-white/10">
                              <td className="py-2 pr-3 text-slate-200 font-medium">Vendor Bills</td>
                              <td className="py-2 text-right font-semibold">
                                {formatPKRCompact(
                                  Number(
                                    (arAp.payables.current as any).vendorBills ??
                                      arAp.payables.current.accountsPayable ??
                                      0
                                  )
                                )}
                              </td>
                            </tr>

                            <tr className="border-t border-white/10">
                              <td className="py-2 pr-3 text-slate-200 font-medium">Sir Aatif Loan to Company</td>
                              <td className="py-2 text-right font-semibold">{formatPKRCompact(arAp.payables.longTerm.sirAatifLoanToCompany)}</td>
                            </tr>

                            <tr className="border-t border-white/10">
                              <td className="py-2 pr-3 text-slate-200 font-medium">Payroll With Holding Tax Payable</td>
                              <td className="py-2 text-right font-semibold">{formatPKRCompact(arAp.payables.longTerm.payrollWithHoldingTaxPayable)}</td>
                            </tr>

                            <tr className="border-t-2 border-white/15 bg-rose-500/10">
                              <td className="py-2 pr-3 font-semibold text-slate-100">Total Payables</td>
                              <td className="py-2 text-right font-semibold text-slate-100">{formatPKRCompact(arAp.payables.totalPayables)}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </Panel>

                    <Panel title="Receivables Detail">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="text-left text-xs text-slate-300">
                            <tr>
                              <th className="py-2 pr-3">Category</th>
                              <th className="py-2 text-right">Amount</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr className="border-t border-white/10">
                              <td className="py-2 pr-3 text-slate-200 font-medium">Loan Against Salary</td>
                              <td className="py-2 text-right font-semibold">{formatPKRCompact(arAp.receivables.loanAgainstSalary)}</td>
                            </tr>

                            <tr className="border-t border-white/10">
                              <td className="py-2 pr-3 text-slate-200 font-medium">Tax Withheld</td>
                              <td className="py-2 text-right font-semibold">{formatPKRCompact(arAp.receivables.taxWithheld)}</td>
                            </tr>

                            <tr className="border-t-2 border-white/15 bg-emerald-500/10">
                              <td className="py-2 pr-3 font-semibold text-slate-100">Total Receivables</td>
                              <td className="py-2 text-right font-semibold text-slate-100">{formatPKRCompact(arAp.receivables.totalReceivables)}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </Panel>
                  </div>

                  <div className="mt-4">
                    {/* ✅ Rename title exactly as requested */}
                    <Panel title="Vendor Payables Breakdown">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="text-left text-xs text-slate-300">
                            <tr>
                              <th className="py-2 pr-3">Vendor</th>
                              <th className="py-2 text-right">Current</th>
                              <th className="py-2 text-right">1–30</th>
                              <th className="py-2 text-right">31–60</th>
                              <th className="py-2 text-right">61–90</th>
                              <th className="py-2 text-right">91+</th>
                              <th className="py-2 text-right">Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            {arAp.apAging.vendors?.length ? (
                              <>
                                {arAp.apAging.vendors.map((v, i) => (
                                  <tr key={i} className="border-t border-white/10">
                                    <td className="py-2 pr-3 font-medium text-slate-200">{v.vendor}</td>
                                    <td className="py-2 text-right font-semibold">{formatPKRCompact(v.current)}</td>
                                    <td className="py-2 text-right font-semibold">{formatPKRCompact(v["1_30"])}</td>
                                    <td className="py-2 text-right font-semibold">{formatPKRCompact(v["31_60"])}</td>
                                    <td className="py-2 text-right font-semibold">{formatPKRCompact(v["61_90"])}</td>
                                    <td className="py-2 text-right font-semibold">{formatPKRCompact(v["91_plus"])}</td>
                                    <td className="py-2 text-right font-semibold">{formatPKRCompact(v.total)}</td>
                                  </tr>
                                ))}
                                <tr className="border-t-2 border-white/15 bg-white/5">
                                  <td className="py-2 pr-3 font-semibold text-slate-100">Total AP</td>
                                  <td colSpan={5}></td>
                                  <td className="py-2 text-right font-semibold text-slate-100">{formatPKRCompact(arAp.apAging.totalAP)}</td>
                                </tr>
                              </>
                            ) : (
                              <tr className="border-t border-white/10">
                                <td colSpan={7} className="py-3 text-slate-300">
                                  No vendor aging data found.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </Panel>
                  </div>
                </>
              )}
            </Panel>
          </div>
        ) : null}

        {/* PNL TAB */}
        {tab === "pnl" ? (
          <>
            <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-4">
              <KpiCard title="Total Income" value={formatPKRCompact(kpi.revenue)} />
              <KpiCard title="Total Expenses" value={formatPKRCompact(kpi.expenses)} />
              <KpiCard
                title="Net Profit (Loss)"
                value={formatPKRCompact(kpi.profit)}
                highlight={kpi.profit < 0 ? "bad" : "good"}
              />
              <KpiCard title="Months" value={`${series.length}`} />
            </div>

            <div className="mt-4">
              <Panel title="AI Insights">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="text-sm text-slate-200">
                    {aiLoading ? (
                      <div className="text-slate-300">Generating…</div>
                    ) : ai && (ai as any).ok === true ? (
                      <div className="space-y-3">
                        <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                          <div className="font-medium">{(ai as any).summary || "—"}</div>
                        </div>

                        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
                          <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                            {(ai as any).highlights?.length ? (
                              <ul className="list-disc pl-5 space-y-1 text-slate-200">
                                {(ai as any).highlights.slice(0, 6).map((x: string, i: number) => (
                                  <li key={i}>{x}</li>
                                ))}
                              </ul>
                            ) : (
                              <div className="text-slate-400">—</div>
                            )}
                          </div>

                          <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                            {(ai as any).risks?.length ? (
                              <ul className="list-disc pl-5 space-y-1 text-slate-200">
                                {(ai as any).risks.slice(0, 6).map((x: string, i: number) => (
                                  <li key={i}>{x}</li>
                                ))}
                              </ul>
                            ) : (
                              <div className="text-slate-400">—</div>
                            )}
                          </div>

                          <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                            {(ai as any).actions?.length ? (
                              <ul className="list-disc pl-5 space-y-1 text-slate-200">
                                {(ai as any).actions.slice(0, 6).map((x: string, i: number) => (
                                  <li key={i}>{x}</li>
                                ))}
                              </ul>
                            ) : (
                              <div className="text-slate-400">—</div>
                            )}
                          </div>
                        </div>
                      </div>
                    ) : aiErr ? (
                      <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{aiErr}</div>
                    ) : (
                      <div className="text-slate-400">—</div>
                    )}
                  </div>

                  <div className="shrink-0">
                    <button
                      onClick={() => {
                        const fromKey = fromYear * 100 + fromMonth;
                        const toKey = toYear * 100 + toMonth;
                        const fy = fromKey <= toKey ? fromYear : toYear;
                        const fm = fromKey <= toKey ? fromMonth : toMonth;
                        const ty = fromKey <= toKey ? toYear : fromYear;
                        const tm = fromKey <= toKey ? toMonth : fromMonth;

                        const start = `${fy}-${String(fm).padStart(2, "0")}-01`;
                        const endDate = new Date(ty, tm, 0);
                        const end = `${ty}-${String(tm).padStart(2, "0")}-${String(endDate.getDate()).padStart(2, "0")}`;
                        fetchAiInsights(start, end, method);
                      }}
                      className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs hover:bg-white/10 disabled:opacity-60"
                      disabled={aiLoading}
                    >
                      {aiLoading ? "Generating…" : "Refresh"}
                    </button>
                  </div>
                </div>
              </Panel>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Panel title="Income vs Expenses">
                <div className="h-[320px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={series} margin={{ top: 10, right: 12, left: 6, bottom: 6 }}>
                      <CartesianGrid {...GRID} />
                      <XAxis dataKey="month" tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={TICK_LINE} />
                      <YAxis tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={TICK_LINE} tickFormatter={fmtAxisPKR} />
                      <Tooltip content={<MoneyTooltip />} />
                      <Legend />
                      <Bar dataKey="revenue" name="Income" fill="#22c55e" radius={[8, 8, 0, 0]} />
                      <Bar dataKey="expenses" name="Expenses" fill="#ef4444" radius={[8, 8, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Panel>

              <Panel title="Net Profit (Loss)">
                <div className="h-[320px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={series} margin={{ top: 10, right: 12, left: 6, bottom: 6 }}>
                      <CartesianGrid {...GRID} />
                      <XAxis dataKey="month" tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={TICK_LINE} />
                      <YAxis tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={TICK_LINE} tickFormatter={fmtAxisPKR} />
                      <Tooltip content={<MoneyTooltip />} />
                      <Legend />
                      <Line type="monotone" dataKey="profit" name="Net Profit" stroke="#34d399" strokeWidth={3} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </Panel>
            </div>

            <div className="mt-4">
              <Panel title="Expense Composition">
                <div className="h-[320px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Tooltip content={<MoneyTooltip pie />} />
                      <Legend />
                      <Pie data={pnlBreakdown} dataKey="value" nameKey="name" innerRadius={65} outerRadius={105} paddingAngle={2}>
                        {pnlBreakdown.map((_, i) => (
                          <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </Panel>
            </div>
          </>
        ) : null}

        {/* CASH TAB */}
        {tab === "cash" ? (
          <>
            <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
              {currencyTotals.map((x) => (
                <div key={x.currency} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="text-xs text-slate-300">{x.currency} Total</div>
                  <div className="mt-2 text-xl font-semibold">{formatMoneyByCurrency(x.currency, x.total)}</div>
                </div>
              ))}
            </div>

            <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="mb-3">
                <div className="text-sm font-semibold">Accounts</div>
              </div>

              <div className="flex gap-3 overflow-x-auto pb-2">
                {accounts.map((a) => {
                  const active = selectedAccount?.id === a.id;
                  return (
                    <button
                      key={a.id}
                      onClick={async () => {
                        setSelectedAccount(a);
                        setTxns(null);
                        await fetchTransactions(a.id);
                      }}
                      className={[
                        "min-w-[260px] rounded-2xl border p-4 text-left transition",
                        active ? "border-emerald-400/30 bg-emerald-500/10" : "border-white/10 bg-black/20 hover:bg-white/10",
                      ].join(" ")}
                    >
                      <div className="text-sm font-semibold">{a.name}</div>
                      <div className="mt-1 text-xs text-slate-300">
                        {a.accountSubType ?? a.accountType} • {a.currency}
                      </div>
                      <div className="mt-3 text-2xl font-semibold">{formatMoneyByCurrency(a.currency, a.currentBalance)}</div>
                    </button>
                  );
                })}
              </div>

              {selectedAccount ? (
                <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                    <div className="text-sm font-semibold">Latest 5 transactions — {selectedAccount.name}</div>

                    <button
                      onClick={() => {
                        setSelectedAccount(null);
                        setTxns(null);
                      }}
                      className="mt-3 md:mt-0 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs hover:bg-white/10"
                    >
                      Close
                    </button>
                  </div>

                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="text-left text-xs text-slate-300">
                        <tr>
                          <th className="py-2 pr-3">Date</th>
                          <th className="py-2 pr-3">Type</th>
                          <th className="py-2 pr-3">Memo</th>
                          <th className="py-2 text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {txnLoading ? (
                          <tr>
                            <td colSpan={4} className="py-3 text-slate-300">
                              Loading…
                            </td>
                          </tr>
                        ) : txns?.transactions?.length ? (
                          txns.transactions.map((t, i) => {
                            const amt = displayTxnAmount(t, txns?.homeCurrency);
                            return (
                              <tr key={i} className="border-t border-white/10">
                                <td className="py-2 pr-3">{t.date || "—"}</td>
                                <td className="py-2 pr-3">{t.txnType || "—"}</td>
                                <td className="py-2 pr-3 text-slate-300">{t.memo || "—"}</td>
                                <td className="py-2 text-right font-semibold">
                                  <div>{amt.main}</div>
                                  {amt.sub ? <div className="text-xs font-normal text-slate-400">{amt.sub}</div> : null}
                                </td>
                              </tr>
                            );
                          })
                        ) : (
                          <tr>
                            <td colSpan={4} className="py-3 text-slate-300">
                              No recent transactions found.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}
            </div>
          </>
        ) : null}

        {/* RETAINED TAB */}
        {tab === "retained" ? (
          <>
            <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-4">
              <KpiCard title="Net Profit" value={formatPKRCompact(reProfit)} />
              <KpiCard title="Long-term Assets" value={formatPKRCompact(reLongTermAssets)} />
              <KpiCard title="Net Investments" value={formatPKRCompact(reNetInvestments)} />
              <KpiCard title="Retained Earning" value={formatPKRCompact(reRetained)} highlight={reRetained < 0 ? "bad" : "good"} />
            </div>

            <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Panel title="Investment Summary">
                <div className="h-[320px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={investmentBarData} margin={{ top: 10, right: 12, left: 6, bottom: 6 }}>
                      <CartesianGrid {...GRID} />
                      <XAxis dataKey="name" tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={TICK_LINE} />
                      <YAxis tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={TICK_LINE} tickFormatter={fmtAxisPKR} />
                      <Tooltip content={<MoneyTooltip single />} />
                      <Bar dataKey="value" radius={[10, 10, 0, 0]}>
                        {investmentBarData.map((entry, i) => (
                          <Cell key={`cell-${i}`} fill={entry.name === "Investments" ? "#ef4444" : "#22c55e"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Panel>

              <Panel title="Retained Earning Breakdown">
                <div className="h-[320px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Tooltip content={<MoneyTooltip pie />} />
                      <Legend />
                      <Pie
                        data={donutData.length ? donutData : retainedBreakdown}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={70}
                        outerRadius={110}
                        paddingAngle={2}
                      >
                        {(donutData.length ? donutData : retainedBreakdown).map((_, i) => (
                          <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </Panel>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4">
              <Panel title="Net Investments Detail">
                {retainedLoading ? (
                  <div className="py-3 text-slate-300">Loading…</div>
                ) : invDetail.length ? (
                  <div className="mt-2 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="text-left text-xs text-slate-300">
                        <tr>
                          <th className="py-2 pr-3">Account</th>
                          <th className="py-2 text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {invDetail.map((x, i) => (
                          <tr key={i} className="border-t border-white/10">
                            <td className="py-2 pr-3">{x.label}</td>
                            <td className="py-2 text-right font-semibold">{formatPKRCompact(Number(x.amount ?? 0))}</td>
                          </tr>
                        ))}
                        <tr className="border-t-2 border-white/15 bg-white/5">
                          <td className="py-2 pr-3 font-semibold">Net Investments</td>
                          <td className="py-2 text-right font-semibold">{formatPKRCompact(reNetInvestments)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="py-3 text-slate-300">No investment movements found.</div>
                )}
              </Panel>
            </div>

            <div className="mt-4">
              <Panel title="Long-term Assets Detail">
                {retainedLoading ? (
                  <div className="py-3 text-slate-300">Loading…</div>
                ) : ltDetail.length ? (
                  <div className="mt-2 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="text-left text-xs text-slate-300">
                        <tr>
                          <th className="py-2 pr-3">Account</th>
                          <th className="py-2 text-right">Prior</th>
                          <th className="py-2 text-right">End</th>
                          <th className="py-2 text-right">Movement</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ltDetail.map((x, i) => (
                          <tr key={i} className="border-t border-white/10">
                            <td className="py-2 pr-3">{x.label}</td>
                            <td className="py-2 text-right text-slate-200">{formatPKRCompact(Number(x.prior ?? 0))}</td>
                            <td className="py-2 text-right text-slate-200">{formatPKRCompact(Number(x.end ?? 0))}</td>
                            <td className="py-2 text-right font-semibold">{formatPKRCompact(Number(x.movement ?? 0))}</td>
                          </tr>
                        ))}
                        <tr className="border-t-2 border-white/15 bg-white/5">
                          <td className="py-2 pr-3 font-semibold">Total Movement</td>
                          <td className="py-2 text-right"></td>
                          <td className="py-2 text-right"></td>
                          <td className="py-2 text-right font-semibold">{formatPKRCompact(reLongTermAssets)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="py-3 text-slate-300">No fixed asset movement found.</div>
                )}
              </Panel>
            </div>
          </>
        ) : null}

        {/* CFO FORECAST TAB (OPEX ONLY) */}
        {tab === "forecast" ? (
          <>
            <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="text-sm font-semibold">Operating Forecast</div>

                <div className="flex items-center gap-2">
                  <label className="text-xs text-slate-300">Horizon</label>
                  <select
                    value={forecastHorizon}
                    onChange={async (e) => {
                      const h = Number(e.target.value) as 6 | 12;
                      setForecastHorizon(h);
                      if (data?.series?.length) await fetchForecast(data.series, h);
                    }}
                    className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none"
                  >
                    <option value={6}>Next 6 months</option>
                    <option value={12}>Next 12 months</option>
                  </select>
                </div>
              </div>
            </div>

            {forecastLoading ? (
              <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4 text-slate-300">Loading…</div>
            ) : fcOk ? (
              <>
                <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-4">
                  <KpiCard title="Revenue Trend (Avg MoM)" value={formatPct(fcRevMoM)} highlight={fcRevMoM < 0 ? "bad" : "good"} />
                  <KpiCard title="Opex Trend (Avg MoM)" value={formatPct(fcExpMoM)} highlight={fcExpMoM > 0 ? "bad" : "good"} />
                  <KpiCard title="Avg Monthly Opex" value={formatPKRCompact(fcAvgOpex)} />
                  <KpiCard title="Break-even Revenue" value={formatPKRCompact(fcBreakeven)} highlight={fcMeetsBE ? "good" : "bad"} />
                </div>

                <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <Panel title="Benchmark Visual">
                    <div className="h-[320px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={benchmarkBars} margin={{ top: 10, right: 12, left: 6, bottom: 6 }}>
                          <CartesianGrid {...GRID} />
                          <XAxis dataKey="name" tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={TICK_LINE} />
                          <YAxis tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={TICK_LINE} tickFormatter={fmtAxisPKR} />
                          <Tooltip content={<MoneyTooltip single />} />
                          <Bar dataKey="value" radius={[10, 10, 0, 0]} fill="#60a5fa" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </Panel>

                  <Panel title="Forecast: Revenue vs Opex">
                    <div className="h-[320px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={forecastRows} margin={{ top: 10, right: 12, left: 6, bottom: 6 }}>
                          <CartesianGrid {...GRID} />
                          <XAxis dataKey="month" tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={TICK_LINE} />
                          <YAxis tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={TICK_LINE} tickFormatter={fmtAxisPKR} />
                          <Tooltip content={<MoneyTooltip />} />
                          <Legend />
                          <Line type="monotone" dataKey="revenue" name="Revenue" stroke="#22c55e" strokeWidth={3} dot={false} />
                          <Line type="monotone" dataKey="opex" name="Opex" stroke="#ef4444" strokeWidth={3} dot={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </Panel>
                </div>
              </>
            ) : (
              <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4 text-slate-300">
                No data available for the selected range.
              </div>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={[
        "rounded-xl border px-4 py-2 text-sm font-semibold transition",
        active ? "border-emerald-400/30 bg-emerald-500/10" : "border-white/10 bg-white/5 hover:bg-white/10",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function TabLinkButton({
  active,
  href,
  onActivate,
  children,
}: {
  active: boolean;
  href: string;
  onActivate?: () => void;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      onClick={() => onActivate?.()}
      className={[
        "rounded-xl border px-4 py-2 text-sm font-semibold transition inline-flex items-center",
        active ? "border-emerald-400/30 bg-emerald-500/10" : "border-white/10 bg-white/5 hover:bg-white/10",
      ].join(" ")}
    >
      {children}
    </Link>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-[0_20px_80px_rgba(0,0,0,0.35)]">
      <div className="mb-3">
        <div className="text-sm font-semibold">{title}</div>
      </div>
      {children}
    </div>
  );
}

function KpiCard({
  title,
  value,
  highlight,
}: {
  title: string;
  value: string;
  highlight?: "good" | "bad";
}) {
  const ring =
    highlight === "good"
      ? "border-emerald-400/20"
      : highlight === "bad"
      ? "border-rose-400/20"
      : "border-white/10";

  return (
    <div className={`rounded-2xl border ${ring} bg-white/5 p-4 shadow-[0_20px_80px_rgba(0,0,0,0.35)]`}>
      <div className="text-xs text-slate-300">{title}</div>
      <div className="mt-2 text-2xl font-semibold tracking-tight">{value}</div>
    </div>
  );
}

function MoneyTooltip({ active, payload, label, pie, single }: any) {
  if (!active || !payload || payload.length === 0) return null;

  if (pie) {
    const p = payload[0];
    return (
      <div className="rounded-xl border border-white/10 bg-black/80 px-3 py-2 text-xs text-slate-100">
        <div className="font-semibold">{p?.name ?? ""}</div>
        <div>{formatPKRCompact(Number(p?.value ?? 0))}</div>
      </div>
    );
  }

  if (single) {
    const p = payload[0];
    return (
      <div className="rounded-xl border border-white/10 bg-black/80 px-3 py-2 text-xs text-slate-100">
        <div className="font-semibold">{label}</div>
        <div>{formatPKRCompact(Number(p?.value ?? 0))}</div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/10 bg-black/80 px-3 py-2 text-xs text-slate-100">
      <div className="font-semibold">{label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center justify-between gap-4">
          <span className="text-slate-300">{p.name ?? p.dataKey}</span>
          <span className="font-semibold">{formatPKRCompact(Number(p.value ?? 0))}</span>
        </div>
      ))}
    </div>
  );
}
