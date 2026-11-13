// Market exchange rate USD -> PKR (PKR for 1 USD). The sources are tried in
// this sequence; the first rate that is found is returned:
//   1. open.er-api.com (free daily market rate, no key)
//   2. fawazahmed0 currency API on the jsDelivr CDN (free daily market rate)
//   3. QuickBooks exchange rate (only when multicurrency is on in QuickBooks)
import { qboFetch } from "@/lib/metrics";

export type FxRate = { rate: number; source: string; asOf: string };

const CACHE_MS = 60 * 60 * 1000;
let cached: { at: number; value: FxRate } | null = null;

const valid = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n > 0;

async function getJson(url: string) {
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.json();
}

async function fromErApi(): Promise<FxRate> {
  const d = await getJson("https://open.er-api.com/v6/latest/USD");
  const rate = d?.rates?.PKR;
  if (d?.result !== "success" || !valid(rate)) throw new Error("open.er-api: no PKR rate");
  const asOf = d.time_last_update_unix ? new Date(d.time_last_update_unix * 1000).toISOString().slice(0, 10) : "";
  return { rate, source: "open.er-api.com", asOf };
}

async function fromCurrencyApi(): Promise<FxRate> {
  const d = await getJson("https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json");
  const rate = d?.usd?.pkr;
  if (!valid(rate)) throw new Error("currency-api: no PKR rate");
  return { rate, source: "currency-api", asOf: String(d?.date ?? "") };
}

async function fromQuickBooks(): Promise<FxRate> {
  const today = new Date().toISOString().slice(0, 10);
  const d = await qboFetch(`exchangerate?sourcecurrencycode=USD&asofdate=${today}`);
  const er = d?.ExchangeRate;
  const rate = Number(er?.Rate);
  if (er?.TargetCurrencyCode && er.TargetCurrencyCode !== "PKR") throw new Error("QuickBooks home currency is not PKR");
  if (!valid(rate)) throw new Error("QuickBooks: no USD rate");
  return { rate, source: "QuickBooks", asOf: String(er?.AsOfDate ?? today) };
}

/** Current market USD -> PKR rate. Throws when no source gives a rate. */
export async function getUsdPkrRate(): Promise<FxRate> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.value;
  const errors: string[] = [];
  for (const source of [fromErApi, fromCurrencyApi, fromQuickBooks]) {
    try {
      const value = await source();
      cached = { at: Date.now(), value };
      return value;
    } catch (e: unknown) {
      errors.push(e instanceof Error ? e.message.split("\n")[0] : String(e));
    }
  }
  throw new Error(`No market rate is available (${errors.join("; ")})`);
}
