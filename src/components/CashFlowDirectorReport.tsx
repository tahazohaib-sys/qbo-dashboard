"use client";

import React, { useState } from "react";
import { formatAmount, type DirectorReport, type ReportCategory } from "@/lib/cashflow-report";

/**
 * Plain-language view of the monthly cash flow for directors and other
 * readers without an accounting background.
 */
export default function CashFlowDirectorReport({ report }: { report: DirectorReport }) {
  const f = (n: number) => formatAmount(report.currency, n);
  const up = report.net >= 0;

  return (
    <div className="space-y-5">
      {/* Headline + cash story */}
      <Section title={`Cash report · ${report.monthLabel}`}>
        <p className="text-lg font-medium leading-relaxed text-white md:text-xl">{report.headline}</p>

        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StoryStep
            label="Cash at start of month"
            value={report.openingCash != null ? f(report.openingCash) : "—"}
            note="Total in all bank and cash accounts"
          />
          <StoryStep label="Money came in" value={`+ ${f(report.moneyIn)}`} tone="text-emerald-300" note="From customers and other sources" />
          <StoryStep label="Money went out" value={`− ${f(report.moneyOut)}`} tone="text-rose-300" note="Staff, suppliers, expenses and more" />
          <StoryStep
            label="Cash at end of month"
            value={report.closingCash != null ? f(report.closingCash) : "—"}
            tone={up ? "text-emerald-200" : "text-amber-200"}
            note={`${up ? "Up" : "Down"} ${f(Math.abs(report.net))} in the month`}
          />
        </div>

        <InOutBar moneyIn={report.moneyIn} moneyOut={report.moneyOut} />

        {report.previous ? (
          <p className="mt-3 text-xs text-slate-400">
            Last month ({report.previous.monthLabel}): received {f(report.previous.moneyIn)}, spent {f(report.previous.moneyOut)},{" "}
            cash {report.previous.net >= 0 ? "up" : "down"} {f(Math.abs(report.previous.net))}.
          </p>
        ) : null}
      </Section>

      {/* Key points */}
      {report.keyPoints.length ? (
        <Section title="Key points">
          <ul className="space-y-2.5">
            {report.keyPoints.map((p, i) => (
              <li key={i} className="flex gap-3 text-sm leading-relaxed text-slate-200">
                <span
                  className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${
                    p.tone === "good" ? "bg-emerald-400" : p.tone === "watch" ? "bg-amber-400" : "bg-sky-400"
                  }`}
                  aria-hidden
                />
                <span>{p.text}</span>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex flex-wrap gap-4 text-[11px] text-slate-500">
            <Legend color="bg-emerald-400" label="Good sign" />
            <Legend color="bg-amber-400" label="Needs attention" />
            <Legend color="bg-sky-400" label="For information" />
          </div>
        </Section>
      ) : null}

      {/* Where from / where to */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <CategoryList
          title="Where the money came from"
          categories={report.sources}
          total={report.moneyIn}
          currency={report.currency}
          barClass="bg-emerald-400/75"
          namesLabel="Main payers"
          previousLabel={report.previous?.monthLabel ?? null}
        />
        <CategoryList
          title="Where the money went"
          categories={report.uses}
          total={report.moneyOut}
          currency={report.currency}
          barClass="bg-rose-400/75"
          namesLabel="Paid to"
          previousLabel={report.previous?.monthLabel ?? null}
        />
      </div>

      {/* Three kinds of movement */}
      <Section title="Three kinds of cash movement">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {report.activities.map((a) => (
            <div key={a.key} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <div className="text-sm font-semibold text-white">{a.label}</div>
              <div className={`mt-2 text-2xl font-semibold tabular-nums ${a.net >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                {a.net >= 0 ? "+" : "−"} {f(Math.abs(a.net))}
              </div>
              <div className="mt-1 text-xs tabular-nums text-slate-400">
                In {f(a.moneyIn)} · Out {f(a.moneyOut)}
              </div>
              <p className="mt-2 text-xs leading-relaxed text-slate-400">{a.explain}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-slate-500">
          A healthy company usually shows a plus in &quot;Running the business&quot;. A minus there means the business used more cash than it
          made, and the gap came from savings, loans or owners.
        </p>
      </Section>

      {/* Top counterparties */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <NameList title="Customers who paid us most" rows={report.topPayers} currency={report.currency} empty="No named customer payments." />
        <NameList title="Suppliers and others we paid most" rows={report.topPayees} currency={report.currency} empty="No named payments." />
      </div>
    </div>
  );
}

function CategoryList({
  title,
  categories,
  total,
  currency,
  barClass,
  namesLabel,
  previousLabel,
}: {
  title: string;
  categories: ReportCategory[];
  total: number;
  currency: string;
  barClass: string;
  namesLabel: string;
  previousLabel: string | null;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const f = (n: number) => formatAmount(currency, n);

  return (
    <Section title={title}>
      {categories.length === 0 ? (
        <div className="py-4 text-sm text-slate-400">Nothing this month.</div>
      ) : (
        <div className="space-y-2">
          {categories.map((c) => {
            const isOpen = open === c.key;
            const diff = c.prevAmount != null ? c.amount - c.prevAmount : null;
            return (
              <div key={c.key} className="rounded-xl border border-white/5 bg-white/[0.02]">
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : c.key)}
                  className="w-full px-3 py-3 text-left transition hover:bg-white/[0.04]"
                  aria-expanded={isOpen}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-100">{c.label}</div>
                      <div className="mt-0.5 text-xs text-slate-400">{c.explain}</div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-sm font-semibold tabular-nums text-white">{f(c.amount)}</div>
                      <div className="text-[11px] tabular-nums text-slate-500">{Math.round(c.share * 100)}% of total</div>
                    </div>
                  </div>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/5">
                    <div className={`h-full rounded-full ${barClass}`} style={{ width: `${Math.max(c.share * 100, 1)}%` }} />
                  </div>
                  {diff != null && previousLabel ? (
                    <div className="mt-1.5 text-[11px] text-slate-500">
                      {Math.abs(diff) < 1
                        ? `Same as ${previousLabel}`
                        : c.prevAmount === 0
                        ? `New this month (nothing in ${previousLabel})`
                        : `${diff > 0 ? "Up" : "Down"} ${f(Math.abs(diff))} from ${previousLabel}`}
                    </div>
                  ) : null}
                </button>

                {isOpen ? (
                  <div className="grid grid-cols-1 gap-4 border-t border-white/5 px-3 py-3 text-xs sm:grid-cols-2">
                    <div>
                      <div className="mb-1.5 font-semibold uppercase tracking-[0.12em] text-slate-500">{namesLabel}</div>
                      {c.topNames.length ? (
                        <ul className="space-y-1">
                          {c.topNames.map((n) => (
                            <li key={n.name} className="flex justify-between gap-2 text-slate-300">
                              <span className="truncate">{n.name}</span>
                              <span className="tabular-nums text-slate-100">{f(n.amount)}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <div className="text-slate-500">No names recorded.</div>
                      )}
                    </div>
                    <div>
                      <div className="mb-1.5 font-semibold uppercase tracking-[0.12em] text-slate-500">Accounts in QuickBooks</div>
                      <ul className="space-y-1">
                        {c.heads.map((h) => (
                          <li key={h.accountName} className="flex justify-between gap-2 text-slate-400">
                            <span className="truncate">{h.accountName}</span>
                            <span className="tabular-nums">{f(h.amount)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
          <div className="flex items-center justify-between border-t border-white/10 px-3 pt-3 text-sm font-semibold">
            <span className="text-slate-300">Total</span>
            <span className="tabular-nums text-white">{f(total)}</span>
          </div>
          <p className="px-3 text-[11px] text-slate-500">Click a line to see names and accounts.</p>
        </div>
      )}
    </Section>
  );
}

function NameList({
  title,
  rows,
  currency,
  empty,
}: {
  title: string;
  rows: Array<{ name: string; amount: number }>;
  currency: string;
  empty: string;
}) {
  const max = rows[0]?.amount ?? 0;
  return (
    <Section title={title}>
      {rows.length === 0 ? (
        <div className="py-2 text-sm text-slate-400">{empty}</div>
      ) : (
        <ol className="space-y-2.5">
          {rows.map((r, i) => (
            <li key={r.name}>
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="truncate text-slate-200">
                  <span className="mr-2 text-slate-500">{i + 1}.</span>
                  {r.name}
                </span>
                <span className="shrink-0 tabular-nums font-semibold text-white">{formatAmount(currency, r.amount)}</span>
              </div>
              <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-white/5">
                <div className="h-full rounded-full bg-sky-400/70" style={{ width: `${max > 0 ? (r.amount / max) * 100 : 0}%` }} />
              </div>
            </li>
          ))}
        </ol>
      )}
    </Section>
  );
}

function InOutBar({ moneyIn, moneyOut }: { moneyIn: number; moneyOut: number }) {
  const max = Math.max(moneyIn, moneyOut, 1);
  return (
    <div className="mt-5 space-y-2">
      <BarRow label="In" width={(moneyIn / max) * 100} className="bg-emerald-400/80" />
      <BarRow label="Out" width={(moneyOut / max) * 100} className="bg-rose-400/80" />
    </div>
  );
}

function BarRow({ label, width, className }: { label: string; width: number; className: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-8 text-xs text-slate-400">{label}</span>
      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-white/5">
        <div className={`h-full rounded-full ${className}`} style={{ width: `${Math.max(width, 0.5)}%` }} />
      </div>
    </div>
  );
}

function StoryStep({ label, value, note, tone = "text-white" }: { label: string; value: string; note: string; tone?: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
      <div className="text-xs text-slate-400">{label}</div>
      <div className={`mt-1.5 text-xl font-semibold tabular-nums ${tone}`}>{value}</div>
      <div className="mt-1 text-[11px] text-slate-500">{note}</div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`h-2 w-2 rounded-full ${color}`} aria-hidden />
      {label}
    </span>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.86),rgba(3,7,18,0.76))] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.42)] backdrop-blur-2xl">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="text-[13px] font-semibold uppercase tracking-[0.16em] text-slate-100">{title}</div>
        <span className="h-1.5 w-10 rounded-full bg-gradient-to-r from-cyan-300 to-blue-500 opacity-70" />
      </div>
      {children}
    </div>
  );
}
