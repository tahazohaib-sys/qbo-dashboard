// src/lib/stripe.ts
// Small read-only Stripe REST client. It uses fetch so no SDK dependency is needed.
// The secret key stays on the server: only API routes may import this file.

const STRIPE_API = "https://api.stripe.com/v1";

// Stripe gives amounts in the smallest currency unit. These currencies have no minor unit.
const ZERO_DECIMAL = new Set([
  "bif", "clp", "djf", "gnf", "jpy", "kmf", "krw", "mga",
  "pyg", "rwf", "ugx", "vnd", "vuv", "xaf", "xof", "xpf",
]);

export function fromMinorUnits(amount: number, currency: string) {
  return ZERO_DECIMAL.has(currency.toLowerCase()) ? amount : amount / 100;
}

export function stripeKey() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Missing env var: STRIPE_SECRET_KEY");
  return key;
}

type Params = Record<string, string | number | undefined | Array<string>>;

function toQuery(params: Params) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined) continue;
    if (Array.isArray(v)) v.forEach((x) => sp.append(`${k}[]`, x));
    else sp.set(k, String(v));
  }
  return sp.toString();
}

export async function stripeGet<T = unknown>(path: string, params: Params = {}): Promise<T> {
  const qs = toQuery(params);
  const res = await fetch(`${STRIPE_API}${path}${qs ? `?${qs}` : ""}`, {
    headers: { Authorization: `Bearer ${stripeKey()}` },
    cache: "no-store",
  });
  const json = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
  if (!res.ok) {
    const msg = json?.error?.message || `Stripe request failed (${res.status})`;
    throw new Error(msg);
  }
  return json as T;
}

/**
 * Reads all pages of a Stripe list endpoint, up to maxItems.
 * `truncated` is true when more data exists than was read.
 */
export async function stripeListAll<T extends { id: string }>(
  path: string,
  params: Params = {},
  maxItems = 5000
): Promise<{ data: T[]; truncated: boolean }> {
  const out: T[] = [];
  let startingAfter: string | undefined;
  for (;;) {
    const page = await stripeGet<{ data: T[]; has_more: boolean }>(path, {
      ...params,
      limit: 100,
      starting_after: startingAfter,
    });
    out.push(...page.data);
    if (!page.has_more || page.data.length === 0) return { data: out, truncated: false };
    if (out.length >= maxItems) return { data: out, truncated: true };
    startingAfter = page.data[page.data.length - 1].id;
  }
}
