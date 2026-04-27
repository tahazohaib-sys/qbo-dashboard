// src/app/dashboard/page.tsx
"use client";

import Image from "next/image";
import Link from "next/link";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  AreaChart,
  Line,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  ComposedChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  Legend,
  ReferenceLine,
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

/** ✅ Custom Field rows for AR/AP (as-of specific) */
type ArApCustomRow = {
  id: string;
  module: string;
  section: "payables" | "receivables";
  as_of_date: string; // YYYY-MM-DD
  label: string;
  amount: number; // PKR
  created_at: string;
};

type ArApCustomListResp = { ok: true; asOf: string; rows: ArApCustomRow[] } | { ok: false; error: string };
type ArApCustomCreateResp = { ok: true; row: ArApCustomRow } | { ok: false; error: string };

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

function formatPKRMillions(n: number, withSign = false) {
  const sign = n < 0 ? "-" : withSign && n > 0 ? "+" : "";
  const abs = Math.abs(n);
  return `${sign}PKR ${(abs / 1_000_000).toFixed(1)}M`;
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

const DONUT_COLOR_CLASSES = [
  "bg-blue-400",
  "bg-emerald-400",
  "bg-amber-300",
  "bg-violet-400",
  "bg-rose-400",
  "bg-cyan-300",
  "bg-orange-400",
  "bg-slate-400",
];

type TabKey = "pnl" | "cash" | "retained" | "forecast" | "revenue" | "arAp";
type AppliedFilter = {
  fromYear: number;
  fromMonth: number;
  toYear: number;
  toMonth: number;
  method: "Accrual" | "Cash";
};

function displayTxnAmount(txn: AccountTxnsResp["transactions"][number], homeCurrency: string | null | undefined) {
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

const AXIS_TICK = { fill: "rgba(255,255,255,0.5)", fontSize: 12, fontWeight: 500 } as const;
const AXIS_LINE = false;
const TICK_LINE = false;
const GRID = { stroke: "rgba(255,255,255,0.1)", strokeDasharray: "3 3" } as const;

const CHART_COLORS = {
  positive: "#22d3ee",
  positiveSoft: "#67e8f9",
  caution: "#f59e0b",
  negative: "#f87171",
  profit: "#34d399",
} as const;

function trendLabelFromMoM(mom: number): "Increasing" | "Decreasing" | "Stable" {
  if (!Number.isFinite(mom)) return "Stable";
  if (mom > 0.01) return "Increasing";
  if (mom < -0.01) return "Decreasing";
  return "Stable";
}

function fmtAxisPKR(v: any) {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n)) return "0";
  if (Math.abs(n) >= 1_000_000_000) return `${Math.round(n / 1_000_000_000)}B`;
  if (Math.abs(n) >= 1_000_000) return `${Math.round(n / 1_000_000)}M`;
  if (Math.abs(n) >= 1_000) return `${Math.round(n / 1_000)}K`;
  return `${Math.round(n)}`;
}

function useAnimatedNumber(target: number, durationMs = 800) {
  const [value, setValue] = useState(target);
  const fromRef = useRef(target);
  const reduceMotion = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    if (reduceMotion) {
      fromRef.current = target;
      return;
    }

    const start = performance.now();
    const from = fromRef.current;
    const delta = target - from;
    let raf = 0;

    const step = (ts: number) => {
      const progress = Math.min(1, (ts - start) / durationMs);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(from + delta * eased);
      if (progress < 1) {
        raf = requestAnimationFrame(step);
      } else {
        fromRef.current = target;
      }
    };

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [durationMs, reduceMotion, target]);

  return reduceMotion ? target : value;
}

