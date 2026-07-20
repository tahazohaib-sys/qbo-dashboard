// Keyword-based grouping for the P&L "Expense Composition" breakdown.
//
// Individual QBO expense accounts (e.g. "Technical Department Salaries",
// "Marketing Department Salary Expense", "Accounts Department Salary") are folded
// into a small set of human-friendly groups (e.g. one "Overall Salary Expense").
// The smallest leftover accounts collapse into a single "Other" group.

// Accent palette — mirrors DONUT_COLORS in DashboardPageClient.tsx so group colors
// stay index-aligned with the chart legend classes.
export const EXPENSE_COLORS = [
  "#60a5fa", // blue-400
  "#34d399", // emerald-400
  "#fbbf24", // amber-300
  "#a78bfa", // violet-400
  "#fb7185", // rose-400
  "#22d3ee", // cyan-300
  "#f97316", // orange-400
  "#94a3b8", // slate-400
];

export type MonthCol = { label: string; start: string; end: string };

export type MonthlyRow = {
  path: string;
  rowType: string;
  label: string;
  monthly: number[];
};

export type ExpenseMember = {
  name: string;
  value: number;
  monthly: number[];
};

export type ExpenseGroup = {
  key: string;
  label: string;
  value: number;
  color: string;
  monthly: number[]; // summed across members, aligned with the months array
  members: ExpenseMember[];
  isOther?: boolean;
};

// Ordered — the FIRST matching pattern wins. Salary patterns come before
// Marketing so that "Marketing Department Salary Expense" lands in the salary group.
export const EXPENSE_GROUPS: { key: string; label: string; match: RegExp }[] = [
  { key: "salary", label: "Overall Salary Expense", match: /salar|payroll|wage/i },
  { key: "rent", label: "Rent", match: /rent|lease/i },
  { key: "subscriptions", label: "Subscriptions", match: /subscription|software|saas|licen[cs]e/i },
  { key: "bank", label: "Bank Charges", match: /bank\s*(charge|fee)|bank charges|merchant fee/i },
  { key: "marketing", label: "Marketing", match: /marketing|advertis|ad\s*spend|promo/i },
  { key: "utilities", label: "Utilities & Office", match: /utilit|electric|internet|office|supplies|stationery/i },
  { key: "travel", label: "Travel & Entertainment", match: /travel|entertain|meal|conveyance|fuel/i },
];

function addMonthly(target: number[], add: number[] | undefined, len: number): number[] {
  const out = target.length === len ? target : new Array(len).fill(0);
  if (add) {
    for (let i = 0; i < len; i++) out[i] += add[i] ?? 0;
  }
  return out;
}

/**
 * Group flat expense accounts into a small set of labelled groups.
 *
 * @param rows        current-range accounts: { name, value } (drives totals)
 * @param monthlyRows optional per-account monthly series (drives the trend)
 * @param months      month columns aligned with each monthly[] entry
 * @param opts.topN   number of top groups to keep before collapsing into "Other"
 */
export function groupExpenses(
  rows: { name: string; value: number }[],
  monthlyRows?: MonthlyRow[],
  months?: MonthCol[],
  opts?: { topN?: number }
): ExpenseGroup[] {
  const topN = opts?.topN ?? 6;
  const monthsLen = months?.length ?? 0;

  // Build a label -> monthly[] lookup from expense Data rows only (mirrors how the
  // current-range breakdown is aggregated), so section totals aren't double counted.
  const monthlyByLabel = new Map<string, number[]>();
  if (monthlyRows && monthsLen > 0) {
    for (const r of monthlyRows) {
      if (r.rowType !== "Data") continue;
      const p = r.path || "";
      if (!p.startsWith("P&L > Expenses") && !p.startsWith("P&L > Other Expenses")) continue;
      const prev = monthlyByLabel.get(r.label);
      monthlyByLabel.set(r.label, addMonthly(prev ? [...prev] : new Array(monthsLen).fill(0), r.monthly, monthsLen));
    }
  }

  type Acc = { key: string; label: string; value: number; monthly: number[]; members: ExpenseMember[] };
  const groups = new Map<string, Acc>();

  for (const row of rows) {
    if (!(row.value > 0)) continue;
    const def = EXPENSE_GROUPS.find((g) => g.match.test(row.name));
    const key = def ? def.key : `solo:${row.name}`;
    const label = def ? def.label : row.name;

    const memberMonthly = monthlyByLabel.get(row.name) ?? new Array(monthsLen).fill(0);

    let acc = groups.get(key);
    if (!acc) {
      acc = { key, label, value: 0, monthly: new Array(monthsLen).fill(0), members: [] };
      groups.set(key, acc);
    }
    acc.value += row.value;
    acc.monthly = addMonthly(acc.monthly, memberMonthly, monthsLen);
    acc.members.push({ name: row.name, value: row.value, monthly: memberMonthly });
  }

  const sorted = Array.from(groups.values()).sort((a, b) => b.value - a.value);

  // Keep the top N groups; collapse only the smallest leftover tail into "Other".
  const kept = sorted.slice(0, topN);
  const tail = sorted.slice(topN);

  const result: Acc[] = [...kept];
  if (tail.length > 0) {
    const other: Acc = {
      key: "other",
      label: "Other",
      value: 0,
      monthly: new Array(monthsLen).fill(0),
      members: [],
    };
    for (const g of tail) {
      other.value += g.value;
      other.monthly = addMonthly(other.monthly, g.monthly, monthsLen);
      // Flatten leftover groups down to their individual accounts.
      other.members.push(...g.members);
    }
    result.push(other);
  }

  return result.map((g, idx) => ({
    key: g.key,
    label: g.label,
    value: g.value,
    color: EXPENSE_COLORS[idx % EXPENSE_COLORS.length],
    monthly: g.monthly,
    members: [...g.members].sort((a, b) => b.value - a.value),
    isOther: g.key === "other",
  }));
}
