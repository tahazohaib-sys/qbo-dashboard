/**
 * Retained Earning calculation and plain-language analysis.
 *
 *   Retained Earning = Net Profit
 *                    - movement of long-term assets (Laptop / LED / Vehicle)
 *                    - net investments (investments made - contributions received)
 *
 * All balance-sheet movements are "snapshot at end" minus "snapshot on the
 * day before the start", the same way the QBO Balance Sheet shows them.
 */

/* ---------------- report helpers ---------------- */

export function toNum(v: unknown): number {
  if (v == null || v === "" || v === "-") return 0;
  const n = Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export function norm(s: unknown) {
  return String(s ?? "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[-_]/g, "");
}

/** Minimal shape of QBO report rows. */
type QboCell = { value?: string; id?: string };
type QboRow = {
  type?: string;
  Header?: { ColData?: QboCell[] };
  Summary?: { ColData?: QboCell[] };
  ColData?: QboCell[];
  Rows?: QboRows;
};
export type QboRows = { Row?: QboRow[] } | undefined;

export type FlatRow = { path: string; label: string; cols: QboCell[]; type: string };

/** Flattens Data rows and Section summaries of a QBO report. */
export function flattenRows(rows: QboRows, path: string[] = [], out: FlatRow[] = []) {
  if (!rows?.Row) return out;

  for (const r of rows.Row) {
    if (r.type === "Section") {
      const headerLabel = r.Header?.ColData?.[0]?.value ?? "";
      const nextPath = headerLabel ? [...path, headerLabel] : [...path];
      if (r.Summary?.ColData?.length) {
        out.push({
          path: nextPath.join(" > "),
          label: r.Summary?.ColData?.[0]?.value ?? `Total ${headerLabel}`,
          cols: r.Summary?.ColData,
          type: "Summary",
        });
      }
      flattenRows(r.Rows, nextPath, out);
      continue;
    }
    if (r.ColData?.length) {
      out.push({ path: path.join(" > "), label: r.ColData?.[0]?.value ?? "", cols: r.ColData, type: "Data" });
    }
  }
  return out;
}

/** "Total only" reports carry the amount in ColData[1]. */
export function totalOf(row: FlatRow | undefined) {
  return row ? toNum(row.cols?.[1]?.value) : 0;
}

export function findRowByLabel(rows: FlatRow[], labels: string[]) {
  const labelSet = labels.map(norm);
  return rows.find((r) => labelSet.includes(norm(r.label)));
}

export function netIncomeRow(rows: FlatRow[]) {
  return (
    findRowByLabel(rows, ["Net Income"]) ||
    findRowByLabel(rows, ["Net earnings", "Net Earnings"]) ||
    rows.find((r) => norm(r.label).includes("netincome")) ||
    rows.find((r) => norm(r.label).includes("netearnings"))
  );
}

/* ---------------- components ---------------- */

// Long-term asset accounts, as named in QBO.
export const LT_LABELS = ["Laptop", "LED", "Vehicle RTC League"];

export type InvItem = { label: string; amount: number; type: "investment" | "contribution" };

export type Components = {
  netProfit: number;
  ltDetail: Array<{ label: string; end: number; prior: number; movement: number }>;
  ltEnd: number;
  ltPrior: number;
  longTermAssetsMovement: number;
  items: InvItem[];
  totalInvestments: number;
  contribution: number;
  netInvestments: number;
  retainedEarning: number;
};

/** Components between two balance-sheet snapshots, plus the P&L net profit. */
export function computeComponents(endRows: FlatRow[], priorRows: FlatRow[], netProfit: number): Components {
  const ltDetail = LT_LABELS.map((label) => {
    const endVal = totalOf(findRowByLabel(endRows, [label]));
    const priorVal = totalOf(findRowByLabel(priorRows, [label]));
    return { label, end: endVal, prior: priorVal, movement: endVal - priorVal };
  }).filter((x) => x.end !== 0 || x.prior !== 0 || x.movement !== 0);

  const ltEnd = ltDetail.reduce((s, x) => s + x.end, 0);
  const ltPrior = ltDetail.reduce((s, x) => s + x.prior, 0);
  const longTermAssetsMovement = ltEnd - ltPrior;

  // Equity Data rows of the end snapshot
  const equityEndRows = endRows.filter((r) => r.type === "Data" && r.path.toLowerCase().includes("equity"));

  const findPriorByLabel = (label: string): FlatRow | undefined => {
    const n = norm(label);
    const exact = priorRows.find((r) => norm(r.label) === n);
    if (exact) return exact;
    // Same equity section + common 8-char prefix: handles a label corrected mid-period
    const prefix = n.slice(0, 8);
    return priorRows.find((r) => r.type === "Data" && r.path.toLowerCase().includes("equity") && norm(r.label).startsWith(prefix));
  };

  // "received" and the common "recieved" typo
  const contributionItems: InvItem[] = equityEndRows
    .filter((r) => {
      const l = r.label.toLowerCase();
      return l.includes("contribution received") || l.includes("contribution recieved");
    })
    .map((r) => ({
      label: r.label,
      amount: Math.max(0, totalOf(r) - totalOf(findPriorByLabel(r.label))),
      type: "contribution" as const,
    }));

  const contributionLabels = new Set(contributionItems.map((x) => x.label));

  const investmentItems: InvItem[] = equityEndRows
    .filter((r) => r.label.toLowerCase().includes("investment") && !contributionLabels.has(r.label))
    .map((r) => ({
      label: r.label,
      amount: Math.abs(totalOf(r) - totalOf(findPriorByLabel(r.label))),
      type: "investment" as const,
    }));

  const totalInvestments = investmentItems.reduce((s, x) => s + x.amount, 0);
  const contribution = contributionItems.reduce((s, x) => s + x.amount, 0);
  const netInvestments = totalInvestments - contribution;

  return {
    netProfit,
    ltDetail,
    ltEnd,
    ltPrior,
    longTermAssetsMovement,
    items: [...investmentItems, ...contributionItems],
    totalInvestments,
    contribution,
    netInvestments,
    retainedEarning: netProfit - longTermAssetsMovement - netInvestments,
  };
}

/* ---------------- analysis ---------------- */

export type MonthPoint = {
  month: string; // YYYY-MM
  label: string; // "Jan 2026"
  netProfit: number;
  assets: number;
  netInvestments: number;
  retained: number;
  cumulativeRetained: number;
};

export type PeriodSummary = {
  start: string;
  end: string;
  netProfit: number;
  longTermAssetsMovement: number;
  netInvestments: number;
  retainedEarning: number;
};

export type Insight = { tone: "good" | "watch" | "risk" | "info"; title: string; text: string };

export type Verdict = { status: "healthy" | "balanced" | "watch" | "risk"; label: string; headline: string };

export type Ratios = {
  /** Retained / net profit (null when profit <= 0) */
  retentionRatio: number | null;
  /** (assets + net investments) / net profit (null when profit <= 0) */
  reinvestmentRatio: number | null;
  assetsShare: number | null;
  investmentsShare: number | null;
  /** Months with retained > 0 / months */
  positiveMonths: number;
  months: number;
};

export function formatPKR(n: number) {
  const sign = n < 0 ? "-" : "";
  const a = Math.abs(n);
  if (a >= 1_000_000) return `${sign}Rs ${(a / 1_000_000).toFixed(a >= 10_000_000 ? 1 : 2)}M`;
  if (a >= 1_000) return `${sign}Rs ${Math.round(a / 1_000).toLocaleString("en")}K`;
  return `${sign}Rs ${Math.round(a).toLocaleString("en")}`;
}

const pct = (n: number) => `${Math.round(n * 100)}%`;

export function computeRatios(c: Pick<Components, "netProfit" | "longTermAssetsMovement" | "netInvestments" | "retainedEarning">, monthly: MonthPoint[]): Ratios {
  const p = c.netProfit;
  return {
    retentionRatio: p > 0 ? c.retainedEarning / p : null,
    reinvestmentRatio: p > 0 ? (c.longTermAssetsMovement + c.netInvestments) / p : null,
    assetsShare: p > 0 ? c.longTermAssetsMovement / p : null,
    investmentsShare: p > 0 ? c.netInvestments / p : null,
    positiveMonths: monthly.filter((m) => m.retained > 0).length,
    months: monthly.length,
  };
}

export function buildVerdict(c: Components, ratios: Ratios): Verdict {
  const f = formatPKR;
  if (c.netProfit <= 0) {
    return {
      status: "risk",
      label: "Loss period",
      headline:
        c.netProfit < 0
          ? `The company made a loss of ${f(-c.netProfit)}. There was no profit to keep, so the retained amount is ${f(c.retainedEarning)}.`
          : "The company made no profit in this period, so nothing could be retained.",
    };
  }
  const rr = ratios.retentionRatio ?? 0;
  if (c.retainedEarning < 0) {
    return {
      status: "risk",
      label: "Spending more than earned",
      headline: `Assets and investments (${f(c.longTermAssetsMovement + c.netInvestments)}) were more than the profit (${f(c.netProfit)}). The gap of ${f(-c.retainedEarning)} came from existing reserves.`,
    };
  }
  if (rr >= 0.6) {
    return {
      status: "healthy",
      label: "Strong retention",
      headline: `The company kept ${pct(rr)} of its profit (${f(c.retainedEarning)} of ${f(c.netProfit)}).`,
    };
  }
  if (rr >= 0.3) {
    return {
      status: "balanced",
      label: "Balanced",
      headline: `The company kept ${pct(rr)} of its profit and reinvested ${pct(1 - rr)} in assets and investments.`,
    };
  }
  return {
    status: "watch",
    label: "Heavy reinvestment",
    headline: `Only ${pct(rr)} of the profit stayed in the company. Most of it (${pct(1 - rr)}) went into assets and investments.`,
  };
}

export function buildInsights(
  c: Components,
  ratios: Ratios,
  monthly: MonthPoint[],
  previous: PeriodSummary | null,
  monthlyTruncated = false
): Insight[] {
  const f = formatPKR;
  const out: Insight[] = [];
  const p = c.netProfit;

  // 1. Where the profit went
  if (p > 0) {
    out.push({
      tone: "info",
      title: "Where the profit went",
      text: `Of every Rs 100 of profit, Rs ${Math.max(0, Math.round((ratios.retentionRatio ?? 0) * 100))} stayed in the company, Rs ${Math.max(
        0,
        Math.round((ratios.assetsShare ?? 0) * 100)
      )} bought long-term assets and Rs ${Math.max(0, Math.round((ratios.investmentsShare ?? 0) * 100))} went into net investments.`,
    });
  }

  // 2. Asset spending
  if (c.longTermAssetsMovement > 0) {
    const top = [...c.ltDetail].sort((a, b) => b.movement - a.movement)[0];
    out.push({
      tone: p > 0 && c.longTermAssetsMovement > p * 0.5 ? "watch" : "info",
      title: "Asset purchases",
      text: `${f(c.longTermAssetsMovement)} was added to long-term assets${top && top.movement > 0 ? `, mostly ${top.label} (${f(top.movement)})` : ""}. These are one-time costs that support future work, not running costs.`,
    });
  } else if (c.longTermAssetsMovement < 0) {
    out.push({
      tone: "info",
      title: "Asset value went down",
      text: `Long-term assets went down by ${f(-c.longTermAssetsMovement)} (sale, write-off or depreciation). This adds to the retained amount.`,
    });
  }

  // 3. Investments vs contributions
  if (c.totalInvestments > 0 || c.contribution > 0) {
    if (c.contribution > 0 && c.contribution >= c.totalInvestments) {
      out.push({
        tone: "good",
        title: "Investments covered by contributions",
        text: `Contributions received (${f(c.contribution)}) covered all investments made (${f(c.totalInvestments)}). Investments did not reduce the profit.`,
      });
    } else {
      out.push({
        tone: c.netInvestments > p * 0.5 && p > 0 ? "watch" : "info",
        title: "Investments",
        text: `${f(c.totalInvestments)} was invested${c.contribution > 0 ? ` and ${f(c.contribution)} came back as contributions` : ""}. Net, ${f(c.netInvestments)} of profit went into investments.`,
      });
    }
  }

  // 4. Monthly consistency
  if (monthly.length >= 2) {
    // When the monthly view is cut to the latest months, say which months it covers.
    const scope = monthlyTruncated ? `In the last ${monthly.length} months (${monthly[0].label} – ${monthly[monthly.length - 1].label}): ` : "";
    const neg = monthly.filter((m) => m.retained < 0);
    const best = [...monthly].sort((a, b) => b.retained - a.retained)[0];
    const worst = [...monthly].sort((a, b) => a.retained - b.retained)[0];
    out.push({
      tone: neg.length === 0 ? "good" : neg.length > monthly.length / 2 ? "risk" : "watch",
      title: "Month by month",
      text:
        scope +
        (neg.length === 0
          ? `Every month added to retained earnings. Best month: ${best.label} (${f(best.retained)}).`
          : `${monthly.length - neg.length} of ${monthly.length} months added to retained earnings. Best: ${best.label} (${f(best.retained)}). Weakest: ${worst.label} (${f(worst.retained)}).`),
    });

    // trend: second half vs first half
    const half = Math.floor(monthly.length / 2);
    if (half >= 1) {
      const a = monthly.slice(0, half).reduce((s, m) => s + m.retained, 0) / half;
      const b = monthly.slice(monthly.length - half).reduce((s, m) => s + m.retained, 0) / half;
      if (Math.abs(b - a) > Math.max(Math.abs(a) * 0.1, 1)) {
        out.push({
          tone: b > a ? "good" : "watch",
          title: b > a ? "Improving trend" : "Weakening trend",
          text: `${scope}Average monthly retained earnings ${b > a ? "rose" : "fell"} from ${f(a)} (early months) to ${f(b)} (recent months).`,
        });
      }
    }
  }

  // 5. Previous period
  if (previous) {
    const d = c.retainedEarning - previous.retainedEarning;
    const base = Math.abs(previous.retainedEarning);
    out.push({
      tone: d >= 0 ? "good" : "watch",
      title: "Compared with the previous period",
      text: `Retained earnings ${d >= 0 ? "went up" : "went down"} by ${f(Math.abs(d))}${base > 0 ? ` (${d >= 0 ? "+" : "−"}${Math.round((Math.abs(d) / base) * 100)}%)` : ""} versus ${previous.start} – ${previous.end}. Profit was ${f(previous.netProfit)} then and ${f(p)} now.`,
    });
  }

  // 6. Decision guidance
  if (p > 0 && c.retainedEarning < 0) {
    out.push({
      tone: "risk",
      title: "Decision point",
      text: "Spending on assets and investments was more than profit. Before new purchases, check the cash balance, or spread big purchases over more months.",
    });
  } else if (p > 0 && (ratios.retentionRatio ?? 0) >= 0.6 && c.retainedEarning > 0) {
    out.push({
      tone: "good",
      title: "Decision point",
      text: `There is room to reinvest. ${f(c.retainedEarning)} was kept this period and can fund growth, a reserve, or a payout to owners.`,
    });
  } else if (p <= 0) {
    out.push({
      tone: "risk",
      title: "Decision point",
      text: "Profit must come first. Delay asset purchases and new investments until the business is profitable again.",
    });
  }

  return out;
}
