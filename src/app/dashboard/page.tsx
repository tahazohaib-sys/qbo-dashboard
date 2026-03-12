// src/app/dashboard/page.tsx
"use client";

import Image from "next/image";
import Link from "next/link";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
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
    stratgerContribution?: number;
    buracContribution?: number;
    contribution: number;
    totalInvestments: number;
    netInvestments: number;

    period?: {
      buraq: number;
      convoi: number;
      stratger: number;
      stratgerContribution?: number;
      buracContribution?: number;
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

  const [err, setErr] = useState<string>("");
  const [lastUpdated, setLastUpdated] = useState("--:--:--");
  const [autoRefresh, setAutoRefresh] = useState(false);
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fetchAllRef = useRef<() => Promise<void>>(async () => {});

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

  async function fetchArAp(asOfYmd: string) {
    const res = await fetch(`/api/qbo/ar-ap?asOf=${encodeURIComponent(asOfYmd)}`, { cache: "no-store" });
    const json: ArApResp = await res.json();
    if (!json.ok) throw new Error(json.error || "AR/AP API failed");
    return json;
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
    await reloadArApCustom(asOfYmd);
  }

  async function deleteArApCustom(id: string, asOfYmd: string) {
    setArApCustomErr("");
    await fetch(`/api/custom-fields/ar-ap?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    await reloadArApCustom(asOfYmd);
  }

    async function loadArApAndMonthly(
    endYmd: string,
    fy: number,
    fm: number,
    ty: number,
    tm: number,
    accountingMethod: "Accrual" | "Cash"
  ) {
    setArApLoading(true);
    try {
      // ✅ ONE call only (backend returns month-end Balance Sheet monthlySeries)
      const res = await fetch(
        `
        /api/qbo/ar-ap?asOf=${encodeURIComponent(endYmd)}&months=${monthSpanInclusive(fy, fm, ty, tm)}&fromYear=${fy}&fromMonth=${fm}&toYear=${ty}&toMonth=${tm}&accounting_method=${encodeURIComponent(accountingMethod)}
      `.replace(/\s+/g, ""),
        { cache: "no-store" }
      );

      const one: any = await res.json();
      if (!one?.ok) throw new Error(one?.error || "AR/AP API failed");

      setArAp(one);

      // ---------- Build monthly rows (from backend series) ----------
      const series: Array<{ asOf: string; month: string; payables: number; receivables: number; error?: boolean }> =
        (one.monthlySeries ?? []).map((r: any) => ({
          asOf: r.asOf ?? `${r.month}-01`,
          month: r.month,
          payables: Number(r.payables ?? 0),
          receivables: Number(r.receivables ?? 0),
          error: Boolean(r.error),
        }));

      // ✅ Keep chart strictly on Balance Sheet month-end snapshots (no manual adjustment overlays)
      setMonthlyArAp(series);
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
      loadArApAndMonthly(end, fy, fm, ty, tm, method).catch(() => {});

      const dashUrl =
        `/api/dashboard?start_date=${encodeURIComponent(start)}` +
        `&end_date=${encodeURIComponent(end)}` +
        `&accounting_method=${encodeURIComponent(method)}`;

      const dashRes = await fetch(dashUrl, { cache: "no-store" });
      const dashJson: DashboardResp = await dashRes.json();
      if (!dashJson.ok) throw new Error(dashJson.error || "Dashboard API failed");
      setData(dashJson);

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

      setLastUpdated(
        new Date().toLocaleTimeString("en-GB", {
          hour12: false,
        })
      );
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  async function fetchTransactions(accountId: string) {
    setTxnLoading(true);
    try {
      const res = await fetch(`/api/qbo/account-transactions?accountId=${encodeURIComponent(accountId)}&limit=5`, {
        cache: "no-store",
      });
      const json: AccountTxnsResp = await res.json();
      setTxns(json.ok ? json : null);
    } finally {
      setTxnLoading(false);
    }
  }

  useEffect(() => {
    fetchAllRef.current = fetchAll;
  });

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        fetchAllRef.current();
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
        { label: "Strategr AI Contribution Received", amount: reInvestments.stratgerContribution ?? reInvestments.contribution ?? 0 },
        { label: "Burac AI Contribution Received", amount: reInvestments.buracContribution ?? 0 },
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
                  {/* ✅ KPIs: show totals + include manual adjustments */}
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                    <KpiCard title="Total Payables" numericValue={payablesAdjTotal} formatValue={formatPKRCompact} highlight="bad" />
                    <KpiCard title="Total Receivables" numericValue={receivablesAdjTotal} formatValue={formatPKRCompact} highlight="good" />
                    <KpiCard
                      title="Net (Receivables - Payables)"
                      numericValue={receivablesAdjTotal - payablesAdjTotal}
                      formatValue={formatPKRCompact}
                      highlight={receivablesAdjTotal - payablesAdjTotal >= 0 ? "good" : "bad"}
                    />
                    <KpiCard
                      title="AR/AP Gap"
                      numericValue={Math.abs(payablesAdjTotal - receivablesAdjTotal)}
                      formatValue={formatPKRCompact}
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
                                { name: "Payables", value: payablesAdjTotal },
                                { name: "Receivables", value: receivablesAdjTotal },
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
                            <XAxis dataKey="month" tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={TICK_LINE} />
                            <YAxis tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={TICK_LINE} tickFormatter={fmtAxisPKR} />
                            <Tooltip content={<MoneyTooltip arApMonthEnd />} />
                            <Legend />
                            <Line
                              type="monotone"
                              dataKey="payables"
                              name="Total Payables"
                              stroke={CHART_COLORS.negative}
                              strokeWidth={3}
                              dot={(props) => <LastPointPulseDot {...props} dataLength={monthlyArAp.length} color={CHART_COLORS.negative} />}
                              activeDot={{ r: 5 }}
                              style={{ filter: "drop-shadow(0 0 8px rgba(248,113,113,0.2))" }}
                            />
                            <Line
                              type="monotone"
                              dataKey="receivables"
                              name="Total Receivables"
                              stroke={CHART_COLORS.profit}
                              strokeWidth={3}
                              dot={(props) => <LastPointPulseDot {...props} dataLength={monthlyArAp.length} color={CHART_COLORS.profit} />}
                              activeDot={{ r: 5 }}
                              style={{ filter: "drop-shadow(0 0 8px rgba(52,211,153,0.2))" }}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </Panel>
                  </div>

                  <div className="flex justify-end mb-3">
                    <button
                      onClick={() => setShowManualAdjustments((p) => !p)}
                      className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs hover:bg-white/10"
                    >
                      {showManualAdjustments ? "Hide Manual Adjustments" : "Show Manual Adjustments"}
                    </button>
                  </div>

                  {/* ✅ Manual Adjustments panel */}
                  <div className="mt-4">
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
                                  <div className="mt-1 text-[11px] text-slate-400">Tip: you can enter negative value if you want to reduce totals.</div>
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
                                          <td className="py-2 text-right font-semibold">{formatPKRCompact(Number(r.amount ?? 0))}</td>
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
                                {formatPKRCompact(Number((arAp.payables.current as any).vendorBills ?? arAp.payables.current.accountsPayable ?? 0))}
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

                            {/* manual payables rows */}
                            {arApCustomPayables.length
                              ? arApCustomPayables.map((r) => (
                                  <tr key={r.id} className="border-t border-white/10">
                                    <td className="py-2 pr-3 text-slate-200">{r.label}</td>
                                    <td className="py-2 text-right font-semibold">{formatPKRCompact(Number(r.amount ?? 0))}</td>
                                  </tr>
                                ))
                              : null}

                            <tr className="border-t-2 border-white/15 bg-rose-500/10">
                              <td className="py-2 pr-3 font-semibold text-slate-100">Total Payables</td>
                              <td className="py-2 text-right font-semibold text-slate-100">{formatPKRCompact(payablesAdjTotal)}</td>
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

                            {/* manual receivables rows */}
                            {arApCustomReceivables.length
                              ? arApCustomReceivables.map((r) => (
                                  <tr key={r.id} className="border-t border-white/10">
                                    <td className="py-2 pr-3 text-slate-200">{r.label}</td>
                                    <td className="py-2 text-right font-semibold">{formatPKRCompact(Number(r.amount ?? 0))}</td>
                                  </tr>
                                ))
                              : null}

                            <tr className="border-t-2 border-white/15 bg-emerald-500/10">
                              <td className="py-2 pr-3 font-semibold text-slate-100">Total Receivables</td>
                              <td className="py-2 text-right font-semibold text-slate-100">{formatPKRCompact(receivablesAdjTotal)}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </Panel>
                  </div>

                  <div className="mt-4">
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
            <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <KpiCard
                title="Total Income"
                numericValue={kpi.revenue}
                formatValue={formatPKRCompact}
                subtext="Year-to-date inflows"
                highlight="good"
              />
              <KpiCard
                title="Total Expenses"
                numericValue={kpi.expenses}
                formatValue={formatPKRCompact}
                subtext="Year-to-date outflows"
                highlight="bad"
              />
              <KpiCard
                title="Net Profit (Loss)"
                numericValue={kpi.profit}
                formatValue={formatPKRCompact}
                highlight={kpi.profit < 0 ? "bad" : "good"}
              />
              <KpiCard title="Months" numericValue={series.length} formatValue={(n) => `${Math.round(n)}`} subtext="Period coverage" />
            </div>

            <div className="mt-8">
              <Panel title="Financial Insight">
                <div className="relative rounded-2xl border border-white/15 bg-gradient-to-br from-slate-900/85 via-[#10243f]/70 to-[#130f2f]/80 p-7 shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_24px_64px_rgba(2,6,23,0.5)] backdrop-blur-xl before:absolute before:inset-0 before:rounded-2xl before:p-px before:[background:linear-gradient(120deg,rgba(34,211,238,0.5),rgba(99,102,241,0.15),rgba(244,63,94,0.35))] before:[mask:linear-gradient(#fff_0_0)_content-box,linear-gradient(#fff_0_0)] before:[mask-composite:xor] md:p-10">
                  <div className="mx-auto max-w-4xl text-center">
                    <div className={`mx-auto mb-2 inline-block rounded-3xl px-6 py-2 text-6xl font-extrabold tracking-tight md:text-8xl ${marginTone} ${marginGlow}`}>
                      {formatPct(netMargin)}
                    </div>
                    <div className="text-[12px] font-semibold uppercase tracking-[0.24em] text-slate-300 md:text-[13px]">{financialLabel.toUpperCase()}</div>

                    <p className="mx-auto mt-5 max-w-3xl text-sm leading-relaxed text-slate-200/95 md:text-base">{financialSummary}</p>

                    <div className="mt-8 grid grid-cols-1 gap-2 border-t border-white/10 pt-4 text-xs text-slate-400 sm:grid-cols-3 md:text-sm">
                      <div className="sm:border-r sm:border-white/10">Revenue: {formatPKRMillions(kpi.revenue)}</div>
                      <div className="sm:border-r sm:border-white/10">Expenses: {formatPKRMillions(kpi.expenses)}</div>
                      <div>Net: {formatPKRMillions(kpi.profit, true)}</div>
                    </div>
                  </div>
                </div>
              </Panel>
            </div>

            <div className="mt-8 grid grid-cols-1 gap-5 lg:grid-cols-2">
              <ChartCard title="Income vs Expenses" legend={[{ label: "Income", color: "bg-cyan-300" }, { label: "Expenses", color: "bg-rose-300" }]}>
                <div className="h-[320px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={series} margin={{ top: 10, right: 12, left: 6, bottom: 6 }}>
                      <defs>
                        <linearGradient id="incomeBars" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#67e8f9" stopOpacity={0.95} />
                          <stop offset="100%" stopColor="#0891b2" stopOpacity={0.65} />
                        </linearGradient>
                        <linearGradient id="expenseBars" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#fda4af" stopOpacity={0.92} />
                          <stop offset="100%" stopColor="#be123c" stopOpacity={0.58} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="month" tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={TICK_LINE} />
                      <YAxis tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={TICK_LINE} tickFormatter={fmtAxisPKR} />
                      <Tooltip content={<MoneyTooltip />} cursor={{ fill: "rgba(255,255,255,0.05)" }} />
                      <Bar
                        dataKey="revenue"
                        name="Income"
                        fill="url(#incomeBars)"
                        radius={[10, 10, 0, 0]}
                        style={{ filter: "drop-shadow(0 0 8px rgba(103,232,249,0.2))" }}
                      />
                      <Bar
                        dataKey="expenses"
                        name="Expenses"
                        fill="url(#expenseBars)"
                        radius={[10, 10, 0, 0]}
                        style={{ filter: "drop-shadow(0 0 8px rgba(251,113,133,0.18))" }}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </ChartCard>

              <ChartCard title="Net Profit Trend" legend={[{ label: "Net Profit", color: "bg-emerald-300" }]}>
                <div className="h-[320px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={series} margin={{ top: 10, right: 12, left: 6, bottom: 6 }}>
                      <defs>
                        <linearGradient id="netProfitLine" x1="0" y1="0" x2="1" y2="0">
                          <stop offset="0%" stopColor="#5eead4" />
                          <stop offset="100%" stopColor="#34d399" />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="month" tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={TICK_LINE} />
                      <YAxis tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={TICK_LINE} tickFormatter={fmtAxisPKR} />
                      <Tooltip content={<MoneyTooltip />} cursor={{ stroke: "rgba(255,255,255,0.22)", strokeDasharray: "4 4" }} />
                      <Line
                        type="monotone"
                        dataKey="profit"
                        name="Net Profit"
                        stroke="url(#netProfitLine)"
                        strokeWidth={3}
                        dot={(props) => <LastPointPulseDot {...props} dataLength={series.length} color="#5eead4" />}
                        activeDot={{ r: 5.5, fill: "#5eead4", stroke: "#ccfbf1", strokeWidth: 2 }}
                        style={{ filter: "drop-shadow(0 0 10px rgba(52,211,153,0.28))" }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </ChartCard>
            </div>

            <div className="mt-6">
              <ChartCard
                title="Expense Composition"
                legend={expenseComposition.map((entry, idx) => ({
                  label: entry.name,
                  color: DONUT_COLOR_CLASSES[idx % DONUT_COLOR_CLASSES.length],
                }))}
              >
                <div className="h-[340px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Tooltip content={<MoneyTooltip pie />} />
                      <Pie
                        data={expenseComposition}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={78}
                        outerRadius={116}
                        paddingAngle={2}
                        cornerRadius={6}
                      >
                        {expenseComposition.map((_, i) => (
                          <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
                        ))}
                      </Pie>
                      <text x="50%" y="46%" textAnchor="middle" className="fill-slate-300 text-[11px] uppercase tracking-[0.18em]">
                        Total
                      </text>
                      <text x="50%" y="54%" textAnchor="middle" className="fill-white text-sm font-semibold md:text-base">
                        {formatPKRCompact(expenseTotal)}
                      </text>
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </ChartCard>
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
          {legend.map((item) => (
            <div key={item.label} className="flex items-center gap-1.5 text-[11px] text-slate-300">
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

function MoneyTooltip({ active, payload, label, pie, single, arApMonthEnd }: any) {
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
