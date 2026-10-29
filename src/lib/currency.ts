// Display currency for the dashboard modules (PKR / USD).
//
// QuickBooks gives all amounts in the home currency (PKR). The dashboard
// converts them at one USD rate (constant currency): the same rate for all
// months, so the trend does not change when the currency changes.
import { currencySymbol, fmtMoney } from "@/lib/forecast";

export { currencySymbol, fmtMoney };

export type DisplayCurrency = "PKR" | "USD";

/** Factor that converts an amount in the home currency to the display currency. null = no rate yet. */
export function conversionFactor(home: string, display: string, pkrPerUsd: number | null) {
  if (home === display) return 1;
  if (!pkrPerUsd) return null;
  if (home === "PKR" && display === "USD") return 1 / pkrPerUsd;
  if (home === "USD" && display === "PKR") return pkrPerUsd;
  return null;
}

/** Symbol + space for a word symbol (Rs, AED); no space for a sign symbol ($, €, £). */
export function moneyPrefix(currency: string, negative = false) {
  const sym = currencySymbol(currency);
  return `${negative ? "-" : ""}${sym}${/^[A-Za-z]+$/.test(sym) ? " " : ""}`;
}

/** Full amount, no decimals: Rs 1,234,567 or $4,409. */
export function fmtMoneyFull(n: number, currency = "PKR") {
  return `${moneyPrefix(currency, n < 0)}${Math.round(Math.abs(n)).toLocaleString("en")}`;
}
