"use client";

import Image from "next/image";

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

/**
 * ✅ Updated to match your new API shape (backward compatible fallback supported in UI logic).
 */
type RetainedResp = {
  ok: boolean;
  currency: string;
  start_date?: string;
  end_date?: string;
  prior_as_of_date?: string;
  accounting_method?: "Accrual" | "Cash";

  // Profit
  netProfit?: number;

  // Long-term assets movement (end snapshot - prior snapshot)
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

  // old/fallback fields (if you still hit older responses)
  profit?: number;
  longTermAssetsAdditions?: number;
  totalInvestments?: number;
  contributionReceived?: number;
  netInvestments?: number;
  fixedAssetAdditions?: Array<{ label: string; amount: number }>;
  investmentsByEntity?: Array<{ label: string; amount: number }>;

  error?: string;
};

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

type TabKey = "pnl" | "cash" | "retained";

function displayTxnAmount(
  txn: AccountTxnsResp["transactions"][number],
  homeCurrency: string | null | undefined
) {
  if (txn.amountForeign != null && txn.foreignCurrency) {
    return {
      main: formatMoneyByCurrency(txn.foreignCurrency, txn.amountForeign),
      sub: txn.amountHome != null
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

  const [err, setErr] = useState<string>("");

  function buildStartEnd(fy: number, fm: number, ty: number, tm: number) {
    const start = `${fy}-${String(fm).padStart(2, "0")}-01`;
    const endDate = new Date(ty, tm, 0);
    const end = `${ty}-${String(tm).padStart(2, "0")}-${String(endDate.getDate()).padStart(2, "0")}`;
    return { start, end };
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

      const dashUrl =
        `/api/dashboard?start_date=${encodeURIComponent(start)}` +
        `&end_date=${encodeURIComponent(end)}` +
        `&accounting_method=${encodeURIComponent(method)}`;

      const dashRes = await fetch(dashUrl, { cache: "no-store" });
      const dashJson: DashboardResp = await dashRes.json();
      if (!dashJson.ok) throw new Error(dashJson.error || "Dashboard API failed");
      setData(dashJson);

      const pnlUrl =
        `/api/qbo/pnl-table?start_date=${encodeURIComponent(start)}` +
        `&end_date=${encodeURIComponent(end)}` +
        `&accounting_method=${encodeURIComponent(method)}`;

      const pnlRes = await fetch(pnlUrl, { cache: "no-store" });
      const pnlJson: PnlTableResp = await pnlRes.json();
      if (!pnlJson.ok) throw new Error(pnlJson.error || "P&L table API failed");

      // IMPORTANT: include Salary Expenses subtree too so Salary shows in donut
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

      // Retained earning tab data
      setRetainedLoading(true);
      try {
        const reRes = await fetch(
          `/api/qbo/retained-earning?start_date=${encodeURIComponent(start)}&end_date=${encodeURIComponent(end)}&accounting_method=${encodeURIComponent(
            method
          )}`,
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

  const accounts =
  (cashBanks?.accounts ?? []).filter(
    (a) => Math.abs(a.currentBalance ?? 0) > 0
  );

  /* ---------------- retained normalized values ---------------- */

  const reOk = !!retained?.ok;

  const reProfit =
    (retained?.netProfit ?? retained?.profit ?? 0) || 0;

  const reLongTermAssets =
    (retained?.longTermAssetsMovement ??
      retained?.longTermAssetsAdditions ??
      0) || 0;

  const reInvestments = retained?.investments ?? null;

  const reTotalInvestments =
    (reInvestments?.totalInvestments ??
      retained?.totalInvestments ??
      0) || 0;

  const reContribution =
    (reInvestments?.contribution ??
      retained?.contributionReceived ??
      0) || 0;

  const reNetInvestments =
    (reInvestments?.netInvestments ??
      retained?.netInvestments ??
      0) || 0;

  const reRetained =
    (retained?.retainedEarning ?? 0) || 0;

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

    // fallback donut (keep positive values only so donut renders nicely)
    const parts = [
      { name: "Long-term Assets", value: Math.max(0, reLongTermAssets) },
      { name: "Net Investments", value: Math.max(0, reNetInvestments) },
      { name: "Retained Earning", value: Math.max(0, reRetained) },
    ].filter((x) => x.value > 0);

    return parts;
  }, [reOk, retained?.charts?.retainedDonut, reLongTermAssets, reNetInvestments, reRetained]);

  const ltDetail = useMemo(() => {
    // Prefer new API detail
    if (retained?.longTermAssets?.detail?.length) return retained.longTermAssets.detail;

    // Fallback (old API field)
    if (retained?.fixedAssetAdditions?.length) {
      return retained.fixedAssetAdditions.map((x) => ({
        label: x.label,
        end: x.amount, // treat as movement
        prior: 0,
        movement: x.amount,
      }));
    }
    return [];
  }, [retained]);

  const invDetail = useMemo(() => {
    // Prefer new investments object
    if (reInvestments) {
      return [
        { label: "Buraq AI Investment", amount: reInvestments.buraq ?? 0 },
        { label: "Convoi AI Investment", amount: reInvestments.convoi ?? 0 },
        { label: "Stratger AI Investment", amount: reInvestments.stratger ?? 0 },
        { label: "Strategr AI Contribution Received", amount: reInvestments.contribution ?? 0 },
      ];
    }

    // Fallback old investmentsByEntity
    if (retained?.investmentsByEntity?.length) return retained.investmentsByEntity;
    return [];
  }, [reInvestments, retained?.investmentsByEntity]);

  return (
    <div className="min-h-screen bg-[radial-gradient(1200px_900px_at_15%_10%,rgba(16,185,129,0.12),transparent_55%),radial-gradient(1200px_900px_at_85%_20%,rgba(34,211,238,0.10),transparent_55%),radial-gradient(1000px_700px_at_55%_95%,rgba(99,102,241,0.10),transparent_55%),linear-gradient(180deg,#050814_0%,#070b1a_45%,#050814_100%)] text-slate-100">
      <div className="mx-auto max-w-7xl px-5 py-8">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div className="flex items-center gap-4">
  {/* Logo */}
  <div className="relative h-12 w-12 shrink-0">
    <Image
      src="/logo.png"
      alt="RTC League Logo"
      fill
      className="object-contain"
      priority
    />
  </div>

  {/* Title */}
  <div>
    <h1 className="text-3xl font-semibold tracking-tight">
      Finance Dashboard
    </h1>
    <p className="mt-1 text-sm text-slate-300">
      CFO view: P&amp;L analytics + bank/cash (native currency) + latest transactions + retained earning.
    </p>
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

        <div className="mt-6 flex gap-2">
          <TabButton active={tab === "pnl"} onClick={() => setTab("pnl")}>
            Profit & Loss
          </TabButton>
          <TabButton active={tab === "cash"} onClick={() => setTab("cash")}>
            Bank & Cash Balances
          </TabButton>
          <TabButton active={tab === "retained"} onClick={() => setTab("retained")}>
            Retained Earning
          </TabButton>
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
            <div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
              {err}
            </div>
          ) : null}
        </div>

        {/* PNL TAB */}
        {tab === "pnl" ? (
          <>
            <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-4">
              <KpiCard title="Total Income" value={formatPKRCompact(kpi.revenue)} sub="Selected period" />
              <KpiCard title="Total Expenses" value={formatPKRCompact(kpi.expenses)} sub="Selected period" />
              <KpiCard
                title="Net Profit (Loss)"
                value={formatPKRCompact(kpi.profit)}
                sub={`Net margin: ${formatPct(margin)}`}
                highlight={kpi.profit < 0 ? "bad" : "good"}
              />
              <KpiCard title="Months" value={`${series.length}`} sub="In selected range" />
            </div>

            <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Panel title="Income vs Expenses" subtitle="Monthly (selected range)">
                <div className="h-[320px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={series} margin={{ top: 10, right: 12, left: 6, bottom: 6 }}>
                      <CartesianGrid {...GRID} />
                      <XAxis dataKey="month" tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={TICK_LINE} />
                      <YAxis tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={TICK_LINE} />
                      <Tooltip content={<MoneyTooltip />} />
                      <Legend />
                      <Bar dataKey="revenue" name="Income" fill="#22c55e" radius={[8, 8, 0, 0]} />   // Green
                      <Bar dataKey="expenses" name="Expenses" fill="#ef4444" radius={[8, 8, 0, 0]} /> // Red
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Panel>

              <Panel title="Net Profit (Loss)" subtitle="Monthly trend (line)">
                <div className="h-[320px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={series} margin={{ top: 10, right: 12, left: 6, bottom: 6 }}>
                      <CartesianGrid {...GRID} />
                      <XAxis dataKey="month" tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={TICK_LINE} />
                      <YAxis tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={TICK_LINE} />
                      <Tooltip content={<MoneyTooltip />} />
                      <Legend />
                      <Line type="monotone" dataKey="profit" name="Net Profit" stroke="#34d399" strokeWidth={3} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </Panel>
            </div>

            <div className="mt-4">
              <Panel title="Expense Composition" subtitle="Top accounts (Expenses + Other Expenses)">
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
                <div className="text-xs text-slate-300">Click a card to view latest 5 transactions.</div>
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
                    <div>
                      <div className="text-sm font-semibold">Latest 5 transactions — {selectedAccount.name}</div>
                      <div className="text-xs text-slate-300">Showing account currency when available (else PKR equivalent).</div>
                    </div>

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
                              Loading transactions...
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
              {/* ✅ removed subtitle lines by NOT passing sub */}
              <KpiCard title="Net Profit" value={formatPKRCompact(reProfit)} />
              <KpiCard title="Long-term Assets" value={formatPKRCompact(reLongTermAssets)} />
              <KpiCard title="Net Investments" value={formatPKRCompact(reNetInvestments)} />
              <KpiCard
                title="Retained Earning"
                value={formatPKRCompact(reRetained)}
                highlight={reRetained < 0 ? "bad" : "good"}
              />
            </div>

            <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Panel title="Investment Summary" subtitle="Investments vs Contribution Received">
                <div className="h-[320px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={investmentBarData} margin={{ top: 10, right: 12, left: 6, bottom: 6 }}>
                      <CartesianGrid {...GRID} />
                      <XAxis dataKey="name" tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={TICK_LINE} />
                      <YAxis tick={AXIS_TICK} axisLine={AXIS_LINE} tickLine={TICK_LINE} />
                      <Tooltip content={<MoneyTooltip single />} />
                      <Bar dataKey="value" radius={[10, 10, 0, 0]}>
                     {investmentBarData.map((entry, i) => (
                     <Cell
                     key={`cell-${i}`}
                    fill={entry.name === "Investments" ? "#ef4444" : "#22c55e"}
                    />
                    ))}
                   </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="mt-3 text-sm">
                  <div className="flex items-center justify-between text-slate-300">
                    <span>Total Investments</span>
                    <span className="font-semibold text-slate-100">{formatPKRCompact(reTotalInvestments)}</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-slate-300">
                    <span>Contribution Received</span>
                    <span className="font-semibold text-slate-100">{formatPKRCompact(reContribution)}</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-slate-300">
                    <span>Net Investments</span>
                    <span className="font-semibold text-slate-100">{formatPKRCompact(reNetInvestments)}</span>
                  </div>
                </div>
              </Panel>

              <Panel title="Retained Earning Breakdown" subtitle="Where profit is consumed / retained">
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

            {/* ✅ NEW: Net Investments Detail */}
            <div className="mt-4 grid grid-cols-1 gap-4">
            <Panel title="Net Investments Detail" subtitle="Period movement (end snapshot − prior snapshot)">
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
                        <tr className="border-t border-white/10">
                          <td className="py-2 pr-3 font-semibold">Total Investments</td>
                          <td className="py-2 text-right font-semibold">{formatPKRCompact(reTotalInvestments)}</td>
                        </tr>
                        <tr className="border-t border-white/10">
                          <td className="py-2 pr-3 font-semibold">Contribution Received</td>
                          <td className="py-2 text-right font-semibold">{formatPKRCompact(reContribution)}</td>
                        </tr>
                        <tr className="border-t border-white/10">
                          <td className="py-2 pr-3 font-semibold">Net Investments</td>
                          <td className="py-2 text-right font-semibold">{formatPKRCompact(reNetInvestments)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="py-3 text-slate-300">No investment movements found in selected period.</div>
                )}
              </Panel>

              </div>

            {/* ✅ Long-term Assets Detail table */}
            <div className="mt-4">
              <Panel title="Long-term Assets Detail" subtitle="Fixed asset movement in selected period (End − Before Start)">
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
                        <tr className="border-t border-white/10">
                          <td className="py-2 pr-3 font-semibold">Total Movement</td>
                          <td className="py-2 text-right"></td>
                          <td className="py-2 text-right"></td>
                          <td className="py-2 text-right font-semibold">{formatPKRCompact(reLongTermAssets)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="py-3 text-slate-300">No fixed asset movement found in selected period.</div>
                )}
              </Panel>
            </div>
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

function Panel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-[0_20px_80px_rgba(0,0,0,0.35)]">
      <div className="mb-3">
        <div className="text-sm font-semibold">{title}</div>
        {subtitle ? <div className="text-xs text-slate-300">{subtitle}</div> : null}
      </div>
      {children}
    </div>
  );
}

function KpiCard({
  title,
  value,
  sub,
  highlight,
}: {
  title: string;
  value: string;
  sub?: string;
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
      {sub ? <div className="mt-1 text-xs text-slate-300">{sub}</div> : null}
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
