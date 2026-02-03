import { getValidAccessToken, qboApiBase } from "@/lib/qbo";

function mustEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

/**
 * Robust fetch:
 * - Forces TLS stable behavior
 * - Adds timeout (QBO sometimes hangs)
 * - Prints real network error cause (ECONNRESET/ETIMEDOUT/ENOTFOUND)
 */
export async function qboFetch(path: string) {
  const { accessToken, realmId } = await getValidAccessToken();
  const base = qboApiBase();

  const url = `${base}/v3/company/${encodeURIComponent(realmId)}/${path}${
    path.includes("?") ? "&" : "?"
  }minorversion=75`;

  // Timeout (15s)
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
      signal: controller.signal,
    });

    const text = await res.text();

    if (!res.ok) {
      throw new Error(
        `QBO request failed (${res.status})\n` +
          `URL: ${url}\n` +
          `Response: ${text}`
      );
    }

    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  } catch (err: any) {
    // Make the real cause visible
    const cause = err?.cause;
    const details =
      `FETCH_FAILED\n` +
      `URL: ${url}\n` +
      `name: ${err?.name ?? "unknown"}\n` +
      `message: ${err?.message ?? String(err)}\n` +
      `cause: ${cause ? JSON.stringify(cause, Object.getOwnPropertyNames(cause)) : "none"}\n`;

    throw new Error(details);
  } finally {
    clearTimeout(timeout);
  }
}
