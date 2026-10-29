"use client";

// One currency filter (PKR / USD) for all dashboard modules. The page keeps
// one state, so the currency stays the same when the user changes the tab.
import React, { createContext, useContext, useState } from "react";
import { conversionFactor, fmtMoney, fmtMoneyFull, moneyPrefix, type DisplayCurrency } from "@/lib/currency";

export type FxState =
  | { status: "idle" | "loading" }
  | { status: "ok"; rate: number; source: string; asOf: string }
  | { status: "error"; error: string };

export type CurrencyFilterState = {
  display: DisplayCurrency;
  changeCurrency: (next: DisplayCurrency) => void;
  rateInput: string;
  setRateInput: (v: string) => void;
  fx: FxState;
  loadMarketRate: () => void;
  /** PKR for 1 USD. null = no valid rate. */
  pkrPerUsd: number | null;
};

export function useCurrencyFilter(): CurrencyFilterState {
  const [display, setDisplay] = useState<DisplayCurrency>("PKR");
  const [fx, setFx] = useState<FxState>({ status: "idle" });
  const [rateInput, setRateInput] = useState("");
  const typedRate = Number(rateInput);
  const pkrPerUsd = Number.isFinite(typedRate) && typedRate > 0 ? typedRate : null;

  async function loadMarketRate() {
    setFx({ status: "loading" });
    try {
      const res = await fetch("/api/fx-rate", { cache: "no-store" });
      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error || "No market rate");
      setFx({ status: "ok", rate: json.rate, source: json.source, asOf: json.asOf });
      setRateInput(Number(json.rate).toFixed(2));
    } catch (e: unknown) {
      setFx({ status: "error", error: e instanceof Error ? e.message : String(e) });
    }
  }

  function changeCurrency(next: DisplayCurrency) {
    setDisplay(next);
    if (fx.status === "idle" && !pkrPerUsd) loadMarketRate();
  }

  return { display, changeCurrency, rateInput, setRateInput, fx, loadMarketRate, pkrPerUsd };
}

/** How one module shows its amounts: the currency, the factor from the home currency, and the other currency. */
export type CurrencyView = {
  home: string;
  currency: string;
  factor: number;
  converted: boolean;
  /** Full amount in the display currency. */
  full: (n: number) => string;
  /** Compact amount in the display currency. */
  short: (n: number) => string;
  /** "≈ $4K": the same amount (already in the display currency) in the other currency. undefined = no rate. */
  alt?: (n: number) => string;
};

export function currencyView(state: CurrencyFilterState, home: string): CurrencyView {
  const f = conversionFactor(home, state.display, state.pkrPerUsd);
  const currency = f != null ? state.display : home;
  const other = currency === "USD" ? "PKR" : "USD";
  const otherFactor = conversionFactor(currency, other, state.pkrPerUsd);
  return {
    home,
    currency,
    factor: f ?? 1,
    converted: f != null && f !== 1,
    full: (n) => fmtMoneyFull(n, currency),
    short: (n) => fmtMoney(n, currency),
    alt: otherFactor != null && otherFactor !== 1 ? (n) => `≈ ${fmtMoney(n * otherFactor, other)}` : undefined,
  };
}

/* ---------------- money context (for panels with many small parts) ---------------- */

const MoneyContext = createContext<string>("PKR");

export function MoneyProvider({ currency, children }: { currency: string; children: React.ReactNode }) {
  return <MoneyContext.Provider value={currency}>{children}</MoneyContext.Provider>;
}

/** The display currency of the nearest MoneyProvider, and its symbol prefix ("Rs " or "$"). */
export function useMoneyCurrency() {
  const currency = useContext(MoneyContext);
  return { currency, prefix: (negative = false) => moneyPrefix(currency, negative) };
}

/* ---------------- controls ---------------- */

const FIELD =
  "w-full min-w-0 rounded-xl border border-white/10 bg-black/35 px-3 py-2 text-sm outline-none transition focus:border-cyan-300/40";

/** Two fields: the currency and the USD rate (with a button to get the market rate again). */
export function CurrencyFields({ state, labelClassName = "text-[11px] uppercase tracking-[0.12em] text-slate-300" }: { state: CurrencyFilterState; labelClassName?: string }) {
  const { display, changeCurrency, rateInput, setRateInput, fx, loadMarketRate } = state;
  return (
    <>
      <label className="block">
        <span className={labelClassName}>Currency</span>
        <select value={display} onChange={(e) => changeCurrency(e.target.value as DisplayCurrency)} className={`${FIELD} mt-1`}>
          <option value="PKR">PKR (Rs)</option>
          <option value="USD">USD ($)</option>
        </select>
      </label>
      <label className="block" title="PKR for 1 USD. The market rate is filled in; you can type a different rate.">
        <span className={labelClassName}>USD rate (Rs per $1)</span>
        <div className="mt-1 flex gap-1.5">
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={rateInput}
            placeholder={fx.status === "loading" ? "Loading…" : "e.g. 280.00"}
            onChange={(e) => setRateInput(e.target.value)}
            className={`${FIELD} tabular-nums`}
          />
          <button
            type="button"
            onClick={loadMarketRate}
            disabled={fx.status === "loading"}
            title="Get the market rate again"
            className="shrink-0 rounded-xl border border-white/10 bg-white/5 px-2.5 text-xs text-slate-200 hover:bg-white/10 disabled:opacity-50"
          >
            {fx.status === "loading" ? "…" : "Market"}
          </button>
        </div>
      </label>
    </>
  );
}

/** One line under the fields: the rate in use and its source, or what the user must do. */
export function RateNote({ state, home, converted }: { state: CurrencyFilterState; home: string; converted: boolean }) {
  const { fx, pkrPerUsd, display } = state;
  if (display === home && !pkrPerUsd) return null;
  if (fx.status === "loading" && !pkrPerUsd) return <>Getting the market USD rate…</>;
  if (!pkrPerUsd) {
    return (
      <span className="text-amber-300">
        {fx.status === "error" ? "The market rate is not available. " : ""}Type the USD rate to show the figures in {display}. The figures show in {home} now.
      </span>
    );
  }
  const market = fx.status === "ok" && Math.abs(fx.rate - pkrPerUsd) < 0.005;
  return (
    <>
      Rate: Rs {pkrPerUsd.toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} = $1 ·{" "}
      {market ? `market rate from ${fx.source}${fx.asOf ? `, ${fx.asOf}` : ""}` : "rate typed by you"}
      {converted ? " · all months use this one rate (constant currency)" : ""}
    </>
  );
}
