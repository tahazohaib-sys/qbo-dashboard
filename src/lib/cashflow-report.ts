/**
 * Turns the accounting view of the monthly cash flow (account heads, debits,
 * credits) into a plain-language report for directors:
 *   - money in and money out grouped into everyday categories
 *   - three kinds of cash movement: running the business, buying assets,
 *     loans & owners
 *   - who paid us most and whom we paid most
 *   - short key points written in simple sentences
 */

type HeadTxnLike = { name: string; amount: number };

type HeadLike = {
  accountId: string;
  accountName: string;
  accountType: string;
  accountSubType: string;
  amount: number;
  transactions: HeadTxnLike[];
};

type MonthLike = {
  totals: { inflow: number; outflow: number; net: number; reversedAmount: number; reversedCount: number };
  inflows: HeadLike[];
  outflows: HeadLike[];
};

export type ActivityKey = "business" | "assets" | "financing";

type CategoryDef = {
  key: string;
  label: string;
  explain: string;
  activity: ActivityKey;
};

export type ReportCategory = CategoryDef & {
  amount: number;
  share: number;
  prevAmount: number | null;
  topNames: Array<{ name: string; amount: number }>;
  heads: Array<{ accountName: string; amount: number }>;
};

export type KeyPoint = { tone: "good" | "watch" | "info"; text: string };

export type DirectorReport = {
  month: string;
  monthLabel: string;
  currency: string;
  headline: string;
  moneyIn: number;
  moneyOut: number;
  net: number;
  openingCash: number | null;
  closingCash: number | null;
  previous: { month: string; monthLabel: string; moneyIn: number; moneyOut: number; net: number } | null;
  sources: ReportCategory[];
  uses: ReportCategory[];
  activities: Array<{ key: ActivityKey; label: string; explain: string; moneyIn: number; moneyOut: number; net: number }>;
  topPayers: Array<{ name: string; amount: number }>;
  topPayees: Array<{ name: string; amount: number }>;
  keyPoints: KeyPoint[];
};

/* ---------------- categories ---------------- */

const IN: Record<string, CategoryDef> = {
  customers: {
    key: "customers",
    label: "Customers paying us",
    explain: "Money received from customers for our work and sales.",
    activity: "business",
  },
  otherIncome: {
    key: "otherIncome",
    label: "Other income",
    explain: "Income not from main sales, for example bank profit or interest.",
    activity: "business",
  },
  refunds: {
    key: "refunds",
    label: "Refunds received",
    explain: "Money that suppliers or others paid back to us.",
    activity: "business",
  },
  taxRefund: {
    key: "taxRefund",
    label: "Tax refunds",
    explain: "Tax money that the government paid back.",
    activity: "business",
  },
  advancesBack: {
    key: "advancesBack",
    label: "Advances and deposits returned",
    explain: "Advances or security deposits that came back to us.",
    activity: "business",
  },
  loansIn: {
    key: "loansIn",
    label: "Loans received",
    explain: "Borrowed money. It is not earned and must be paid back.",
    activity: "financing",
  },
  ownersIn: {
    key: "ownersIn",
    label: "Money from owners / investors",
    explain: "New money put into the company by owners or investors.",
    activity: "financing",
  },
  assetSale: {
    key: "assetSale",
    label: "Sale of company assets",
    explain: "Money from selling equipment, vehicles or other assets.",
    activity: "assets",
  },
  otherIn: {
    key: "otherIn",
    label: "Other money received",
    explain: "Receipts that do not fit the groups above.",
    activity: "business",
  },
};