function WorldMapVideoBackground(): React.JSX.Element {
  const [reduceMotion, setReduceMotion] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduceMotion(media.matches);
    update();

    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", update);
      return () => media.removeEventListener("change", update);
    }

    media.addListener(update);
    return () => media.removeListener(update);
  }, []);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;

    if (reduceMotion) {
      el.pause();
      return;
    }

    el.playbackRate = 0.8;
    const playPromise = el.play();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(() => {});
    }
  }, [reduceMotion]);

  return (
    <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
      <video
        ref={videoRef}
        autoPlay={!reduceMotion}
        loop
        muted
        playsInline
        preload="metadata"
        poster="/bg/world-map-poster.jpg"
        className="absolute inset-0 h-full w-full object-cover opacity-[0.14] blur-[0.4px] mix-blend-screen [mask-image:radial-gradient(circle_at_center,black_0%,black_45%,transparent_80%)]"
      >
        <source src="/bg/2611-865412751_medium.mp4" type="video/mp4" />
      </video>

      <div className="absolute inset-0 bg-black/35 [mask-image:radial-gradient(circle_at_center,black_0%,black_45%,transparent_80%)]" />
    </div>
  );
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
  const [appliedFilters, setAppliedFilters] = useState<AppliedFilter>({
    fromYear: now.getFullYear(),
    fromMonth: 1,
    toYear: now.getFullYear(),
    toMonth: now.getMonth() + 1,
    method: "Accrual",
  });

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

  // ✅ AR/AP
  const [arApLoading, setArApLoading] = useState(false);
  const [arAp, setArAp] = useState<ArApResp | null>(null);
  const [showManualAdjustments, setShowManualAdjustments] = useState(true);
  const [monthlyArAp, setMonthlyArAp] = useState<
    Array<{ month: string; asOf: string; payables: number; receivables: number; error?: boolean }>
  >([]);

  // ✅ AR/AP Custom Fields (As-Of specific)
  const [arApCustomLoading, setArApCustomLoading] = useState(false);
  const [arApCustomErr, setArApCustomErr] = useState("");
  const [arApCustomRows, setArApCustomRows] = useState<ArApCustomRow[]>([]);
  const [customSection, setCustomSection] = useState<"payables" | "receivables">("receivables");
  const [customLabel, setCustomLabel] = useState("");
  const [customAmount, setCustomAmount] = useState<string>("");

  const [pptxLoading, setPptxLoading] = useState(false);
  const [err, setErr] = useState<string>("");
  const [lastUpdated, setLastUpdated] = useState("--:--:--");
  const [autoRefresh, setAutoRefresh] = useState(false);
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const applyFiltersRef = useRef<() => Promise<void>>(async () => {});
  const requestIdRef = useRef(0);
  const moduleCacheRef = useRef<Map<string, any>>(new Map());
  const hasInitializedRef = useRef(false);
  const hasHandledInitialTabEffectRef = useRef(false);

  function buildStartEnd(fy: number, fm: number, ty: number, tm: number) {
    const start = `${fy}-${String(fm).padStart(2, "0")}-01`;
    const endDate = new Date(ty, tm, 0);
    const end = `${ty}-${String(tm).padStart(2, "0")}-${String(endDate.getDate()).padStart(2, "0")}`;
    return { start, end };
  }

  function monthSpanInclusive(fy: number, fm: number, ty: number, tm: number) {
    const span = (ty - fy) * 12 + (tm - fm) + 1;
    return Math.max(1, Math.min(24, span));
  }

  async function fetchForecast(series: DashboardResp["series"], horizon: 6 | 12): Promise<ForecastApiResp | null> {
    const res = await fetch(`/api/forecast`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ series, horizon }),
    });
    const json: ForecastApiResp = await res.json();
    return json?.ok ? json : null;
  }

  // ✅ Custom Fields fetch (as-of specific)
  async function fetchArApCustom(asOfYmd: string): Promise<ArApCustomRow[]> {
    const res = await fetch(`/api/custom-fields/ar-ap?asOf=${encodeURIComponent(asOfYmd)}`, { cache: "no-store" });
    const json: ArApCustomListResp = await res.json();
    if (!json || (json as any).ok !== true) throw new Error((json as any)?.error || "Custom fields API failed");
    return (json as any).rows ?? [];
  }

  async function reloadArApCustom(asOfYmd: string) {
    setArApCustomLoading(true);
    setArApCustomErr("");
    try {
      const rows = await fetchArApCustom(asOfYmd);
      setArApCustomRows(rows);
    } catch (e: any) {
      setArApCustomErr(e?.message ?? "Failed to load manual adjustments");
      setArApCustomRows([]);
    } finally {
      setArApCustomLoading(false);
    }
  }

  async function addArApCustom(asOfYmd: string) {
    setArApCustomErr("");

    const label = customLabel.trim();
    if (!label) {
      setArApCustomErr("Label is required.");
      return;
    }

    const amt = Number(String(customAmount).replace(/,/g, "").trim());
    if (!Number.isFinite(amt)) {
      setArApCustomErr("Amount is invalid.");
      return;
    }

    const res = await fetch(`/api/custom-fields/ar-ap`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        asOf: asOfYmd,
        section: customSection,
        label,
        amount: Math.round(amt),
      }),
    });

    const json: ArApCustomCreateResp = await res.json();
    if (!json || (json as any).ok !== true) {
      setArApCustomErr((json as any)?.error || "Failed to add manual adjustment.");
      return;
    }

    setCustomLabel("");
    setCustomAmount("");
    invalidateTabCache("arAp");
    await reloadArApCustom(asOfYmd);
  }

  async function deleteArApCustom(id: string, asOfYmd: string) {
    setArApCustomErr("");
    await fetch(`/api/custom-fields/ar-ap?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    invalidateTabCache("arAp");
    await reloadArApCustom(asOfYmd);
  }

  function invalidateTabCache(tabKey: TabKey) {
    for (const key of moduleCacheRef.current.keys()) {
      if (key.startsWith(`${tabKey}|`)) moduleCacheRef.current.delete(key);
    }
  }

  async function loadArApAndMonthly(
    endYmd: string,
    fy: number,
    fm: number,
    ty: number,
    tm: number,
    accountingMethod: "Accrual" | "Cash"
  ) {
    // ✅ ONE call only (backend returns month-end Balance Sheet monthlySeries)
    const res = await fetch(
      `
      /api/qbo/ar-ap?asOf=${encodeURIComponent(endYmd)}&months=${monthSpanInclusive(fy, fm, ty, tm)}&fromYear=${fy}&fromMonth=${fm}&toYear=${ty}&toMonth=${tm}&accounting_method=${encodeURIComponent(accountingMethod)}
    `.replace(/\s+/g, ""),
      { cache: "no-store" }
    );

    const one: any = await res.json();
    if (!one?.ok) throw new Error(one?.error || "AR/AP API failed");

    // ---------- Build monthly rows (from backend series) ----------
    const monthlySeries: Array<{ asOf: string; month: string; payables: number; receivables: number; error?: boolean }> = (
      one.monthlySeries ?? []
    ).map((r: any) => ({
      asOf: r.asOf ?? `${r.month}-01`,
      month: r.month,
      payables: Number(r.payables ?? 0),
      receivables: Number(r.receivables ?? 0),
      error: Boolean(r.error),
    }));
    return { arAp: one as ArApResp, monthlySeries };
  }

  async function fetchTransactions(accountId: string): Promise<AccountTxnsResp | null> {
    const res = await fetch(`/api/qbo/account-transactions?accountId=${encodeURIComponent(accountId)}&limit=5`, {
      cache: "no-store",
    });
    const json: AccountTxnsResp = await res.json();
    return json.ok ? json : null;
  }

  function getNormalizedFilters(filters: AppliedFilter) {
    const fromKey = filters.fromYear * 100 + filters.fromMonth;
    const toKey = filters.toYear * 100 + filters.toMonth;
    const fy = fromKey <= toKey ? filters.fromYear : filters.toYear;
    const fm = fromKey <= toKey ? filters.fromMonth : filters.toMonth;
    const ty = fromKey <= toKey ? filters.toYear : filters.fromYear;
    const tm = fromKey <= toKey ? filters.toMonth : filters.fromMonth;
    const { start, end } = buildStartEnd(fy, fm, ty, tm);
    return { fy, fm, ty, tm, start, end };
  }

  function cacheKey(tabKey: TabKey, filters: AppliedFilter, extras: string[] = []) {
    const { fy, fm, ty, tm } = getNormalizedFilters(filters);
    return [tabKey, fy, fm, ty, tm, filters.method, ...extras].join("|");
  }

  function setLastUpdatedNow() {
    setLastUpdated(new Date().toLocaleTimeString("en-GB", { hour12: false }));
  }

  function shouldApplyRequest(requestId: number) {
    return requestId === requestIdRef.current;
  }

  async function loadActiveTabData(nextTab: TabKey, filters: AppliedFilter, requestId: number) {
    if (nextTab === "revenue") return;

    const { fy, fm, ty, tm, start, end } = getNormalizedFilters(filters);
    setErr("");

    if (nextTab === "pnl") {
      const key = cacheKey("pnl", filters);
      const cached = moduleCacheRef.current.get(key);
      if (cached) {
        if (!shouldApplyRequest(requestId)) return;
        setData(cached.dashboard);
        setPnlBreakdown(cached.pnlBreakdown);
        setLastUpdatedNow();
        return;
      }

      const [dashRes, pnlRes] = await Promise.all([
        fetch(
          `/api/dashboard?start_date=${encodeURIComponent(start)}&end_date=${encodeURIComponent(end)}&accounting_method=${encodeURIComponent(filters.method)}`,
          { cache: "no-store" }
        ),
        fetch(
          `/api/qbo/pnl-table?start_date=${encodeURIComponent(start)}&end_date=${encodeURIComponent(end)}&accounting_method=${encodeURIComponent(filters.method)}`,
          { cache: "no-store" }
        ),
      ]);

      const dashJson: DashboardResp = await dashRes.json();
      const pnlJson: PnlTableResp = await pnlRes.json();
      if (!dashJson.ok) throw new Error(dashJson.error || "Dashboard API failed");
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
      const nextBreakdown = restSum > 0 ? [...top, { name: "Other", value: restSum }] : top;

      moduleCacheRef.current.set(key, { dashboard: dashJson, pnlBreakdown: nextBreakdown });
      if (!shouldApplyRequest(requestId)) return;
      setData(dashJson);
      setPnlBreakdown(nextBreakdown);
      setLastUpdatedNow();
      return;
    }

    if (nextTab === "cash") {
      const txKey = selectedAccount?.id ?? "none";
      const key = cacheKey("cash", filters, [txKey]);
      const cached = moduleCacheRef.current.get(key);
      if (cached) {
        if (!shouldApplyRequest(requestId)) return;
        setCashBanks(cached.cashBanks);
        setTxns(cached.txns);
        setLastUpdatedNow();
        return;
      }

      const txPromise = selectedAccount ? fetchTransactions(selectedAccount.id) : Promise.resolve(null);
      const [cbRes, txRes] = await Promise.all([fetch(`/api/qbo/cash-banks?includeZero=true`, { cache: "no-store" }), txPromise]);
      const cbJson: CashBanksResp = await cbRes.json();
      if (!cbJson.ok) throw new Error(cbJson.error || "Cash-banks API failed");

      moduleCacheRef.current.set(key, { cashBanks: cbJson, txns: txRes });
      if (!shouldApplyRequest(requestId)) return;
      setCashBanks(cbJson);
      setTxns(txRes);
      setLastUpdatedNow();
      return;
    }

    if (nextTab === "retained") {
      const key = cacheKey("retained", filters);
      const cached = moduleCacheRef.current.get(key);
      if (cached) {
        if (!shouldApplyRequest(requestId)) return;
        setRetained(cached.retained);
        setLastUpdatedNow();
        return;
      }

      const reRes = await fetch(
        `/api/qbo/retained-earning?start_date=${encodeURIComponent(start)}&end_date=${encodeURIComponent(end)}&accounting_method=${encodeURIComponent(filters.method)}`,
        { cache: "no-store" }
      );
      const reJson: RetainedResp = await reRes.json();
      const nextRetained = reJson?.ok ? reJson : null;

      moduleCacheRef.current.set(key, { retained: nextRetained });
      if (!shouldApplyRequest(requestId)) return;
      setRetained(nextRetained);
      setLastUpdatedNow();
      return;
    }

    if (nextTab === "arAp") {
      const key = cacheKey("arAp", filters);
      const cached = moduleCacheRef.current.get(key);
      if (cached) {
        if (!shouldApplyRequest(requestId)) return;
        setArAp(cached.arAp);
        setMonthlyArAp(cached.monthlySeries);
        setArApCustomRows(cached.customRows);
        setArApCustomErr(cached.customErr ?? "");
        setLastUpdatedNow();
        return;
      }

      const [arApResp, customRowsSettled] = await Promise.all([
        loadArApAndMonthly(end, fy, fm, ty, tm, filters.method),
        fetchArApCustom(end).then(
          (rows) => ({ rows, error: "" }),
          (e: any) => ({ rows: [] as ArApCustomRow[], error: e?.message ?? "Failed to load manual adjustments" })
        ),
      ]);

      moduleCacheRef.current.set(key, { ...arApResp, customRows: customRowsSettled.rows, customErr: customRowsSettled.error });
      if (!shouldApplyRequest(requestId)) return;
      setArAp(arApResp.arAp);
      setMonthlyArAp(arApResp.monthlySeries);
      setArApCustomRows(customRowsSettled.rows);
      setArApCustomErr(customRowsSettled.error);
      setLastUpdatedNow();
      return;
    }

    if (nextTab === "forecast") {
      const key = cacheKey("forecast", filters, [String(forecastHorizon)]);
      const cached = moduleCacheRef.current.get(key);
      if (cached) {
        if (!shouldApplyRequest(requestId)) return;
        setData(cached.dashboard);
        setForecastData(cached.forecastData);
        setLastUpdatedNow();
        return;
      }

      const dashRes = await fetch(
        `/api/dashboard?start_date=${encodeURIComponent(start)}&end_date=${encodeURIComponent(end)}&accounting_method=${encodeURIComponent(filters.method)}`,
        { cache: "no-store" }
      );
      const dashJson: DashboardResp = await dashRes.json();
      if (!dashJson.ok) throw new Error(dashJson.error || "Dashboard API failed");

      const nextForecast = dashJson?.series?.length ? await fetchForecast(dashJson.series, forecastHorizon) : null;

      moduleCacheRef.current.set(key, { dashboard: dashJson, forecastData: nextForecast });
      if (!shouldApplyRequest(requestId)) return;
      setData(dashJson);
      setForecastData(nextForecast);
      setLastUpdatedNow();
    }
  }

  async function runActiveTabLoad(nextTab: TabKey, filters: AppliedFilter) {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setErr("");
    setTxnLoading(nextTab === "cash");
    setRetainedLoading(nextTab === "retained");
    setArApLoading(nextTab === "arAp");
    setForecastLoading(nextTab === "forecast");
    try {
      await loadActiveTabData(nextTab, filters, requestId);
    } catch (e: any) {
      if (!shouldApplyRequest(requestId)) return;
      setErr(e?.message ?? String(e));
    } finally {
      if (!shouldApplyRequest(requestId)) return;
      setLoading(false);
      setTxnLoading(false);
      setRetainedLoading(false);
      setArApLoading(false);
      setForecastLoading(false);
    }
  }

  async function applyFilters() {
    const nextFilters: AppliedFilter = { fromYear, fromMonth, toYear, toMonth, method };
    setAppliedFilters(nextFilters);
    await runActiveTabLoad(tab, nextFilters);
  }

  async function exportToPptx() {
    setPptxLoading(true);
    try {
      const { start, end } = buildStartEnd(
        Math.min(fromYear, toYear) === fromYear && fromMonth <= toMonth ? fromYear : toYear,
        Math.min(fromYear, toYear) === fromYear && fromMonth <= toMonth ? fromMonth : toMonth,
        Math.min(fromYear, toYear) === toYear && toMonth >= fromMonth ? toYear : fromYear,
        Math.min(fromYear, toYear) === toYear && toMonth >= fromMonth ? toMonth : fromMonth
      );
      const params = new URLSearchParams({
        start_date: start,
        end_date: end,
        accounting_method: method,
      });
      const res = await fetch(`/api/export/powerpoint?${params.toString()}`);
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error((json as any)?.error ?? "Export failed");
      }
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = `Finance_Report_${start}_to_${end}.pptx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setErr(e?.message ?? "PowerPoint export failed");
    } finally {
      setPptxLoading(false);
    }
  }

  useEffect(() => {
    applyFiltersRef.current = applyFilters;
  });

  useEffect(() => {
    applyFilters();
    hasInitializedRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!hasInitializedRef.current) return;
    if (!hasHandledInitialTabEffectRef.current) {
      hasHandledInitialTabEffectRef.current = true;
      return;
    }
    if (tab === "revenue") return;
    runActiveTabLoad(tab, appliedFilters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  useEffect(() => {
    if (tab !== "cash") return;
    runActiveTabLoad("cash", appliedFilters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAccount?.id]);

  useEffect(() => {
    if (tab !== "forecast") return;
    runActiveTabLoad("forecast", appliedFilters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forecastHorizon]);

  useEffect(() => {
    if (!autoRefresh) {
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
      return;
    }

    const runRefresh = () => {
      if (document.visibilityState === "visible") {
        applyFiltersRef.current();
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        runRefresh();
      }
    };

    refreshTimerRef.current = setInterval(runRefresh, 30_000);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [autoRefresh]);

  const series = data?.series ?? [];
  const kpi = data?.kpis?.ytd ?? { revenue: 0, expenses: 0, profit: 0 };
  const netMargin = kpi.revenue !== 0 ? kpi.profit / kpi.revenue : 0;
  const isProfit = netMargin >= 0;
  const financialLabel = isProfit ? "Net Profit Margin" : "Net Loss Margin";
  const marginTone = isProfit ? "text-emerald-300" : "text-rose-300";
  const marginGlow = isProfit
    ? "shadow-[0_0_50px_rgba(16,185,129,0.35)]"
    : "shadow-[0_0_50px_rgba(244,63,94,0.35)]";

  const financialSummary = isProfit
    ? `The selected period delivered a net profit of ${formatPKRMillions(
        kpi.profit
      )}, supported by stronger earnings over operating costs. Keep momentum through disciplined expense control and faster invoice realization.`
    : `The selected period resulted in a net loss of ${formatPKRMillions(
        kpi.profit
      )}, with expenses exceeding revenue. Primary pressure remains in core fixed costs, so immediate focus should be on revenue realization and invoice coverage.`;

  const expenseComposition = useMemo(() => {
    const sorted = [...pnlBreakdown].sort((a, b) => b.value - a.value);
    const topSix = sorted.slice(0, 6);
    const remaining = sorted.slice(6).reduce((sum, item) => sum + item.value, 0);
    return remaining > 0 ? [...topSix, { name: "Other", value: remaining }] : topSix;
  }, [pnlBreakdown]);

  const expenseTotal = useMemo(() => expenseComposition.reduce((sum, item) => sum + item.value, 0), [expenseComposition]);

  const momRevenue: number | null = series.length >= 2 && series[series.length - 2].revenue !== 0
    ? (series[series.length - 1].revenue - series[series.length - 2].revenue) / series[series.length - 2].revenue
    : null;
  const momExpenses: number | null = series.length >= 2 && series[series.length - 2].expenses !== 0
    ? (series[series.length - 1].expenses - series[series.length - 2].expenses) / series[series.length - 2].expenses
    : null;
  const momProfit: number | null = series.length >= 2 && series[series.length - 2].profit !== 0
    ? (series[series.length - 1].profit - series[series.length - 2].profit) / Math.abs(series[series.length - 2].profit)
    : null;

  const marginSeries = useMemo(
    () => series.map(s => ({ month: s.month, margin: s.revenue ? +(s.profit / s.revenue * 100).toFixed(1) : 0 })),
    [series]
  );
  const avgMargin = marginSeries.length > 0 ? marginSeries.reduce((sum, m) => sum + m.margin, 0) / marginSeries.length : 0;

  const bestProfitMonth = series.length > 0
    ? series.reduce((best, s) => s.profit > best.profit ? s : best, series[0])
    : { month: "—", profit: 0 };
  const expenseRatio: number | null = kpi.revenue > 0 ? kpi.expenses / kpi.revenue : null;

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

  const fcAvgRevenue = forecastData?.averages?.avgMonthlyRevenue ?? 0;
  const fcAvgOpex = forecastData?.averages?.avgMonthlyOpex ?? 0;

  const fcRevMoM = forecastData?.trends?.revenueMoM ?? 0;
  const fcExpMoM = forecastData?.trends?.expensesMoM ?? 0;

  const fcBreakeven = forecastData?.benchmarks?.breakevenRevenue ?? fcAvgOpex;
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
  }, [
    fcOk,
    fcAvgRevenue,
    fcBreakeven,
    forecastData?.benchmarks?.margin10,
    forecastData?.benchmarks?.margin20,
    forecastData?.benchmarks?.margin30,
  ]);

  const forecastRows = forecastData?.forecast ?? [];

  // ✅ compute custom sums for CURRENT asOf (used in AR/AP UI totals)
  const arApCustomPayables = useMemo(() => arApCustomRows.filter((r) => r.section === "payables"), [arApCustomRows]);
  const arApCustomReceivables = useMemo(() => arApCustomRows.filter((r) => r.section === "receivables"), [arApCustomRows]);

  const customPayablesSum = useMemo(
    () => arApCustomPayables.reduce((s, r) => s + Number(r.amount ?? 0), 0),
    [arApCustomPayables]
  );
  const customReceivablesSum = useMemo(
    () => arApCustomReceivables.reduce((s, r) => s + Number(r.amount ?? 0), 0),
    [arApCustomReceivables]
  );

  const payablesAdjTotal = (arAp?.payables?.totalPayables ?? 0) + customPayablesSum;
  const receivablesAdjTotal = (arAp?.receivables?.totalReceivables ?? 0) + customReceivablesSum;

  // AR/AP insight metrics
  const liquidityRatio = payablesAdjTotal > 0 ? receivablesAdjTotal / payablesAdjTotal : 0;
  const overdueAP = arAp?.apAging?.vendors?.reduce((s, v) => s + (v["61_90"] ?? 0) + (v["91_plus"] ?? 0), 0) ?? 0;
  const overdueAPPct = (arAp?.apAging?.totalAP ?? 0) > 0 ? (overdueAP / arAp!.apAging.totalAP) * 100 : 0;
  const topVendorTotal = arAp?.apAging?.vendors?.length ? Math.max(...arAp.apAging.vendors.map((v) => v.total)) : 0;
  const topVendorPct = (arAp?.apAging?.totalAP ?? 0) > 0 ? (topVendorTotal / arAp!.apAging.totalAP) * 100 : 0;
  const topVendorName = arAp?.apAging?.vendors?.find((v) => v.total === topVendorTotal)?.vendor ?? "—";
  const prevPayables = monthlyArAp.length >= 2 ? monthlyArAp[monthlyArAp.length - 2]?.payables : null;
  const prevReceivables = monthlyArAp.length >= 2 ? monthlyArAp[monthlyArAp.length - 2]?.receivables : null;
  const payablesMoMPct = prevPayables ? ((payablesAdjTotal - prevPayables) / Math.abs(prevPayables)) * 100 : null;
  const receivablesMoMPct = prevReceivables ? ((receivablesAdjTotal - prevReceivables) / Math.abs(prevReceivables)) * 100 : null;
  const arApHealthStatus: "healthy" | "caution" | "critical" =
    overdueAPPct > 30 ? "critical" : overdueAPPct > 15 ? "caution" : "healthy";
  const agingChartData =
    arAp?.apAging?.vendors?.map((v) => ({
      vendor: v.vendor.length > 18 ? v.vendor.slice(0, 16) + "…" : v.vendor,
      current: v.current,
      "1_30": v["1_30"],
      "31_60": v["31_60"],
      "61_90": v["61_90"],
      "91_plus": v["91_plus"],
    })) ?? [];

  // endYmd for current selected period (used by add/delete)
  const currentAsOfYmd = useMemo(() => {
    const fromKey = fromYear * 100 + fromMonth;
    const toKey = toYear * 100 + toMonth;
    const ty = fromKey <= toKey ? toYear : fromYear;
    const tm = fromKey <= toKey ? toMonth : fromMonth;
    const endDate = new Date(ty, tm, 0);
    return `${ty}-${String(tm).padStart(2, "0")}-${String(endDate.getDate()).padStart(2, "0")}`;
  }, [fromYear, fromMonth, toYear, toMonth]);

  return (
    <div className='relative min-h-screen overflow-hidden bg-[radial-gradient(1200px_900px_at_15%_10%,rgba(34,211,238,0.12),transparent_55%),radial-gradient(1200px_900px_at_85%_20%,rgba(99,102,241,0.14),transparent_55%),radial-gradient(1000px_700px_at_55%_95%,rgba(244,63,94,0.08),transparent_55%),linear-gradient(180deg,#030711_0%,#050b19_45%,#040714_100%)] text-slate-100 [font-family:ui-sans-serif,system-ui,-apple-system,"Segoe_UI",Inter,Roboto,Arial]'>
      <div className="pointer-events-none absolute inset-0 opacity-[0.03] [background-image:radial-gradient(rgba(255,255,255,0.7)_0.7px,transparent_0.7px)] [background-size:4px_4px]" />
      <div className="pointer-events-none absolute -top-24 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-cyan-400/20 blur-3xl" />
      <WorldMapVideoBackground />
      <div className="pointer-events-none absolute top-1/3 -left-16 h-56 w-56 rounded-full bg-emerald-400/15 blur-3xl" />

      <div className="relative z-10 mx-auto max-w-7xl px-5 py-8">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div className="flex items-center gap-4">
            <div className="relative h-12 w-12 shrink-0">
              <Image src="/logo.png" alt="RTC League Logo" fill className="object-contain" priority />
            </div>

            <div>
              <h1 className="text-[26px] font-semibold tracking-tight text-white">Finance Dashboard</h1>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 rounded-xl border border-emerald-300/20 bg-emerald-400/10 px-3 py-2 text-xs text-emerald-100">
              <span className="relative inline-flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-300/60 motion-reduce:animate-none" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-300" />
              </span>
              <span className="font-semibold uppercase tracking-[0.14em]">Live</span>
              <span className="text-emerald-100/80">Last updated: {lastUpdated}</span>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-300">
              <div className="font-medium text-slate-200">
                Company: {data?.companyName ?? "—"} ({data?.currency ?? "PKR"})
              </div>
              <div className="opacity-80">As of: {headerAsOf || "—"}</div>
            </div>

            <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-200">
              <span className="uppercase tracking-[0.12em]">Auto refresh</span>
              <button
                type="button"
                role="switch"
                aria-checked={autoRefresh}
                onClick={() => setAutoRefresh((prev) => !prev)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full border transition ${
                  autoRefresh ? "border-cyan-300/50 bg-cyan-400/30" : "border-white/15 bg-white/10"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${
                    autoRefresh ? "translate-x-5" : "translate-x-1"
                  }`}
                />
              </button>
            </label>

            <button
              onClick={applyFilters}
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

          <TabLinkButton active={tab === "revenue"} href="/dashboard/revenue-analytics" prefetch={false} onActivate={() => setTab("revenue")}>
            Revenue Analytics
          </TabLinkButton>
        </div>

        {/* Filters */}
        <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-5 shadow-[0_24px_60px_rgba(2,6,23,0.35)] backdrop-blur-xl">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              <div>
                <label className="text-[12px] uppercase tracking-[0.14em] text-slate-300">From Year</label>
                <select
                  value={fromYear}
                  onChange={(e) => setFromYear(Number(e.target.value))}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-black/35 px-3 py-2 text-sm outline-none transition focus:border-cyan-300/40"
                >
                  {years.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[12px] uppercase tracking-[0.14em] text-slate-300">From Month</label>
                <select
                  value={fromMonth}
                  onChange={(e) => setFromMonth(Number(e.target.value))}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-black/35 px-3 py-2 text-sm outline-none transition focus:border-cyan-300/40"
                >
                  {MONTHS.map((m) => (
                    <option key={m.v} value={m.v}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[12px] uppercase tracking-[0.14em] text-slate-300">To Year</label>
                <select
                  value={toYear}
                  onChange={(e) => setToYear(Number(e.target.value))}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-black/35 px-3 py-2 text-sm outline-none transition focus:border-cyan-300/40"
                >
                  {years.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[12px] uppercase tracking-[0.14em] text-slate-300">To Month</label>
                <select
                  value={toMonth}
                  onChange={(e) => setToMonth(Number(e.target.value))}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-black/35 px-3 py-2 text-sm outline-none transition focus:border-cyan-300/40"
                >
                  {MONTHS.map((m) => (
                    <option key={m.v} value={m.v}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[12px] uppercase tracking-[0.14em] text-slate-300">Accounting Method</label>
                <select
                  value={method}
                  onChange={(e) => setMethod(e.target.value as any)}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-black/35 px-3 py-2 text-sm outline-none transition focus:border-cyan-300/40"
                >
                  <option value="Accrual">Accrual</option>
                  <option value="Cash">Cash</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={applyFilters}
                className="rounded-xl border border-white/10 bg-emerald-500/15 px-4 py-2 text-sm font-semibold hover:bg-emerald-500/20 active:scale-[0.99]"
                disabled={loading}
              >
                Apply
              </button>

              <button
                onClick={exportToPptx}
                disabled={pptxLoading || loading}
                className="flex items-center gap-2 rounded-xl border border-violet-400/30 bg-violet-500/15 px-4 py-2 text-sm font-semibold text-violet-200 hover:bg-violet-500/25 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                title="Export current date range as PowerPoint presentation"
              >
                {pptxLoading ? (
                  <>
                    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    Generating…
                  </>
                ) : (
                  <>
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Export PPTX
                  </>
                )}
              </button>
            </div>
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
                prefetch={false}
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
          <div className="mt-6 space-y-5">
            {arApLoading ? (
              <Panel title="AR/AP Overview">
                <div className="py-6 text-slate-300">Loading…</div>
              </Panel>
            ) : !arAp?.ok ? (
              <Panel title="AR/AP Overview">
                <div className="py-6 text-slate-300">No AR/AP data.</div>
              </Panel>
            ) : (
              <>
                {/* HEALTH BANNER */}
                <div
                  className={`flex items-start gap-4 rounded-2xl border px-5 py-4 ${
                    arApHealthStatus === "healthy"
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                      : arApHealthStatus === "caution"
                      ? "border-amber-500/30 bg-amber-500/10 text-amber-200"
                      : "border-rose-500/30 bg-rose-500/10 text-rose-200"
                  }`}
                >
                  <div className="mt-0.5 text-2xl leading-none">
                    {arApHealthStatus === "healthy" ? "✓" : arApHealthStatus === "caution" ? "⚠" : "✕"}
                  </div>
                  <div>
                    <div className="font-semibold">
                      {arApHealthStatus === "healthy"
                        ? "AP Obligations Healthy"
                        : arApHealthStatus === "caution"
                        ? "AP Aging Caution"
                        : "AP Aging Critical"}
                    </div>
                    <div className="mt-0.5 text-sm opacity-80">
                      {overdueAP > 0
                        ? `${overdueAPPct.toFixed(1)}% of AP (${formatPKRCompact(overdueAP)}) is overdue 61+ days · As of ${arAp.asOf}`
                        : `No overdue payables beyond 60 days · As of ${arAp.asOf}`}
                    </div>
                  </div>
                </div>

                {/* KPI GRID — 6 cards */}
                <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
                  <KpiCard
                    title="Total Payables"
                    numericValue={payablesAdjTotal}
                    formatValue={formatPKRCompact}
                    highlight="bad"
                    subtext={
                      payablesMoMPct !== null
                        ? `${payablesMoMPct >= 0 ? "▲" : "▼"} ${Math.abs(payablesMoMPct).toFixed(1)}% vs prev month`
                        : "Month-end snapshot"
                    }
                  />
                  <KpiCard
                    title="Total Receivables"
                    numericValue={receivablesAdjTotal}
                    formatValue={formatPKRCompact}
                    highlight="good"
                    subtext={
                      receivablesMoMPct !== null
                        ? `${receivablesMoMPct >= 0 ? "▲" : "▼"} ${Math.abs(receivablesMoMPct).toFixed(1)}% vs prev month`
                        : "Month-end snapshot"
                    }
                  />
                  <KpiCard
                    title="Net Position"
                    numericValue={receivablesAdjTotal - payablesAdjTotal}
                    formatValue={formatPKRCompact}
                    highlight={receivablesAdjTotal - payablesAdjTotal >= 0 ? "good" : "bad"}
                    subtext={
                      receivablesAdjTotal - payablesAdjTotal >= 0
                        ? "Receivables exceed payables"
                        : "Payables exceed receivables"
                    }
                  />
                  <KpiCard
                    title="Liquidity Ratio"
                    value={payablesAdjTotal > 0 ? liquidityRatio.toFixed(2) + "×" : "—"}
                    highlight={liquidityRatio >= 1 ? "good" : "bad"}
                    subtext={liquidityRatio >= 1 ? "AR covers AP obligations" : "AP exceeds AR coverage"}
                  />
                  <KpiCard
                    title="Overdue AP (61+ d)"
                    numericValue={overdueAP}
                    formatValue={formatPKRCompact}
                    highlight={overdueAP > 0 ? "bad" : undefined}
                    subtext={overdueAP > 0 ? `${overdueAPPct.toFixed(1)}% of total AP` : "No overdue AP"}
                  />
                  <KpiCard
                    title="Top Vendor Exposure"
                    value={topVendorPct > 0 ? `${topVendorPct.toFixed(0)}%` : "—"}
                    highlight={topVendorPct > 50 ? "bad" : undefined}
                    subtext={topVendorName !== "—" ? topVendorName : "No vendor data"}
                  />
                </div>

                {/* CHARTS GRID */}
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                  {/* Donut with center label */}
                  <Panel title={`Payables vs Receivables (${arAp.asOf})`}>
                    <div className="relative h-[280px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Tooltip content={<MoneyTooltip pie />} />
                          <Legend iconSize={10} wrapperStyle={{ fontSize: 12 }} />
                          <Pie
                            data={[
                              { name: "Payables", value: payablesAdjTotal },
                              { name: "Receivables", value: receivablesAdjTotal },
                            ]}
                            dataKey="value"
                            nameKey="name"
                            innerRadius={72}
                            outerRadius={108}
                            paddingAngle={3}
                          >
                            <Cell fill="#f87171" />
                            <Cell fill="#34d399" />
                          </Pie>
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center pb-5">
                        <div className="text-[11px] uppercase tracking-widest text-slate-400">Net Position</div>
                        <div
                          className={`mt-0.5 text-base font-bold ${
                            receivablesAdjTotal - payablesAdjTotal >= 0 ? "text-emerald-300" : "text-rose-300"
                          }`}
                        >
                          {formatPKRCompact(Math.abs(receivablesAdjTotal - payablesAdjTotal))}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          {receivablesAdjTotal - payablesAdjTotal >= 0 ? "surplus" : "deficit"}
                        </div>
                      </div>
                    </div>
                  </Panel>

                  {/* AP Aging Stacked Horizontal Bar */}
                  <Panel title="AP Aging by Vendor">
                    {agingChartData.length > 0 ? (
                      <div style={{ height: Math.max(260, agingChartData.length * 52) }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            data={agingChartData}
                            layout="vertical"
                            margin={{ top: 4, right: 16, left: 4, bottom: 4 }}
                          >
                            <CartesianGrid {...GRID} horizontal={false} />
                            <XAxis
                              type="number"
                              tick={AXIS_TICK}
                              tickFormatter={fmtAxisPKR}
                              axisLine={AXIS_LINE}
                              tickLine={TICK_LINE}
                            />
                            <YAxis
                              type="category"
                              dataKey="vendor"
                              tick={{ ...AXIS_TICK, fontSize: 11 }}
                              axisLine={AXIS_LINE}
                              tickLine={TICK_LINE}
                              width={90}
                            />
                            <Tooltip content={<MoneyTooltip apAgingBar />} />
                            <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                            <Bar dataKey="current" name="Current" stackId="a" fill="#22c55e" />
                            <Bar dataKey="1_30" name="1–30 d" stackId="a" fill="#22d3ee" />
                            <Bar dataKey="31_60" name="31–60 d" stackId="a" fill="#f59e0b" />
                            <Bar dataKey="61_90" name="61–90 d" stackId="a" fill="#f97316" />
                            <Bar dataKey="91_plus" name="91+ d" stackId="a" fill="#ef4444" radius={[0, 3, 3, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    ) : (
                      <div className="flex h-[260px] items-center justify-center text-slate-400">
                        No aging data available
                      </div>
                    )}
                  </Panel>

                  {/* Monthly Trend */}
                  <Panel title="Monthly Payables Trend">
                    <div className="h-[280px]">
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
                          <Tooltip content={<MoneyTooltip single />} />
                          <Line
                            type="monotone"
                            dataKey="payables"
                            name="Payables"
                            stroke={CHART_COLORS.negative}
                            strokeWidth={2.5}
                            dot={(props: any) => (
                              <LastPointPulseDot
                                {...props}
                                dataLength={monthlyArAp.length}
                                color={CHART_COLORS.negative}
                              />
                            )}
                            activeDot={{ r: 5 }}
                            style={{ filter: "drop-shadow(0 0 8px rgba(248,113,113,0.25))" }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </Panel>
                </div>

                {/* MANUAL ADJUSTMENTS */}
                <div>
                  <div className="flex justify-end">
                    <button
                      onClick={() => setShowManualAdjustments((p) => !p)}
                      className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs hover:bg-white/10"
                    >
                      {showManualAdjustments ? "Hide Manual Adjustments" : "Show Manual Adjustments"}
                    </button>
                  </div>
                  <div className="mt-2">
                    <Collapse show={showManualAdjustments}>
                      <Panel title={`Manual Adjustments (As of ${arAp.asOf})`}>
                        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                          <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                            <div className="text-sm font-semibold">Add Adjustment</div>
                            <div className="mt-3 grid grid-cols-1 gap-3">
                              <div>
                                <label className="text-xs text-slate-300">Section</label>
                                <select
                                  value={customSection}
                                  onChange={(e) => setCustomSection(e.target.value as any)}
                                  className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none"
                                >
                                  <option value="receivables">Receivables</option>
                                  <option value="payables">Payables</option>
                                </select>
                              </div>
                              <div>
                                <label className="text-xs text-slate-300">Label</label>
                                <input
                                  value={customLabel}
                                  onChange={(e) => setCustomLabel(e.target.value)}
                                  placeholder="e.g. Customer Deposit (Manual)"
                                  className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none"
                                />
                              </div>
                              <div>
                                <label className="text-xs text-slate-300">Amount (PKR)</label>
                                <input
                                  value={customAmount}
                                  onChange={(e) => setCustomAmount(e.target.value)}
                                  placeholder="e.g. 150000"
                                  className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none"
                                />
                                <div className="mt-1 text-[11px] text-slate-400">
                                  Tip: enter a negative value to reduce totals.
                                </div>
                              </div>
                              <button
                                onClick={() => addArApCustom(currentAsOfYmd)}
                                className="rounded-xl border border-white/10 bg-emerald-500/15 px-4 py-2 text-sm font-semibold hover:bg-emerald-500/20"
                              >
                                Add
                              </button>
                              {arApCustomErr ? (
                                <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">
                                  {arApCustomErr}
                                </div>
                              ) : null}
                            </div>
                          </div>

                          <div className="lg:col-span-2 rounded-2xl border border-white/10 bg-black/20 p-4">
                            <div className="flex items-center justify-between">
                              <div className="text-sm font-semibold">Saved Adjustments</div>
                              <button
                                onClick={() => reloadArApCustom(currentAsOfYmd)}
                                className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs hover:bg-white/10"
                                disabled={arApCustomLoading}
                              >
                                {arApCustomLoading ? "Refreshing…" : "Refresh"}
                              </button>
                            </div>
                            <div className="mt-3 overflow-x-auto">
                              <table className="w-full text-sm">
                                <thead className="text-left text-xs text-slate-300">
                                  <tr>
                                    <th className="py-2 pr-3">Section</th>
                                    <th className="py-2 pr-3">Label</th>
                                    <th className="py-2 text-right">Amount</th>
                                    <th className="py-2 text-right">Action</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {arApCustomLoading ? (
                                    <tr>
                                      <td colSpan={4} className="py-3 text-slate-300">
                                        Loading…
                                      </td>
                                    </tr>
                                  ) : arApCustomRows.length ? (
                                    arApCustomRows.map((r) => (
                                      <tr key={r.id} className="border-t border-white/10">
                                        <td className="py-2 pr-3 capitalize text-slate-200">{r.section}</td>
                                        <td className="py-2 pr-3">{r.label}</td>
                                        <td className="py-2 text-right font-semibold">
                                          {formatPKRCompact(Number(r.amount ?? 0))}
                                        </td>
                                        <td className="py-2 text-right">
                                          <button
                                            onClick={() => deleteArApCustom(r.id, currentAsOfYmd)}
                                            className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-1 text-xs text-rose-200 hover:bg-rose-500/15"
                                          >
                                            Delete
                                          </button>
                                        </td>
                                      </tr>
                                    ))
                                  ) : (
                                    <tr>
                                      <td colSpan={4} className="py-3 text-slate-300">
                                        No manual adjustments for this As-Of date.
                                      </td>
                                    </tr>
                                  )}
                                </tbody>
                              </table>
                            </div>
                            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                              <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                                <div className="text-xs text-slate-300">Payables Adjustments</div>
                                <div className="mt-1 text-lg font-semibold">{formatPKRCompact(customPayablesSum)}</div>
                              </div>
                              <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                                <div className="text-xs text-slate-300">Receivables Adjustments</div>
                                <div className="mt-1 text-lg font-semibold">{formatPKRCompact(customReceivablesSum)}</div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </Panel>
                    </Collapse>
                  </div>
                </div>

                {/* DETAIL TABLES */}
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  {/* Payables Detail — grouped into Current / Long-term */}
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
                          {/* Current group header */}
                          <tr className="bg-rose-500/8">
                            <td
                              colSpan={2}
                              className="py-1.5 pr-3 text-[11px] font-bold uppercase tracking-wider text-rose-300"
                            >
                              Current Payables
                            </td>
                          </tr>
                          {[
                            {
                              label: "Payroll Payable",
                              value: arAp.payables.current.payrollPayable,
                            },
                            {
                              label: "WHT Payable – Vendors",
                              value: arAp.payables.current.withHoldingTaxPayableVendors,
                            },
                            {
                              label: "Vendor Bills",
                              value: Number(
                                (arAp.payables.current as any).vendorBills ??
                                  arAp.payables.current.accountsPayable ??
                                  0
                              ),
                            },
                          ].map(({ label, value }) => (
                            <tr key={label} className="border-t border-white/10">
                              <td className="py-2 pr-3">
                                <div className="font-medium text-slate-200">{label}</div>
                                <div className="mt-1 h-1 w-full rounded-full bg-white/5">
                                  <div
                                    className="h-1 rounded-full bg-rose-400/50"
                                    style={{
                                      width: `${
                                        payablesAdjTotal > 0
                                          ? Math.min(100, (value / payablesAdjTotal) * 100)
                                          : 0
                                      }%`,
                                    }}
                                  />
                                </div>
                              </td>
                              <td className="py-2 text-right">
                                <div className="font-semibold">{formatPKRCompact(value)}</div>
                                <div className="text-[11px] text-slate-400">
                                  {payablesAdjTotal > 0
                                    ? ((value / payablesAdjTotal) * 100).toFixed(1)
                                    : "0.0"}
                                  %
                                </div>
                              </td>
                            </tr>
                          ))}

                          {/* Long-term group header */}
                          <tr className="bg-amber-500/8">
                            <td
                              colSpan={2}
                              className="py-1.5 pr-3 text-[11px] font-bold uppercase tracking-wider text-amber-300"
                            >
                              Long-term Payables
                            </td>
                          </tr>
                          {[
                            {
                              label: "Sir Aatif Loan to Company",
                              value: arAp.payables.longTerm.sirAatifLoanToCompany,
                            },
                            {
                              label: "Payroll WHT Payable",
                              value: arAp.payables.longTerm.payrollWithHoldingTaxPayable,
                            },
                          ].map(({ label, value }) => (
                            <tr key={label} className="border-t border-white/10">
                              <td className="py-2 pr-3">
                                <div className="font-medium text-slate-200">{label}</div>
                                <div className="mt-1 h-1 w-full rounded-full bg-white/5">
                                  <div
                                    className="h-1 rounded-full bg-amber-400/50"
                                    style={{
                                      width: `${
                                        payablesAdjTotal > 0
                                          ? Math.min(100, (value / payablesAdjTotal) * 100)
                                          : 0
                                      }%`,
                                    }}
                                  />
                                </div>
                              </td>
                              <td className="py-2 text-right">
                                <div className="font-semibold">{formatPKRCompact(value)}</div>
                                <div className="text-[11px] text-slate-400">
                                  {payablesAdjTotal > 0
                                    ? ((value / payablesAdjTotal) * 100).toFixed(1)
                                    : "0.0"}
                                  %
                                </div>
                              </td>
                            </tr>
                          ))}

                          {/* Manual payables */}
                          {arApCustomPayables.length > 0 && (
                            <>
                              <tr className="bg-white/3">
                                <td
                                  colSpan={2}
                                  className="py-1.5 pr-3 text-[11px] font-bold uppercase tracking-wider text-slate-400"
                                >
                                  Manual Adjustments
                                </td>
                              </tr>
                              {arApCustomPayables.map((r) => (
                                <tr key={r.id} className="border-t border-white/10">
                                  <td className="py-2 pr-3 text-slate-200">{r.label}</td>
                                  <td className="py-2 text-right font-semibold">
                                    {formatPKRCompact(Number(r.amount ?? 0))}
                                  </td>
                                </tr>
                              ))}
                            </>
                          )}

                          <tr className="border-t-2 border-white/15 bg-rose-500/10">
                            <td className="py-2.5 pr-3 font-bold text-slate-100">Total Payables</td>
                            <td className="py-2.5 text-right font-bold text-slate-100">
                              {formatPKRCompact(payablesAdjTotal)}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </Panel>

                  {/* Receivables Detail */}
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
                          <tr className="bg-emerald-500/8">
                            <td
                              colSpan={2}
                              className="py-1.5 pr-3 text-[11px] font-bold uppercase tracking-wider text-emerald-300"
                            >
                              Receivables
                            </td>
                          </tr>
                          {[
                            {
                              label: "Loan Against Salary",
                              value: arAp.receivables.loanAgainstSalary,
                            },
                            {
                              label: "Tax Withheld",
                              value: arAp.receivables.taxWithheld,
                            },
                          ].map(({ label, value }) => (
                            <tr key={label} className="border-t border-white/10">
                              <td className="py-2 pr-3">
                                <div className="font-medium text-slate-200">{label}</div>
                                <div className="mt-1 h-1 w-full rounded-full bg-white/5">
                                  <div
                                    className="h-1 rounded-full bg-emerald-400/50"
                                    style={{
                                      width: `${
                                        receivablesAdjTotal > 0
                                          ? Math.min(100, (value / receivablesAdjTotal) * 100)
                                          : 0
                                      }%`,
                                    }}
                                  />
                                </div>
                              </td>
                              <td className="py-2 text-right">
                                <div className="font-semibold">{formatPKRCompact(value)}</div>
                                <div className="text-[11px] text-slate-400">
                                  {receivablesAdjTotal > 0
                                    ? ((value / receivablesAdjTotal) * 100).toFixed(1)
                                    : "0.0"}
                                  %
                                </div>
                              </td>
                            </tr>
                          ))}

                          {arApCustomReceivables.length > 0 && (
                            <>
                              <tr className="bg-white/3">
                                <td
                                  colSpan={2}
                                  className="py-1.5 pr-3 text-[11px] font-bold uppercase tracking-wider text-slate-400"
                                >
                                  Manual Adjustments
                                </td>
                              </tr>
                              {arApCustomReceivables.map((r) => (
                                <tr key={r.id} className="border-t border-white/10">
                                  <td className="py-2 pr-3 text-slate-200">{r.label}</td>
                                  <td className="py-2 text-right font-semibold">
                                    {formatPKRCompact(Number(r.amount ?? 0))}
                                  </td>
                                </tr>
                              ))}
                            </>
                          )}

                          <tr className="border-t-2 border-white/15 bg-emerald-500/10">
                            <td className="py-2.5 pr-3 font-bold text-slate-100">Total Receivables</td>
                            <td className="py-2.5 text-right font-bold text-slate-100">
                              {formatPKRCompact(receivablesAdjTotal)}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </Panel>
                </div>

                {/* VENDOR AGING TABLE — color-coded, sorted by total */}
                <Panel title="Vendor AP Aging Breakdown">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="text-left text-xs text-slate-300">
                        <tr>
                          <th className="py-2 pr-3">Vendor</th>
                          <th className="py-2 text-right">Current</th>
                          <th className="py-2 text-right">1–30 d</th>
                          <th className="py-2 text-right">31–60 d</th>
                          <th className="py-2 text-right">61–90 d</th>
                          <th className="py-2 text-right">91+ d</th>
                          <th className="py-2 text-right">% of AP</th>
                          <th className="py-2 text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {arAp.apAging.vendors?.length ? (
                          <>
                            {[...(arAp.apAging.vendors ?? [])]
                              .sort((a, b) => b.total - a.total)
                              .map((v, i) => (
                                <tr key={i} className="border-t border-white/10">
                                  <td className="py-2 pr-3 font-medium text-slate-200">{v.vendor}</td>
                                  <td className="py-2 text-right font-semibold text-slate-200">
                                    {formatPKRCompact(v.current)}
                                  </td>
                                  <td className="py-2 text-right font-semibold">
                                    <span
                                      className={
                                        v["1_30"] > 0
                                          ? "rounded-md bg-sky-400/10 px-1.5 py-0.5 text-sky-300"
                                          : "text-slate-500"
                                      }
                                    >
                                      {formatPKRCompact(v["1_30"])}
                                    </span>
                                  </td>
                                  <td className="py-2 text-right font-semibold">
                                    <span
                                      className={
                                        v["31_60"] > 0
                                          ? "rounded-md bg-amber-400/15 px-1.5 py-0.5 text-amber-300"
                                          : "text-slate-500"
                                      }
                                    >
                                      {formatPKRCompact(v["31_60"])}
                                    </span>
                                  </td>
                                  <td className="py-2 text-right font-semibold">
                                    <span
                                      className={
                                        v["61_90"] > 0
                                          ? "rounded-md bg-orange-400/20 px-1.5 py-0.5 text-orange-300"
                                          : "text-slate-500"
                                      }
                                    >
                                      {formatPKRCompact(v["61_90"])}
                                    </span>
                                  </td>
                                  <td className="py-2 text-right font-semibold">
                                    <span
                                      className={
                                        v["91_plus"] > 0
                                          ? "rounded-md bg-rose-500/25 px-1.5 py-0.5 text-rose-300"
                                          : "text-slate-500"
                                      }
                                    >
                                      {formatPKRCompact(v["91_plus"])}
                                    </span>
                                  </td>
                                  <td className="py-2 text-right text-slate-400">
                                    {arAp.apAging.totalAP > 0
                                      ? ((v.total / arAp.apAging.totalAP) * 100).toFixed(1) + "%"
                                      : "—"}
                                  </td>
                                  <td className="py-2 text-right font-semibold text-slate-100">
                                    {formatPKRCompact(v.total)}
                                  </td>
                                </tr>
                              ))}
                            {overdueAP > 0 && (
                              <tr className="border-t border-rose-500/20 bg-rose-500/8">
                                <td className="py-2 pr-3 text-xs font-bold uppercase tracking-wider text-rose-300">
                                  Overdue Subtotal (61+ d)
                                </td>
                                <td colSpan={5}></td>
                                <td className="py-2 text-right text-xs text-rose-400">
                                  {overdueAPPct.toFixed(1)}%
                                </td>
                                <td className="py-2 text-right font-bold text-rose-300">
                                  {formatPKRCompact(overdueAP)}
                                </td>
                              </tr>
                            )}
                            <tr className="border-t-2 border-white/15 bg-white/5">
                              <td className="py-2.5 pr-3 font-bold text-slate-100">Total AP</td>
                              <td colSpan={6}></td>
                              <td className="py-2.5 text-right font-bold text-slate-100">
                                {formatPKRCompact(arAp.apAging.totalAP)}
                              </td>
                            </tr>
                          </>
                        ) : (
                          <tr className="border-t border-white/10">
                            <td colSpan={8} className="py-4 text-slate-300">
                              No vendor aging data found.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </Panel>
              </>
            )}
          </div>
        ) : null}

        {/* PNL TAB */}
        {tab === "pnl" ? (
          <>
            {/* KPI CARDS */}
            <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              {/* Total Income */}
              <div className="glass-breathe group rounded-2xl border border-emerald-300/20 bg-gradient-to-b from-white/10 to-white/5 p-5 shadow-[0_16px_45px_rgba(6,182,212,0.12)] backdrop-blur-xl transition hover:border-emerald-300/35">
                <div className="flex items-center gap-2">
                  <svg className="h-4 w-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                  <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Total Income</span>
                </div>
                <div className="mt-3 text-[26px] font-semibold tracking-tight text-white">{formatPKRCompact(kpi.revenue)}</div>
                <div className="mt-2 flex items-center gap-1.5">
                  {momRevenue === null
                    ? <span className="text-[11px] text-slate-500">No prior data</span>
                    : momRevenue >= 0
                      ? <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-300">↑ {(momRevenue * 100).toFixed(1)}% MoM</span>
                      : <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-[11px] font-semibold text-rose-300">↓ {(Math.abs(momRevenue) * 100).toFixed(1)}% MoM</span>
                  }
                  {momRevenue !== null && <span className="text-[11px] text-slate-500">vs prev month</span>}
                </div>
              </div>

              {/* Total Expenses */}
              <div className="glass-breathe group rounded-2xl border border-rose-300/20 bg-gradient-to-b from-white/10 to-white/5 p-5 shadow-[0_16px_45px_rgba(244,63,94,0.10)] backdrop-blur-xl transition hover:border-rose-300/35">
                <div className="flex items-center gap-2">
                  <svg className="h-4 w-4 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" />
                  </svg>
                  <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Total Expenses</span>
                </div>
                <div className="mt-3 text-[26px] font-semibold tracking-tight text-white">{formatPKRCompact(kpi.expenses)}</div>
                <div className="mt-2 flex items-center gap-1.5">
                  {momExpenses === null
                    ? <span className="text-[11px] text-slate-500">No prior data</span>
                    : momExpenses <= 0
                      ? <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-300">↓ {(Math.abs(momExpenses) * 100).toFixed(1)}% MoM</span>
                      : <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-[11px] font-semibold text-rose-300">↑ {(momExpenses * 100).toFixed(1)}% MoM</span>
                  }
                  {momExpenses !== null && <span className="text-[11px] text-slate-500">vs prev month</span>}
                </div>
              </div>

              {/* Net Profit */}
              <div className={`glass-breathe group rounded-2xl border bg-gradient-to-b from-white/10 to-white/5 p-5 backdrop-blur-xl transition ${kpi.profit >= 0 ? "border-cyan-300/20 shadow-[0_16px_45px_rgba(6,182,212,0.12)] hover:border-cyan-300/35" : "border-rose-300/20 shadow-[0_16px_45px_rgba(244,63,94,0.10)] hover:border-rose-300/35"}`}>
                <div className="flex items-center gap-2">
                  <svg className={`h-4 w-4 ${kpi.profit >= 0 ? "text-cyan-400" : "text-rose-400"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                  </svg>
                  <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Net Profit</span>
                </div>
                <div className={`mt-3 text-[26px] font-semibold tracking-tight ${kpi.profit >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{formatPKRCompact(kpi.profit)}</div>
                <div className="mt-2 flex items-center gap-1.5">
                  {momProfit === null
                    ? <span className="text-[11px] text-slate-500">No prior data</span>
                    : momProfit >= 0
                      ? <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-300">↑ {(momProfit * 100).toFixed(1)}% MoM</span>
                      : <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-[11px] font-semibold text-rose-300">↓ {(Math.abs(momProfit) * 100).toFixed(1)}% MoM</span>
                  }
                  {momProfit !== null && <span className="text-[11px] text-slate-500">vs prev month</span>}
                </div>
              </div>

              {/* Expense Ratio */}
              <div className="glass-breathe group rounded-2xl border border-amber-300/20 bg-gradient-to-b from-white/10 to-white/5 p-5 shadow-[0_16px_45px_rgba(245,158,11,0.08)] backdrop-blur-xl transition hover:border-amber-300/35">
                <div className="flex items-center gap-2">
                  <svg className="h-4 w-4 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Expense Ratio</span>
                </div>
                <div className={`mt-3 text-[26px] font-semibold tracking-tight ${expenseRatio === null ? "text-slate-400" : expenseRatio > 0.9 ? "text-rose-300" : expenseRatio > 0.7 ? "text-amber-300" : "text-emerald-300"}`}>
                  {expenseRatio === null ? "N/A" : `${(expenseRatio * 100).toFixed(1)}%`}
                </div>
                <div className="mt-2">
                  <div className="h-1.5 w-full rounded-full bg-white/10">
                    {expenseRatio !== null && (
                      <div className={`h-full rounded-full transition-all duration-700 ${expenseRatio > 0.9 ? "bg-rose-400" : expenseRatio > 0.7 ? "bg-amber-400" : "bg-emerald-400"}`} style={{ width: `${Math.min(expenseRatio * 100, 100)}%` }} />
                    )}
                  </div>
                  <div className="mt-1 text-[11px] text-slate-500">{expenseRatio === null ? "no revenue in period" : "of revenue spent"}</div>
                </div>
              </div>
            </div>

            {/* HERO FINANCIAL SUMMARY */}
            <div className="mt-6">
              <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-slate-900/90 via-[#0d1f3a]/80 to-[#130f2f]/85 p-7 shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_24px_64px_rgba(2,6,23,0.55)] backdrop-blur-xl before:absolute before:inset-0 before:rounded-2xl before:p-px before:[background:linear-gradient(120deg,rgba(34,211,238,0.4),rgba(99,102,241,0.1),rgba(244,63,94,0.3))] before:[mask:linear-gradient(#fff_0_0)_content-box,linear-gradient(#fff_0_0)] before:[mask-composite:xor] md:p-10">
                {/* ambient glow orbs */}
                <div className={`pointer-events-none absolute -left-20 -top-20 h-60 w-60 rounded-full blur-[80px] ${isProfit ? "bg-emerald-500/10" : "bg-rose-500/10"}`} />
                <div className="pointer-events-none absolute -bottom-10 -right-10 h-48 w-48 rounded-full bg-indigo-500/8 blur-[60px]" />

                <div className="relative grid grid-cols-1 gap-8 lg:grid-cols-2 lg:gap-12">
                  {/* Left: big margin display */}
                  <div className="flex flex-col items-center justify-center text-center lg:items-start lg:text-left">
                    <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">{financialLabel}</div>
                    <div className={`text-7xl font-extrabold tracking-tight md:text-8xl ${marginTone} ${marginGlow}`}>
                      {formatPct(netMargin)}
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      {netMargin >= 0
                        ? <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-300">Profitable Period</span>
                        : <span className="rounded-full bg-rose-500/15 px-3 py-1 text-xs font-semibold text-rose-300">Loss Period</span>
                      }
                      <span className="text-xs text-slate-500">{series.length} month{series.length !== 1 ? "s" : ""} tracked</span>
                    </div>
                    <p className="mt-5 max-w-sm text-sm leading-relaxed text-slate-300/90">{financialSummary}</p>
                  </div>

                  {/* Right: metric rows with progress bars */}
                  <div className="flex flex-col justify-center gap-5">
                    {/* Revenue row */}
                    <div>
                      <div className="mb-1.5 flex items-center justify-between">
                        <span className="flex items-center gap-2 text-sm font-medium text-slate-300">
                          <span className="h-2.5 w-2.5 rounded-full bg-cyan-400" />
                          Revenue
                        </span>
                        <span className="text-sm font-semibold text-white">{formatPKRMillions(kpi.revenue)}</span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-white/8">
                        <div className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-cyan-300" style={{ width: "100%" }} />
                      </div>
                    </div>

                    {/* Expenses row */}
                    <div>
                      <div className="mb-1.5 flex items-center justify-between">
                        <span className="flex items-center gap-2 text-sm font-medium text-slate-300">
                          <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
                          Expenses
                        </span>
                        <span className="text-sm font-semibold text-white">{formatPKRMillions(kpi.expenses)}</span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-white/8">
                        <div className="h-full rounded-full bg-gradient-to-r from-rose-600 to-rose-400 transition-all duration-700" style={{ width: `${kpi.revenue > 0 ? Math.min((kpi.expenses / kpi.revenue) * 100, 100) : 0}%` }} />
                      </div>
                    </div>

                    {/* Net Profit row */}
                    <div>
                      <div className="mb-1.5 flex items-center justify-between">
                        <span className="flex items-center gap-2 text-sm font-medium text-slate-300">
                          <span className={`h-2.5 w-2.5 rounded-full ${kpi.profit >= 0 ? "bg-emerald-400" : "bg-rose-400"}`} />
                          Net Profit
                        </span>
                        <span className={`text-sm font-semibold ${kpi.profit >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{formatPKRMillions(kpi.profit, true)}</span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-white/8">
                        <div className={`h-full rounded-full transition-all duration-700 ${kpi.profit >= 0 ? "bg-gradient-to-r from-emerald-600 to-emerald-400" : "bg-gradient-to-r from-rose-600 to-rose-400"}`} style={{ width: `${Math.min(kpi.revenue > 0 ? (Math.abs(kpi.profit) / kpi.revenue) * 100 : 0, 100)}%` }} />
                      </div>
                    </div>

                    {/* Margin gauge */}
                    <div className="mt-1 rounded-xl border border-white/8 bg-white/5 px-4 py-3">
                      <div className="flex items-center justify-between text-xs text-slate-400">
                        <span>Margin Health</span>
                        <span className={`font-semibold ${netMargin >= 0.15 ? "text-emerald-300" : netMargin >= 0 ? "text-amber-300" : "text-rose-300"}`}>
                          {netMargin >= 0.15 ? "Strong" : netMargin >= 0 ? "Moderate" : "Negative"}
                        </span>
                      </div>
                      <div className="mt-2 h-1.5 w-full rounded-full bg-white/10">
                        <div className={`h-full rounded-full transition-all duration-700 ${netMargin >= 0.15 ? "bg-emerald-400" : netMargin >= 0 ? "bg-amber-400" : "bg-rose-400"}`} style={{ width: `${Math.min(Math.abs(netMargin) * 200, 100)}%` }} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* CHARTS ROW 1 */}
            <div className="mt-8 grid grid-cols-1 gap-5 lg:grid-cols-2">
              {/* Composed Chart: Revenue + Expenses bars + Net Profit line */}
              <ChartCard title="Revenue, Expenses & Net Profit" legend={[{ label: "Revenue", color: "bg-cyan-300" }, { label: "Expenses", color: "bg-rose-300" }, { label: "Net Profit", color: "bg-emerald-300" }]}>
                <div className="h-[320px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={series} margin={{ top: 10, right: 12, left: 6, bottom: 6 }}>
                      <defs>
                        <linearGradient id="incomeBars2" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#67e8f9" stopOpacity={0.9} />
                          <stop offset="100%" stopColor="#0891b2" stopOpacity={0.55} />
                        </linearGradient>
                        <linearGradient id="expenseBars2" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#fda4af" stopOpacity={0.88} />
                          <stop offset="100%" stopColor="#be123c" stopOpacity={0.52} />
                        </linearGradient>
                        <linearGradient id="profitLineGrad" x1="0" y1="0" x2="1" y2="0">
                          <stop offset="0%" stopColor="#5eead4" />
                          <stop offset="100%" stopColor="#34d399" />
                        </linearGradient>
                      </defs>
                      <CartesianGrid {...GRID} />
                      <XAxis dataKey="month" tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={TICK_LINE} />
                      <YAxis tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={TICK_LINE} tickFormatter={fmtAxisPKR} />
                      <Tooltip content={<MoneyTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
                      <ReferenceLine y={0} stroke="rgba(255,255,255,0.2)" strokeDasharray="4 4" />
                      <Bar dataKey="revenue" name="Revenue" fill="url(#incomeBars2)" radius={[6, 6, 0, 0]} style={{ filter: "drop-shadow(0 0 6px rgba(103,232,249,0.18))" }} />
                      <Bar dataKey="expenses" name="Expenses" fill="url(#expenseBars2)" radius={[6, 6, 0, 0]} style={{ filter: "drop-shadow(0 0 6px rgba(251,113,133,0.16))" }} />
                      <Line
                        type="monotone"
                        dataKey="profit"
                        name="Net Profit"
                        stroke="url(#profitLineGrad)"
                        strokeWidth={3}
                        dot={(props: any) => <LastPointPulseDot {...props} dataLength={series.length} color="#5eead4" />}
                        activeDot={{ r: 5.5, fill: "#5eead4", stroke: "#ccfbf1", strokeWidth: 2 }}
                        style={{ filter: "drop-shadow(0 0 8px rgba(52,211,153,0.3))" }}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </ChartCard>

              {/* Profit Margin Trend (AreaChart) */}
              <ChartCard title="Profit Margin Trend %" legend={[{ label: "Margin %", color: "bg-teal-300" }, { label: "Average", color: "bg-amber-300" }]}>
                <div className="h-[320px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={marginSeries} margin={{ top: 10, right: 12, left: 6, bottom: 6 }}>
                      <defs>
                        <linearGradient id="marginAreaGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#2dd4bf" stopOpacity={0.45} />
                          <stop offset="100%" stopColor="#2dd4bf" stopOpacity={0.03} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid {...GRID} />
                      <XAxis dataKey="month" tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={TICK_LINE} />
                      <YAxis tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={TICK_LINE} tickFormatter={(v) => `${v}%`} />
                      <Tooltip
                        content={({ active, payload, label }) => {
                          if (!active || !payload?.length) return null;
                          return (
                            <div className="rounded-2xl border border-white/10 bg-[#070b1a]/90 px-3.5 py-2.5 text-sm text-slate-100 shadow-[0_18px_40px_rgba(2,6,23,0.65)] backdrop-blur-xl">
                              <div className="font-semibold">{label}</div>
                              <div className="text-teal-300">{Number(payload[0]?.value ?? 0).toFixed(1)}% margin</div>
                            </div>
                          );
                        }}
                        cursor={{ stroke: "rgba(255,255,255,0.18)", strokeDasharray: "4 4" }}
                      />
                      <ReferenceLine y={0} stroke="rgba(255,255,255,0.22)" strokeDasharray="4 4" />
                      <ReferenceLine y={avgMargin} stroke="#f59e0b" strokeDasharray="6 3" strokeOpacity={0.6} label={{ value: `avg ${avgMargin.toFixed(1)}%`, fill: "#f59e0b", fontSize: 10, position: "insideTopRight" }} />
                      <Area
                        type="monotone"
                        dataKey="margin"
                        name="Margin %"
                        stroke="#2dd4bf"
                        strokeWidth={2.5}
                        fill="url(#marginAreaGrad)"
                        dot={(props: any) => <LastPointPulseDot {...props} dataLength={marginSeries.length} color="#2dd4bf" />}
                        activeDot={{ r: 5, fill: "#2dd4bf", stroke: "#99f6e4", strokeWidth: 2 }}
                        style={{ filter: "drop-shadow(0 0 8px rgba(45,212,191,0.25))" }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </ChartCard>
            </div>

            {/* EXPENSE BREAKDOWN: Donut + Ranked List */}
            <div className="mt-6">
              <ChartCard title="Expense Composition" legend={expenseComposition.map((entry, idx) => ({ label: entry.name, color: DONUT_COLOR_CLASSES[idx % DONUT_COLOR_CLASSES.length] }))}>
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                  {/* Donut chart */}
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Tooltip content={<MoneyTooltip pie />} />
                        <Pie data={expenseComposition} dataKey="value" nameKey="name" innerRadius={72} outerRadius={108} paddingAngle={2} cornerRadius={6}>
                          {expenseComposition.map((_, i) => (
                            <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
                          ))}
                        </Pie>
                        <text x="50%" y="46%" textAnchor="middle" fill="rgba(148,163,184,0.8)" fontSize={10} letterSpacing="0.18em">TOTAL</text>
                        <text x="50%" y="56%" textAnchor="middle" fill="#f1f5f9" fontSize={13} fontWeight={600}>{formatPKRCompact(expenseTotal)}</text>
                      </PieChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Ranked horizontal bars */}
                  <div className="flex flex-col justify-center gap-3 py-2">
                    <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Breakdown by Category</div>
                    {expenseComposition.map((item, idx) => {
                      const pct = expenseTotal > 0 ? (item.value / expenseTotal) * 100 : 0;
                      return (
                        <div key={item.name}>
                          <div className="mb-1 flex items-center justify-between">
                            <span className="flex items-center gap-1.5 text-xs text-slate-300">
                              <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ background: DONUT_COLORS[idx % DONUT_COLORS.length] }} />
                              {item.name}
                            </span>
                            <span className="text-xs font-semibold text-slate-200">{pct.toFixed(1)}% &middot; {formatPKRCompact(item.value)}</span>
                          </div>
                          <div className="h-1.5 w-full rounded-full bg-white/8">
                            <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: DONUT_COLORS[idx % DONUT_COLORS.length] }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </ChartCard>
            </div>

            {/* KEY INSIGHTS STRIP */}
            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
              {/* Best Month */}
              <div className="glass-breathe rounded-2xl border border-white/10 bg-gradient-to-b from-white/8 to-white/4 p-5 backdrop-blur-xl">
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                  <svg className="h-3.5 w-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 3l14 9-14 9V3z" />
                  </svg>
                  Best Month
                </div>
                <div className="mt-3 text-xl font-bold text-white">{bestProfitMonth.month || "—"}</div>
                <div className={`mt-1 text-sm font-semibold ${bestProfitMonth.profit >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                  {formatPKRCompact(bestProfitMonth.profit)}
                </div>
                <div className="mt-1 text-[11px] text-slate-500">highest net profit in period</div>
              </div>

              {/* Avg Monthly Margin */}
              <div className="glass-breathe rounded-2xl border border-white/10 bg-gradient-to-b from-white/8 to-white/4 p-5 backdrop-blur-xl">
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                  <svg className="h-3.5 w-3.5 text-teal-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  Avg Monthly Margin
                </div>
                <div className={`mt-3 text-xl font-bold ${avgMargin >= 0 ? "text-teal-300" : "text-rose-300"}`}>
                  {avgMargin.toFixed(1)}%
                </div>
                <div className="mt-2 h-1.5 w-full rounded-full bg-white/10">
                  <div className={`h-full rounded-full transition-all duration-700 ${avgMargin >= 10 ? "bg-teal-400" : avgMargin >= 0 ? "bg-amber-400" : "bg-rose-400"}`} style={{ width: `${Math.min(Math.abs(avgMargin) * 2, 100)}%` }} />
                </div>
                <div className="mt-1 text-[11px] text-slate-500">average across {marginSeries.length} months</div>
              </div>

              {/* Cost Efficiency */}
              <div className="glass-breathe rounded-2xl border border-white/10 bg-gradient-to-b from-white/8 to-white/4 p-5 backdrop-blur-xl">
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                  <svg className="h-3.5 w-3.5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Cost Efficiency
                </div>
                <div className={`mt-3 text-xl font-bold ${expenseRatio === null ? "text-slate-400" : expenseRatio <= 0.7 ? "text-emerald-300" : expenseRatio <= 0.9 ? "text-amber-300" : "text-rose-300"}`}>
                  {expenseRatio === null ? "N/A" : `${((1 - expenseRatio) * 100).toFixed(1)}%`}
                </div>
                <div className="mt-1 text-sm text-slate-400">
                  {expenseRatio === null ? "No revenue to compare" : expenseRatio <= 0.7 ? "Lean & efficient" : expenseRatio <= 0.9 ? "Room to optimize" : "High cost pressure"}
                </div>
                <div className="mt-1 text-[11px] text-slate-500">
                  {expenseRatio === null ? "expense ratio unavailable without revenue" : `${(expenseRatio * 100).toFixed(1)}% of revenue goes to expenses`}
                </div>
              </div>
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
                      onClick={() => {
                        setSelectedAccount(a);
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
              <KpiCard title="Net Profit" numericValue={reProfit} formatValue={formatPKRCompact} />
              <KpiCard title="Long-term Assets" numericValue={reLongTermAssets} formatValue={formatPKRCompact} />
              <KpiCard title="Net Investments" numericValue={reNetInvestments} formatValue={formatPKRCompact} />
              <KpiCard
                title="Retained Earning"
                numericValue={reRetained}
                formatValue={formatPKRCompact}
                highlight={reRetained < 0 ? "bad" : "good"}
              />
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
                          <Cell key={`cell-${i}`} fill={entry.name === "Investments" ? CHART_COLORS.negative : CHART_COLORS.profit} />
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
                    onChange={(e) => {
                      const h = Number(e.target.value) as 6 | 12;
                      setForecastHorizon(h);
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
                  <KpiCard
                    title="Revenue Trend (Avg MoM)"
                    numericValue={fcRevMoM}
                    formatValue={formatPct}
                    highlight={fcRevMoM < 0 ? "bad" : "good"}
                  />
                  <KpiCard
                    title="Opex Trend (Avg MoM)"
                    numericValue={fcExpMoM}
                    formatValue={formatPct}
                    highlight={fcExpMoM > 0 ? "bad" : "good"}
                  />
                  <KpiCard title="Avg Monthly Opex" numericValue={fcAvgOpex} formatValue={formatPKRCompact} />
                  <KpiCard
                    title="Break-even Revenue"
                    numericValue={fcBreakeven}
                    formatValue={formatPKRCompact}
                    highlight={fcMeetsBE ? "good" : "bad"}
                  />
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
                          <Bar dataKey="value" radius={[10, 10, 0, 0]} fill={CHART_COLORS.positive} />
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
                          <Line type="monotone" dataKey="revenue" name="Revenue" stroke={CHART_COLORS.profit} strokeWidth={3} dot={false} />
                          <Line type="monotone" dataKey="opex" name="Opex" stroke={CHART_COLORS.negative} strokeWidth={3} dot={false} />
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

      <style jsx global>{`
        .glass-breathe {
          position: relative;
          isolation: isolate;
        }

        .glass-breathe::after {
          content: "";
          position: absolute;
          inset: 0;
          border-radius: inherit;
          padding: 1px;
          pointer-events: none;
          background: linear-gradient(130deg, rgba(34, 211, 238, 0.22), rgba(255, 255, 255, 0.08), rgba(244, 63, 94, 0.18));
          -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor;
          mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          mask-composite: exclude;
          opacity: 0.4;
          animation: glassBreathe 7s ease-in-out infinite;
        }

        @keyframes glassBreathe {
          0%,
          100% {
            opacity: 0.26;
          }
          50% {
            opacity: 0.46;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .glass-breathe::after {
            animation: none;
          }
        }
      `}</style>
    </div>
  );
}

function Collapse({ show, children }: { show: boolean; children: React.ReactNode }) {
  return (
    <div
      className={[
        "grid transition-[grid-template-rows,opacity] duration-300 ease-in-out",
        show ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
      ].join(" ")}
    >
      <div className="overflow-hidden">{children}</div>
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={[
        "rounded-xl border px-4 py-2 text-sm font-semibold transition duration-200 backdrop-blur-md",
        active
          ? "border-cyan-300/40 bg-cyan-400/15 text-cyan-100 shadow-[0_8px_24px_rgba(6,182,212,0.22)]"
          : "border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10",
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
  prefetch,
  children,
}: {
  active: boolean;
  href: string;
  onActivate?: () => void;
  prefetch?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      onClick={() => onActivate?.()}
      prefetch={prefetch}
      className={[
        "inline-flex items-center rounded-xl border px-4 py-2 text-sm font-semibold transition duration-200",
        active
          ? "border-cyan-300/40 bg-cyan-400/15 text-cyan-100 shadow-[0_8px_24px_rgba(6,182,212,0.22)]"
          : "border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10",
      ].join(" ")}
    >
      {children}
    </Link>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="glass-breathe rounded-2xl border border-white/10 bg-gradient-to-b from-white/10 to-white/5 p-5 shadow-[0_20px_80px_rgba(0,0,0,0.35)] backdrop-blur-xl">
      <div className="mb-3">
        <div className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-100">{title}</div>
      </div>
      {children}
    </div>
  );
}

function ChartCard({
  title,
  children,
  legend,
}: {
  title: string;
  children: React.ReactNode;
  legend: Array<{ label: string; color: string }>;
}) {
  return (
    <div className="glass-breathe rounded-2xl border border-white/10 bg-gradient-to-b from-white/10 to-white/5 p-5 shadow-[0_20px_80px_rgba(0,0,0,0.35)] backdrop-blur-xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-100">{title}</div>
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {legend.map((item, index) => (
            <div key={`${item.label}-${index}`} className="flex items-center gap-1.5 text-[11px] text-slate-300">
              <span className={`h-2.5 w-2.5 rounded-full ${item.color}`} />
              {item.label}
            </div>
          ))}
        </div>
      </div>
      {children}
    </div>
  );
}

function KpiCard({
  title,
  value,
  numericValue,
  formatValue,
  highlight,
  subtext,
}: {
  title: string;
  value?: string;
  numericValue?: number;
  formatValue?: (n: number) => string;
  highlight?: "good" | "bad";
  subtext?: string;
}) {
  const animatedValue = useAnimatedNumber(numericValue ?? 0);
  const resolvedValue =
    typeof numericValue === "number"
      ? formatValue
        ? formatValue(animatedValue)
        : `${Math.round(animatedValue)}`
      : value ?? "—";

  const ring = highlight === "good" ? "border-emerald-300/30" : highlight === "bad" ? "border-rose-300/30" : "border-white/10";

  const glow =
    highlight === "good"
      ? "shadow-[0_16px_45px_rgba(6,182,212,0.18)]"
      : highlight === "bad"
      ? "shadow-[0_16px_45px_rgba(244,63,94,0.18)]"
      : "shadow-[0_20px_80px_rgba(0,0,0,0.35)]";

  const dot = highlight === "good" ? "bg-cyan-300" : highlight === "bad" ? "bg-rose-300" : "bg-slate-300";

  return (
    <div
      className={`glass-breathe group rounded-2xl border ${ring} ${glow} bg-gradient-to-b from-white/10 to-white/5 p-5 backdrop-blur-xl transition hover:shadow-[0_0_0_1px_rgba(255,255,255,0.1),0_16px_45px_rgba(6,182,212,0.15)]`}
    >
      <div className="flex items-center gap-2 text-[12px] uppercase tracking-[0.14em] text-slate-300">
        <span className={`h-2 w-2 rounded-full ${dot}`} />
        {title}
      </div>
      <div className="mt-3 text-[24px] font-semibold tracking-tight text-white">{resolvedValue}</div>
      {subtext ? <div className="mt-1 text-xs text-slate-400">{subtext}</div> : null}
    </div>
  );
}

function LastPointPulseDot({ cx, cy, index, dataLength, color }: any) {
  if (cx == null || cy == null || index !== dataLength - 1) return null;

  return (
    <g>
      <circle cx={cx} cy={cy} r={4.5} fill={color} stroke="rgba(255,255,255,0.8)" strokeWidth={1.5} />
      <circle cx={cx} cy={cy} r={7} fill="none" stroke={color} strokeOpacity={0.45} strokeWidth={1.5}>
        <animate attributeName="r" values="7;12;7" dur="2.4s" repeatCount="indefinite" />
        <animate attributeName="stroke-opacity" values="0.45;0.08;0.45" dur="2.4s" repeatCount="indefinite" />
      </circle>
    </g>
  );
}

function MoneyTooltip({ active, payload, label, pie, single, arApMonthEnd, apAgingBar }: any) {
  if (!active || !payload || payload.length === 0) return null;

  if (pie) {
    const p = payload[0];
    return (
      <div className="rounded-2xl border border-white/10 bg-[#070b1a]/90 px-3.5 py-2.5 text-sm text-slate-100 shadow-[0_18px_40px_rgba(2,6,23,0.65)] backdrop-blur-xl">
        <div className="font-semibold">{p?.name ?? ""}</div>
        <div>{formatPKRCompact(Number(p?.value ?? 0))}</div>
      </div>
    );
  }

  if (apAgingBar) {
    return (
      <div className="rounded-2xl border border-white/10 bg-[#070b1a]/90 px-3.5 py-2.5 text-sm text-slate-100 shadow-[0_18px_40px_rgba(2,6,23,0.65)] backdrop-blur-xl">
        <div className="mb-1 font-semibold">{label}</div>
        {payload.map((p: any) => (
          <div key={p.dataKey} className="flex items-center justify-between gap-4">
            <span className="text-slate-300">{p.name}</span>
            <span className="font-semibold">{formatPKRCompact(Number(p.value ?? 0))}</span>
          </div>
        ))}
      </div>
    );
  }

  if (arApMonthEnd) {
    const row = payload?.[0]?.payload ?? {};
    const asOf = String(row?.asOf ?? "");
    const payables = Number(row?.payables ?? 0);
    const receivables = Number(row?.receivables ?? 0);

    return (
      <div className="rounded-2xl border border-white/10 bg-[#070b1a]/90 px-3.5 py-2.5 text-sm text-slate-100 shadow-[0_18px_40px_rgba(2,6,23,0.65)] backdrop-blur-xl">
        <div className="font-semibold">As of {asOf || label}</div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-slate-300">Payables PKR</span>
          <span className="font-semibold">{formatPKRCompact(payables)}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-slate-300">Receivables PKR</span>
          <span className="font-semibold">{formatPKRCompact(receivables)}</span>
        </div>
      </div>
    );
  }

  if (single) {
    const p = payload[0];
    return (
      <div className="rounded-2xl border border-white/10 bg-[#070b1a]/90 px-3.5 py-2.5 text-sm text-slate-100 shadow-[0_18px_40px_rgba(2,6,23,0.65)] backdrop-blur-xl">
        <div className="font-semibold">{label}</div>
        <div>{formatPKRCompact(Number(p?.value ?? 0))}</div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-[#070b1a]/90 px-3.5 py-2.5 text-sm text-slate-100 shadow-[0_18px_40px_rgba(2,6,23,0.65)] backdrop-blur-xl">
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
