// src/app/api/ai/insights/route.ts
import { NextResponse } from "next/server";
import OpenAI from "openai";

export const dynamic = "force-dynamic";

type DashboardResp = {
  ok: boolean;
  companyName: string;
  currency: string;
  asOf: string;
  accounting_method: "Accrual" | "Cash";
  range: { start_date: string; end_date: string };
  series: Array<{ month: string; revenue: number; expenses: number; profit: number }>;
  kpis: {
    mtd: { revenue: number; expenses: number; profit: number };
    ytd: { revenue: number; expenses: number; profit: number };
  };
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

type AiInsights = {
  ok: boolean;
  meta: {
    companyName: string;
    currency: string;
    start_date: string;
    end_date: string;
    accounting_method: "Accrual" | "Cash";
    generated_at: string;
    source: "openai" | "fallback";
  };
  summary: string;
  highlights: string[];
  risks: string[];
  actions: string[];
  notes: string[];
  error?: string;
};

function safeJsonParse<T>(s: string): T | null {
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

function formatPKR0(n: number) {
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  return `${sign}Rs ${new Intl.NumberFormat("en-PK", { maximumFractionDigits: 0 }).format(abs)}`;
}

function pct(n: number) {
  if (!Number.isFinite(n)) return "0%";
  return `${(n * 100).toFixed(1)}%`;
}

function pickTopExpenses(pnlRows: PnlRow[], limit = 8) {
  const expenseRows = pnlRows.filter((r) => {
    if (r.rowType !== "Data") return false;
    const p = r.path || "";
    return p.startsWith("P&L > Expenses") || p.startsWith("P&L > Other Expenses");
  });

  const map = new Map<string, number>();
  for (const r of expenseRows) map.set(r.label, (map.get(r.label) ?? 0) + (r.amount ?? 0));

  return Array.from(map.entries())
    .map(([label, amount]) => ({ label, amount }))
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
    .slice(0, limit);
}

function extractOutputText(resp: any): string {
  if (typeof resp?.output_text === "string" && resp.output_text.trim()) return resp.output_text.trim();

  const out = resp?.output;
  if (!Array.isArray(out)) return "";

  const chunks: string[] = [];
  for (const item of out) {
    const content = item?.content;
    if (!Array.isArray(content)) continue;
    for (const c of content) {
      if (typeof c?.text === "string" && c.text.trim()) chunks.push(c.text.trim());
      if (c?.type === "output_text" && typeof c?.text === "string" && c.text.trim()) chunks.push(c.text.trim());
    }
  }
  return chunks.join("\n").trim();
}

function buildFallbackInsights(args: {
  dash: DashboardResp;
  pnl: PnlTableResp;
  cash: CashBanksResp;
}): Omit<AiInsights, "meta"> {
  const { dash, pnl, cash } = args;

  const kpi = dash?.kpis?.ytd ?? { revenue: 0, expenses: 0, profit: 0 };
  const revenue = Number(kpi.revenue ?? 0);
  const expenses = Number(kpi.expenses ?? 0);
  const profit = Number(kpi.profit ?? 0);
  const margin = revenue ? profit / revenue : 0;

  const months = dash.series?.length ?? 0;
  const last = months ? dash.series[months - 1] : { revenue: 0, expenses: 0, profit: 0 };
  const prev = months >= 2 ? dash.series[months - 2] : null;

  const revMoM = prev?.revenue ? (last.revenue - prev.revenue) / Math.abs(prev.revenue) : null;
  const expMoM = prev?.expenses ? (last.expenses - prev.expenses) / Math.abs(prev.expenses) : null;

  const top = pickTopExpenses(pnl.rows, 6);

  const highlights: string[] = [];
  const risks: string[] = [];
  const actions: string[] = [];
  const notes: string[] = [];

  highlights.push(`Selected period totals: Revenue ${formatPKR0(revenue)}, Expenses ${formatPKR0(expenses)}, Net ${formatPKR0(profit)}.`);
  highlights.push(`Net margin: ${pct(margin)} across ${months} month(s).`);

  if (revMoM != null) highlights.push(`Revenue MoM (latest vs prior): ${pct(revMoM)}.`);
  if (expMoM != null) highlights.push(`Expenses MoM (latest vs prior): ${pct(expMoM)}.`);

  if (top.length) {
    const topLine = top
      .slice(0, 3)
      .map((x) => `${x.label} (${formatPKR0(x.amount)})`)
      .join(", ");
    highlights.push(`Top expense drivers: ${topLine}.`);
  }

  const totalsByCurrency = cash.totalsByCurrency ?? {};
  const currencies = Object.keys(totalsByCurrency);
  if (currencies.length) {
    const cashLine = currencies
      .sort()
      .map((c) => `${c} ${new Intl.NumberFormat("en", { maximumFractionDigits: c === "PKR" ? 0 : 2 }).format(totalsByCurrency[c])}`)
      .join(" • ");
    highlights.push(`Cash & bank totals by currency: ${cashLine}.`);
  }

  if (revenue <= 0 && expenses > 0) {
    risks.push("Revenue is zero/blank for the selected period while expenses exist — verify income posting dates, filters, or mapping of income accounts.");
  }
  if (profit < 0) {
    risks.push(`Net loss in selected period (${formatPKR0(profit)}). Focus on the largest expense lines and short-term cost controls.`);
  }
  if (expMoM != null && expMoM > 0.05) {
    risks.push(`Expenses increased materially MoM (${pct(expMoM)}). Investigate variance vs prior month.`);
  }

  actions.push("Validate income account mapping in QBO Profit & Loss (Income section totals) and confirm the selected date range covers invoices/sales receipts.");
  if (top.length) actions.push(`Review top expense accounts first: ${top.map((x) => x.label).slice(0, 4).join(", ")}.`);
  actions.push("Implement a monthly variance review (MoM) for revenue, payroll, rent, and major operating lines.");
  actions.push("Track cash position per currency and decide if/when to convert to PKR for payroll/opex planning.");

  notes.push("AI provider quota is currently unavailable, so these insights are generated via rule-based logic (no external AI).");
  notes.push("Once billing is active, the dashboard will switch back to AI-generated narrative automatically.");

  const summary =
    profit < 0
      ? `Selected period shows a net loss of ${formatPKR0(profit)} with expenses of ${formatPKR0(expenses)} and revenue of ${formatPKR0(
          revenue
        )}. Prioritize fixing revenue capture (if missing) and reducing top operating costs.`
      : `Selected period shows net profit of ${formatPKR0(profit)} on revenue of ${formatPKR0(revenue)} (margin ${pct(
          margin
        )}). Maintain cost discipline and monitor MoM trends.`;

  return { ok: true, summary, highlights, risks, actions, notes };
}

export async function GET(req: Request) {
  const url = new URL(req.url);

  const start_date = url.searchParams.get("start_date") ?? "";
  const end_date = url.searchParams.get("end_date") ?? "";
  const accounting_method =
    (url.searchParams.get("accounting_method") as "Accrual" | "Cash") ?? "Accrual";

  const origin = url.origin;

  try {
    // --- Fetch internal dashboard data first (always needed) ---
    const dashUrl =
      `${origin}/api/dashboard?start_date=${encodeURIComponent(start_date)}` +
      `&end_date=${encodeURIComponent(end_date)}` +
      `&accounting_method=${encodeURIComponent(accounting_method)}`;

    const pnlUrl =
      `${origin}/api/qbo/pnl-table?start_date=${encodeURIComponent(start_date)}` +
      `&end_date=${encodeURIComponent(end_date)}` +
      `&accounting_method=${encodeURIComponent(accounting_method)}`;

    const cashUrl = `${origin}/api/qbo/cash-banks?includeZero=true`;

    const [dashRes, pnlRes, cashRes] = await Promise.all([
      fetch(dashUrl, { cache: "no-store" }),
      fetch(pnlUrl, { cache: "no-store" }),
      fetch(cashUrl, { cache: "no-store" }),
    ]);

    const dashText = await dashRes.text();
    const pnlText = await pnlRes.text();
    const cashText = await cashRes.text();

    const dash = safeJsonParse<DashboardResp>(dashText);
    const pnl = safeJsonParse<PnlTableResp>(pnlText);
    const cash = safeJsonParse<CashBanksResp>(cashText);

    if (!dash?.ok) throw new Error(dash?.error || `Dashboard API failed (${dashRes.status})`);
    if (!pnl?.ok) throw new Error(pnl?.error || `P&L table API failed (${pnlRes.status})`);
    if (!cash?.ok) throw new Error(cash?.error || `Cash-banks API failed (${cashRes.status})`);

    const baseMeta = {
      companyName: dash.companyName,
      currency: dash.currency ?? "PKR",
      start_date: dash.range?.start_date ?? start_date,
      end_date: dash.range?.end_date ?? end_date,
      accounting_method,
      generated_at: new Date().toISOString(),
    };

    // --- If no OpenAI key, return fallback (still OK) ---
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      const fb = buildFallbackInsights({ dash, pnl, cash });
      return NextResponse.json({
        ...fb,
        meta: { ...baseMeta, source: "fallback" as const },
      });
    }

    // --- Try OpenAI; if quota fails, fallback ---
    const openai = new OpenAI({ apiKey });
    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

    const dataPack = {
      companyName: dash.companyName,
      currency: dash.currency ?? "PKR",
      accounting_method: dash.accounting_method,
      range: dash.range,
      kpis: dash.kpis,
      months: dash.series,
      topExpenses: pickTopExpenses(pnl.rows, 10),
      cashTotalsByCurrency: cash.totalsByCurrency ?? {},
      cashTopAccounts: (cash.accounts ?? [])
        .slice()
        .sort((a, b) => Math.abs(b.currentBalance) - Math.abs(a.currentBalance))
        .slice(0, 8)
        .map((a) => ({ name: a.name, currency: a.currency, balance: a.currentBalance })),
    };

    try {
      const resp = await openai.responses.create({
        model,
        instructions:
          "You are a CFO assistant for a finance dashboard.\n" +
          "Return ONLY valid JSON.\n" +
          "Rules:\n" +
          "- Currency is PKR unless a specific account currency is shown.\n" +
          "- Use commas and NO decimals for PKR.\n" +
          "- Do not invent numbers. If missing, say 'Not available'.\n" +
          "- Be concise and actionable.\n" +
          "- Output must be a single JSON object with keys: summary, highlights, risks, actions, notes.\n" +
          "- highlights/risks/actions/notes must be arrays of strings.\n",
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text:
                  "Output a SINGLE JSON object. JSON only (no markdown, no extra text).\n" +
                  "Create CFO insights for the following dashboard data:\n\n" +
                  JSON.stringify(dataPack),
              },
            ],
          },
        ],
        text: { format: { type: "json_object" } },
      });

      const outText = extractOutputText(resp);
      const parsed = safeJsonParse<{
        summary: string;
        highlights: string[];
        risks: string[];
        actions: string[];
        notes: string[];
      }>(outText);

      if (!parsed) throw new Error("AI returned non-JSON output.");

      const result: AiInsights = {
        ok: true,
        meta: { ...baseMeta, source: "openai" },
        summary: parsed.summary ?? "",
        highlights: Array.isArray(parsed.highlights) ? parsed.highlights : [],
        risks: Array.isArray(parsed.risks) ? parsed.risks : [],
        actions: Array.isArray(parsed.actions) ? parsed.actions : [],
        notes: Array.isArray(parsed.notes) ? parsed.notes : [],
      };

      return NextResponse.json(result);
    } catch (err: any) {
      // Quota/rate-limit → fallback (keeps dashboard usable)
      const msg = err?.message ?? String(err);
      const isQuota =
        /quota|billing|insufficient_quota|429/i.test(msg) || err?.status === 429;

      if (isQuota) {
        const fb = buildFallbackInsights({ dash, pnl, cash });
        return NextResponse.json({
          ...fb,
          meta: { ...baseMeta, source: "fallback" as const },
          notes: [...fb.notes, "OpenAI API returned quota/429. Please enable billing or increase limits to use AI narrative."],
        });
      }

      return NextResponse.json({ ok: false, error: msg }, { status: 500 });
    }
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}