const OUT: Record<string, CategoryDef> = {
  staff: {
    key: "staff",
    label: "Salaries and staff",
    explain: "Salaries, wages, bonuses and other staff payments.",
    activity: "business",
  },
  suppliers: {
    key: "suppliers",
    label: "Paying supplier bills",
    explain: "Payments against bills from suppliers and vendors.",
    activity: "business",
  },
  directCosts: {
    key: "directCosts",
    label: "Direct costs of sales",
    explain: "Costs directly linked to delivering our products or services.",
    activity: "business",
  },
  office: {
    key: "office",
    label: "Office, rent and utilities",
    explain: "Rent, electricity, internet, phone, repairs and office running.",
    activity: "business",
  },
  software: {
    key: "software",
    label: "Software and IT",
    explain: "Software subscriptions, hosting and IT services.",
    activity: "business",
  },
  professional: {
    key: "professional",
    label: "Professional and legal fees",
    explain: "Audit, legal, consultancy and accounting fees.",
    activity: "business",
  },
  marketing: {
    key: "marketing",
    label: "Marketing and sales",
    explain: "Advertising, promotion and sales costs.",
    activity: "business",
  },
  travel: {
    key: "travel",
    label: "Travel and transport",
    explain: "Travel, fuel, vehicles and delivery costs.",
    activity: "business",
  },
  taxes: {
    key: "taxes",
    label: "Taxes paid",
    explain: "Income tax, sales tax and withholding tax paid to the government.",
    activity: "business",
  },
  bankCharges: {
    key: "bankCharges",
    label: "Bank charges",
    explain: "Fees and charges taken by banks.",
    activity: "business",
  },
  creditCard: {
    key: "creditCard",
    label: "Credit card bills",
    explain: "Payments to clear company credit cards.",
    activity: "business",
  },
  advances: {
    key: "advances",
    label: "Advances and deposits paid",
    explain: "Advances to staff or suppliers and security deposits. Part may come back later.",
    activity: "business",
  },
  customerRefunds: {
    key: "customerRefunds",
    label: "Refunds to customers",
    explain: "Money paid back to customers.",
    activity: "business",
  },
  assets: {
    key: "assets",
    label: "Buying equipment and assets",
    explain: "Long-term purchases, for example computers, furniture or vehicles.",
    activity: "assets",
  },
  loanRepay: {
    key: "loanRepay",
    label: "Loan repayments",
    explain: "Money paid back against loans.",
    activity: "financing",
  },
  ownersOut: {
    key: "ownersOut",
    label: "Paid to owners",
    explain: "Dividends or money taken out by owners.",
    activity: "financing",
  },
  otherCosts: {
    key: "otherCosts",
    label: "Other running costs",
    explain: "Other day-to-day business expenses.",
    activity: "business",
  },
  otherOut: {
    key: "otherOut",
    label: "Other payments",
    explain: "Payments that do not fit the groups above.",
    activity: "business",
  },
};

const RX = {
  staff: /salar|wage|payroll|staff|bonus|employee|eobi|gratuity|provident|pf\b|commission|allowance|incentive|stipend|internship|\bintern\b/i,
  tax: /\btax(es|ation)?\b|\bgst\b|\bvat\b|\bfbr\b|withholding|\bwht\b|zakat/i,
  loan: /loan|borrow|financ|mortgage|lease liabilit|overdraft|running finance/i,
  bank: /bank (charge|fee|commission)|bank service|service charge|transaction fee/i,
  office: /rent|office|utilit|electric|power|gas\b|water|internet|phone|telephone|mobile|repair|maintenance|cleaning|security|stationery|printing|postage|courier|insurance|kitchen|generator/i,
  software: /software|subscription|hosting|cloud|server|domain|saas|license|licence|\bit\b|computer expense/i,
  professional: /professional|legal|audit|consult|accounting fee|advisory|lawyer|attorney/i,
  marketing: /marketing|advert|promotion|campaign|seo|social media|branding|event/i,
  travel: /travel|taxi|uber|careem|indrive|fuel|petrol|vehicle|transport|conveyance|car\b|airfare|hotel|lodging|delivery|freight|shipping/i,
  advance: /advance|deposit|prepaid|prepayment|loan to|receivable from employee|staff loan/i,
  undeposited: /undeposited/i,
};

function isType(h: HeadLike, ...types: string[]) {
  return types.includes(h.accountType);
}

function categoryForInflow(h: HeadLike): CategoryDef {
  const name = h.accountName;
  const sub = h.accountSubType;
  if (isType(h, "Income") || isType(h, "Accounts Receivable") || RX.undeposited.test(name) || sub === "UndepositedFunds")
    return IN.customers;
  if (isType(h, "Other Income")) return IN.otherIncome;
  if (isType(h, "Equity")) return IN.ownersIn;
  if (isType(h, "Long Term Liability") || isType(h, "Credit Card")) return IN.loansIn;
  if (isType(h, "Other Current Liability") && (RX.loan.test(name) || /Loan/i.test(sub))) return IN.loansIn;
  if (RX.tax.test(name) || /Tax/i.test(sub)) return IN.taxRefund;
  if (isType(h, "Fixed Asset", "Other Asset")) return IN.assetSale;
  if (isType(h, "Other Current Asset")) return IN.advancesBack;
  if (isType(h, "Accounts Payable", "Expense", "Other Expense", "Cost of Goods Sold")) return IN.refunds;
  return IN.otherIn;
}

