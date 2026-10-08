// Shared visual language for the Financial Analysis PDF report.
// Kept separate from the live dashboard's dark glassmorphic theme —
// a printed corporate report reads better on a light, high-contrast page.

export const COLORS = {
  page: "#ffffff",
  ink: "#0f172a", // headings
  body: "#334155", // paragraph text
  muted: "#64748b", // secondary/meta text
  faint: "#94a3b8",
  border: "#e2e8f0",
  borderStrong: "#cbd5e1",
  panel: "#f8fafc",
  panelAlt: "#f1f5f9",
  brand: "#0f766e", // teal-700 — primary accent
  brandSoft: "#ccfbf1",
  positive: "#059669",
  negative: "#dc2626",
  caution: "#d97706",
  seriesA: "#0f766e", // revenue / primary series
  seriesB: "#f59e0b", // expenses / secondary series
  seriesC: "#2563eb", // profit / tertiary series
} as const;

export const DONUT_PALETTE = [
  "#0f766e",
  "#2563eb",
  "#f59e0b",
  "#7c3aed",
  "#dc2626",
  "#0891b2",
  "#65a30d",
  "#94a3b8",
];

export const FONT = {
  regular: "Helvetica",
  bold: "Helvetica-Bold",
  oblique: "Helvetica-Oblique",
} as const;

export const PAGE = {
  size: "A4" as const,
  paddingTop: 48,
  paddingBottom: 56,
  paddingX: 44,
};

export function formatMoney(currency: string, n: number): string {
  const value = Number.isFinite(n) ? n : 0;
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
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

export function formatCompact(currency: string, n: number): string {
  const value = Number.isFinite(n) ? n : 0;
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  const symbols: Record<string, string> = { PKR: "Rs", USD: "$", EUR: "€", GBP: "£" };
  const sym = symbols[currency] ?? currency;
  if (abs >= 1_000_000_000) return `${sign}${sym} ${(abs / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${sign}${sym} ${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}${sym} ${(abs / 1_000).toFixed(1)}K`;
  return `${sign}${sym} ${Math.round(abs)}`;
}

export function formatAxisNumber(n: number): string {
  const value = Number.isFinite(n) ? n : 0;
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `${sign}${(abs / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(0)}K`;
  return `${sign}${Math.round(abs)}`;
}

export function formatPct(n: number, digits = 1): string {
  if (!Number.isFinite(n)) return "0%";
  return `${(n * 100).toFixed(digits)}%`;
}

export function formatDateLong(ymd: string): string {
  if (!/^\d{4}-\d{2}-\d{2}/.test(ymd)) return ymd;
  const [y, m, d] = ymd.slice(0, 10).split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

export function formatMonthLabel(ym: string): string {
  if (!/^\d{4}-\d{2}$/.test(ym)) return ym;
  const [y, m] = ym.split("-").map(Number);
  const dt = new Date(y, m - 1, 1);
  return dt.toLocaleDateString("en-US", { year: "2-digit", month: "short" });
}