function categoryForOutflow(h: HeadLike): CategoryDef {
  const name = h.accountName;
  const sub = h.accountSubType;

  if (isType(h, "Accounts Payable")) return OUT.suppliers;
  if (isType(h, "Credit Card")) return OUT.creditCard;
  if (isType(h, "Equity")) return OUT.ownersOut;
  if (isType(h, "Fixed Asset", "Other Asset")) return OUT.assets;
  if (isType(h, "Accounts Receivable")) return OUT.customerRefunds;
  if (isType(h, "Income", "Other Income")) return OUT.customerRefunds;
  if (isType(h, "Long Term Liability")) return OUT.loanRepay;

  if (isType(h, "Other Current Liability")) {
    if (RX.staff.test(name) || /Payroll/i.test(sub)) return OUT.staff;
    if (RX.tax.test(name) || /Tax/i.test(sub)) return OUT.taxes;
    if (RX.loan.test(name) || /Loan/i.test(sub)) return OUT.loanRepay;
    return OUT.otherOut;
  }

  if (isType(h, "Other Current Asset")) return RX.advance.test(name) || RX.staff.test(name) ? OUT.advances : OUT.otherOut;

  if (isType(h, "Expense", "Other Expense", "Cost of Goods Sold")) {
    if (RX.staff.test(name)) return OUT.staff;
    if (RX.bank.test(name)) return OUT.bankCharges;
    if (RX.tax.test(name)) return OUT.taxes;
    if (RX.software.test(name)) return OUT.software;
    if (RX.professional.test(name)) return OUT.professional;
    if (RX.marketing.test(name)) return OUT.marketing;
    if (RX.travel.test(name)) return OUT.travel;
    if (RX.office.test(name)) return OUT.office;
    if (isType(h, "Cost of Goods Sold")) return OUT.directCosts;
    return OUT.otherCosts;
  }

  return OUT.otherOut;
}

/* ---------------- helpers ---------------- */

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function monthLabel(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return `${MONTHS[(m || 1) - 1]} ${y}`;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export function formatAmount(currency: string, n: number) {
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  const sym = currency === "PKR" ? "Rs" : currency === "USD" ? "$" : currency;
  if (abs >= 1_000_000) return `${sign}${sym} ${(abs / 1_000_000).toFixed(abs >= 10_000_000 ? 1 : 2)}M`;
  if (abs >= 1_000) return `${sign}${sym} ${Math.round(abs / 1_000).toLocaleString("en")}K`;
  return `${sign}${sym} ${Math.round(abs).toLocaleString("en")}`;
}

function pct(n: number) {
  return `${Math.round(n * 100)}%`;
}

function groupCategories(
  heads: HeadLike[],
  pick: (h: HeadLike) => CategoryDef,
  total: number,
  prevHeads: HeadLike[] | null
): ReportCategory[] {
  const map = new Map<string, ReportCategory & { names: Map<string, number> }>();

  for (const h of heads) {
    const def = pick(h);
    let c = map.get(def.key);
    if (!c) {
      c = { ...def, amount: 0, share: 0, prevAmount: null, topNames: [], heads: [], names: new Map() };
      map.set(def.key, c);
    }
    c.amount += h.amount;
    c.heads.push({ accountName: h.accountName, amount: h.amount });
    for (const t of h.transactions) {
      const n = t.name?.trim();
      if (!n || n === "—") continue;
      c.names.set(n, (c.names.get(n) ?? 0) + t.amount);
    }
  }

  if (prevHeads) {
    const prevTotals = new Map<string, number>();
    for (const h of prevHeads) {
      const key = pick(h).key;
      prevTotals.set(key, (prevTotals.get(key) ?? 0) + h.amount);
    }
    for (const c of map.values()) c.prevAmount = round2(prevTotals.get(c.key) ?? 0);
  }

  return Array.from(map.values())
    .map(({ names, ...c }) => ({
      ...c,
      amount: round2(c.amount),
      share: total > 0 ? c.amount / total : 0,
      heads: c.heads.sort((a, b) => b.amount - a.amount),
      topNames: Array.from(names.entries())
        .map(([name, amount]) => ({ name, amount: round2(amount) }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 5),
    }))
    .sort((a, b) => b.amount - a.amount);
}

function topCounterparties(heads: HeadLike[], limit = 5) {
  const names = new Map<string, number>();
  for (const h of heads) {
    for (const t of h.transactions) {
      const n = t.name?.trim();
      if (!n || n === "—") continue;
      names.set(n, (names.get(n) ?? 0) + t.amount);
    }
  }
  return Array.from(names.entries())
    .map(([name, amount]) => ({ name, amount: round2(amount) }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, limit);
}

function changeText(now: number, before: number) {
  if (before <= 0) return null;
  const ch = (now - before) / before;
  if (Math.abs(ch) < 0.05) return "about the same as";
  return `${pct(Math.abs(ch))} ${ch > 0 ? "more than" : "less than"}`;
}

/* ---------------- report ---------------- */

const ACTIVITY_INFO: Record<ActivityKey, { label: string; explain: string }> = {
  business: {
    label: "Running the business",
    explain: "Cash from customers minus cash spent on staff, suppliers and expenses.",
  },
  assets: {
    label: "Buying and selling assets",
    explain: "Cash spent on long-term items such as equipment, or received from selling them.",
  },
  financing: {
    label: "Loans and owners",
    explain: "Cash from borrowing or owners, and cash paid back to lenders or owners.",
  },
};

export function buildDirectorReport(input: {
  month: string;
  currency: string;
  current: MonthLike;
  previous: (MonthLike & { month: string }) | null;
  openingCash: number | null;
  closingCash: number | null;
}): DirectorReport {
  const { month, currency: cur, current, previous, openingCash, closingCash } = input;
  const moneyIn = current.totals.inflow;
  const moneyOut = current.totals.outflow;
  const net = current.totals.net;
  const label = monthLabel(month);
  const f = (n: number) => formatAmount(cur, n);

  const sources = groupCategories(current.inflows, categoryForInflow, moneyIn, previous?.inflows ?? null);
  const uses = groupCategories(current.outflows, categoryForOutflow, moneyOut, previous?.outflows ?? null);

  const activities = (Object.keys(ACTIVITY_INFO) as ActivityKey[]).map((key) => {
    const i = sources.filter((c) => c.activity === key).reduce((s, c) => s + c.amount, 0);
    const o = uses.filter((c) => c.activity === key).reduce((s, c) => s + c.amount, 0);
    return { key, ...ACTIVITY_INFO[key], moneyIn: round2(i), moneyOut: round2(o), net: round2(i - o) };
  });

  const customerHeads = current.inflows.filter((h) => categoryForInflow(h).key === "customers");
  const supplierLikeHeads = current.outflows.filter((h) => {
    const k = categoryForOutflow(h).key;
    return k !== "staff" && k !== "taxes" && k !== "bankCharges";
  });
  const topPayers = topCounterparties(customerHeads);
  const topPayees = topCounterparties(supplierLikeHeads);

  /* headline */
  let headline: string;
  if (moneyIn === 0 && moneyOut === 0) {
    headline = `No money came in or went out of the bank and cash accounts in ${label}.`;
  } else if (net >= 0) {
    headline = `In ${label} the company received ${f(moneyIn)} and spent ${f(moneyOut)}. Cash went up by ${f(net)}.`;
  } else {
    headline = `In ${label} the company received ${f(moneyIn)} and spent ${f(moneyOut)}. Cash went down by ${f(-net)}.`;
  }

  /* key points */
  const points: KeyPoint[] = [];
  const business = activities.find((a) => a.key === "business")!;
  const financing = activities.find((a) => a.key === "financing")!;
  const assets = activities.find((a) => a.key === "assets")!;

  if (business.moneyIn || business.moneyOut) {
    if (business.net >= 0) {
      points.push({
        tone: "good",
        text: `The day-to-day business brought in ${f(business.net)} more than it spent. The core business paid for itself this month.`,
      });
    } else {
      const coveredBy =
        financing.net > 0
          ? "loans or owner money"
          : openingCash != null && openingCash > 0
          ? "cash that was already in the bank"
          : "other sources";
      points.push({
        tone: "watch",
        text: `The day-to-day business spent ${f(-business.net)} more than it brought in. This gap was paid from ${coveredBy}.`,
      });
    }
  }

  if (closingCash != null && business.moneyOut > 0) {
    const months = closingCash / business.moneyOut;
    if (closingCash <= 0) {
      points.push({ tone: "watch", text: `The bank and cash balance at the end of ${label} was ${f(closingCash)}.` });
    } else {
      points.push({
        tone: months < 3 ? "watch" : "good",
        text: `At this month's level of running costs, the cash at month end (${f(closingCash)}) would last about ${
          months >= 12 ? "a year or more" : `${months.toFixed(1)} months`
        }.`,
      });
    }
  }

  if (sources[0]) {
    points.push({
      tone: "info",
      text: `Most money came from "${sources[0].label.toLowerCase()}": ${f(sources[0].amount)} (${pct(sources[0].share)} of all money received).`,
    });
  }
  if (uses[0]) {
    points.push({
      tone: "info",
      text: `The biggest spending was "${uses[0].label.toLowerCase()}": ${f(uses[0].amount)} (${pct(uses[0].share)} of all money spent).`,
    });
  }

  const customerTotal = sources.find((c) => c.key === "customers")?.amount ?? 0;
  if (topPayers[0] && customerTotal > 0) {
    const share = topPayers[0].amount / customerTotal;
    if (share >= 0.4 && topPayers.length > 1) {
      points.push({
        tone: "watch",
        text: `One customer, ${topPayers[0].name}, paid ${pct(share)} of all customer money. The company depends a lot on this customer.`,
      });
    } else if (share >= 0.4) {
      points.push({ tone: "watch", text: `All customer money this month came from ${topPayers[0].name}.` });
    }
  }

  const loans = sources.find((c) => c.key === "loansIn");
  if (loans && loans.amount > 0) {
    points.push({
      tone: "watch",
      text: `${f(loans.amount)} came from loans. This is borrowed money, not income, and must be paid back.`,
    });
  }
  const owners = sources.find((c) => c.key === "ownersIn");
  if (owners && owners.amount > 0) {
    points.push({ tone: "info", text: `Owners or investors put ${f(owners.amount)} into the company.` });
  }
  if (assets.moneyOut > 0) {
    points.push({
      tone: "info",
      text: `${f(assets.moneyOut)} was spent on long-term assets such as equipment. This is an investment, not a running cost.`,
    });
  }

  if (previous) {
    const inCh = changeText(moneyIn, previous.totals.inflow);
    const outCh = changeText(moneyOut, previous.totals.outflow);
    const prevLabel = monthLabel(previous.month);
    if (inCh && outCh) {
      points.push({
        tone: "info",
        text: `Compared with ${prevLabel}: money received was ${inCh} last month, and spending was ${outCh} last month.`,
      });
    }
    const bigRise = uses
      .filter((c) => c.activity === "business" && c.prevAmount != null && c.amount - (c.prevAmount ?? 0) > Math.max(moneyOut * 0.05, 1))
      .sort((a, b) => b.amount - (b.prevAmount ?? 0) - (a.amount - (a.prevAmount ?? 0)))[0];
    if (bigRise) {
      points.push({
        tone: "watch",
        text: `Spending on "${bigRise.label.toLowerCase()}" went up by ${f(bigRise.amount - (bigRise.prevAmount ?? 0))} compared with ${prevLabel}.`,
      });
    }
  }

  if (current.totals.reversedCount > 0) {
    points.push({
      tone: "info",
      text: `${current.totals.reversedCount} failed payment${current.totals.reversedCount === 1 ? "" : "s"} or returned cheque${
        current.totals.reversedCount === 1 ? "" : "s"
      } (${f(current.totals.reversedAmount)}) went in and out again. They are not counted above.`,
    });
  }

  return {
    month,
    monthLabel: label,
    currency: cur,
    headline,
    moneyIn,
    moneyOut,
    net,
    openingCash,
    closingCash,
    previous: previous
      ? {
          month: previous.month,
          monthLabel: monthLabel(previous.month),
          moneyIn: previous.totals.inflow,
          moneyOut: previous.totals.outflow,
          net: previous.totals.net,
        }
      : null,
    sources,
    uses,
    activities,
    topPayers,
    topPayees,
    keyPoints: points,
  };
}
