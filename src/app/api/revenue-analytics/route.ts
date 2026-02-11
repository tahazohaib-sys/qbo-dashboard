import { NextResponse } from "next/server";
import { google } from "googleapis";

function mustEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function normalizePrivateKey(raw: string) {
  let k = raw.trim();
  if ((k.startsWith('"') && k.endsWith('"')) || (k.startsWith("'") && k.endsWith("'"))) {
    k = k.slice(1, -1);
  }
  return k.replace(/\\n/g, "\n");
}

// Sheet columns expected:
// A Source | B Team | C Type | D Month | E Incoming | F Outgoing | G Net | H Company
function toNum(x: any) {
  const n = Number(String(x ?? "").replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}

function parseCsv(param: string | null) {
  if (!param) return [];
  return param
    .split(",")
    .map((s) => decodeURIComponent(s).trim())
    .filter(Boolean);
}

function applyFilter(list: string[], mode: "include" | "exclude", value: string) {
  if (!list.length) return true; // empty list = ALL
  const hit = list.includes(value);
  return mode === "include" ? hit : !hit;
}

function ymSort(a: string, b: string) {
  // expects "YYYY/MM" or "YYYY-MM"
  const norm = (x: string) => x.replace("-", "/");
  return norm(a).localeCompare(norm(b));
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);

    const months = parseCsv(url.searchParams.get("months"));
    const companies = parseCsv(url.searchParams.get("companies"));
    const sources = parseCsv(url.searchParams.get("sources"));

    const months_mode = (url.searchParams.get("months_mode") as any) === "exclude" ? "exclude" : "include";
    const companies_mode = (url.searchParams.get("companies_mode") as any) === "exclude" ? "exclude" : "include";
    const sources_mode = (url.searchParams.get("sources_mode") as any) === "exclude" ? "exclude" : "include";

    const client_email = mustEnv("GSHEETS_SA_CLIENT_EMAIL");
    const private_key = normalizePrivateKey(mustEnv("GSHEETS_SA_PRIVATE_KEY"));
    const spreadsheetId = mustEnv("GSHEETS_SHEET_ID");
    const tabName = process.env.GSHEETS_TAB_NAME || "Team Monthly Report";

    const currencySymbol = process.env.REVENUE_CURRENCY_SYMBOL || "$";

    const auth = new google.auth.JWT({
      email: client_email,
      key: private_key,
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    });

    const sheets = google.sheets({ version: "v4", auth });
    const range = `${tabName}!A:H`;
    const resp = await sheets.spreadsheets.values.get({ spreadsheetId, range });
    const values = resp.data.values || [];

    if (values.length <= 1) {
      return NextResponse.json({
        ok: true,
        currencySymbol,
        filters: { months: [], companies: [], sources: [] },
        selected: { months: [], companies: [], sources: [], months_mode, companies_mode, sources_mode },
        rawCount: 0,
        filteredCount: 0,
        monthTotals: [],
        growthSeries: [],
        growthTable: [],
        churnVsGrowth: [],
        churnDetails: [],
        teamRevenue: [],
      });
    }

    const header = values[0].map((x) => String(x ?? "").trim());
    const rowsRaw = values.slice(1);

    const idx = (name: string) => header.findIndex((h) => h.toLowerCase() === name.toLowerCase());
    const iSource = idx("Source");
    const iTeam = idx("Team");
    const iMonth = idx("Month");
    const iIncoming = idx("Incoming");
    const iNet = idx("Net");
    const iCompany = idx("Company");

    const get = (r: any[], i: number, fallbackI: number) => r[i >= 0 ? i : fallbackI];

    const allRows = rowsRaw.map((r) => {
      const source = String(get(r, iSource, 0) ?? "").trim();
      const team = String(get(r, iTeam, 1) ?? "").trim();
      const month = String(get(r, iMonth, 3) ?? "").trim();
      const incoming = toNum(get(r, iIncoming, 4));
      const net = toNum(get(r, iNet, 6));
      const company = String(get(r, iCompany, 7) ?? "").trim();

      // Revenue definition: use Net if present else Incoming
      const revenue = net || incoming;

      return {
        month,
        company,
        source,
        team,
        customer: team, // no explicit customer col; using Team
        revenue,
      };
    });

    // slicer options from ALL rows
    const filtersMonths = Array.from(new Set(allRows.map((x) => x.month).filter(Boolean))).sort(ymSort);
    const filtersCompanies = Array.from(new Set(allRows.map((x) => x.company).filter(Boolean))).sort((a, b) =>
      a.localeCompare(b)
    );
    const filtersSources = Array.from(new Set(allRows.map((x) => x.source).filter(Boolean))).sort((a, b) =>
      a.localeCompare(b)
    );

    // apply slicers
    const filteredRows = allRows.filter((r) => {
      const mOk = applyFilter(months, months_mode, r.month);
      const cOk = applyFilter(companies, companies_mode, r.company);
      const sOk = applyFilter(sources, sources_mode, r.source);
      return mOk && cOk && sOk;
    });

    const rawCount = allRows.length;
    const filteredCount = filteredRows.length;

    // monthTotals
    const monthTotalsMap = new Map<string, number>();
    for (const r of filteredRows) {
      if (!r.month) continue;
      monthTotalsMap.set(r.month, (monthTotalsMap.get(r.month) ?? 0) + (r.revenue ?? 0));
    }
    const monthTotals = Array.from(monthTotalsMap.entries())
      .map(([month, totalRevenue]) => ({ month, totalRevenue }))
      .sort((a, b) => ymSort(a.month, b.month));

    const monthTotalLookup = new Map(monthTotals.map((x) => [x.month, x.totalRevenue] as const));

    // monthlyCompany totals (used for growthSeries + growthTable)
    const mcMap = new Map<string, number>(); // `${month}||${company}`
    for (const r of filteredRows) {
      if (!r.month || !r.company) continue;
      const key = `${r.month}||${r.company}`;
      mcMap.set(key, (mcMap.get(key) ?? 0) + (r.revenue ?? 0));
    }

    const monthlyCompany = Array.from(mcMap.entries())
      .map(([key, revenue]) => {
        const [month, company] = key.split("||");
        return { month, company, revenue, totalRevenue: monthTotalLookup.get(month) ?? 0 };
      })
      .sort((a, b) => (a.month === b.month ? a.company.localeCompare(b.company) : ymSort(a.month, b.month)));

    // growthSeries (line chart)
    const growthSeriesMap = new Map<string, Record<string, any>>();
    for (const row of monthlyCompany) {
      if (!growthSeriesMap.has(row.month)) {
        growthSeriesMap.set(row.month, { month: row.month, totalRevenue: monthTotalLookup.get(row.month) ?? 0 });
      }
      const obj = growthSeriesMap.get(row.month)!;
      obj[row.company] = (obj[row.company] ?? 0) + row.revenue;
    }
    const growthSeries = Array.from(growthSeriesMap.values()).sort((a, b) => ymSort(a.month, b.month));

    // growthTable
    const monthsSorted = Array.from(new Set(monthlyCompany.map((x) => x.month))).sort(ymSort);
    const companiesSorted = Array.from(new Set(monthlyCompany.map((x) => x.company))).sort((a, b) =>
      a.localeCompare(b)
    );

    const revLookup = new Map<string, number>(); // `${month}||${company}` => revenue
    for (const r of monthlyCompany) revLookup.set(`${r.month}||${r.company}`, r.revenue);

    const growthTable: Array<{
      month: string;
      company: string;
      revenue: number;
      prevRevenue: number;
      change: number;
      changePct: number;
      totalRevenue: number;
      prevTotalRevenue: number;
      totalChange: number;
      totalChangePct: number;
    }> = [];

    for (let mi = 0; mi < monthsSorted.length; mi++) {
      const month = monthsSorted[mi];
      const prevMonth = mi > 0 ? monthsSorted[mi - 1] : null;

      const totalRevenue = monthTotalLookup.get(month) ?? 0;
      const prevTotalRevenue = prevMonth ? monthTotalLookup.get(prevMonth) ?? 0 : 0;
      const totalChange = totalRevenue - prevTotalRevenue;
      const totalChangePct = prevTotalRevenue ? totalChange / prevTotalRevenue : 0;

      for (const company of companiesSorted) {
        const revenue = revLookup.get(`${month}||${company}`) ?? 0;
        const prevRevenue = prevMonth ? revLookup.get(`${prevMonth}||${company}`) ?? 0 : 0;

        const change = revenue - prevRevenue;
        const changePct = prevRevenue ? change / prevRevenue : 0;

        if (revenue === 0 && prevRevenue === 0) continue;

        growthTable.push({
          month,
          company,
          revenue,
          prevRevenue,
          change,
          changePct,
          totalRevenue,
          prevTotalRevenue,
          totalChange,
          totalChangePct,
        });
      }
    }

    // churn (company-wise, month-wise) + details for row-click drill
    const mcc = new Map<string, Map<string, Map<string, number>>>(); // month -> company -> customer -> revenue
    for (const r of filteredRows) {
      if (!r.month || !r.company || !r.customer) continue;
      if (!mcc.has(r.month)) mcc.set(r.month, new Map());
      const cMap = mcc.get(r.month)!;
      if (!cMap.has(r.company)) cMap.set(r.company, new Map());
      const custMap = cMap.get(r.company)!;
      custMap.set(r.customer, (custMap.get(r.customer) ?? 0) + (r.revenue ?? 0));
    }

    const churnDetails: any[] = [];
    const churnVsGrowth: any[] = [];

    for (let mi = 0; mi < monthsSorted.length; mi++) {
      const month = monthsSorted[mi];
      const prevMonth = mi > 0 ? monthsSorted[mi - 1] : null;

      for (const company of companiesSorted) {
        const curCust = mcc.get(month)?.get(company) ?? new Map<string, number>();
        const prevCust = prevMonth ? mcc.get(prevMonth)?.get(company) ?? new Map<string, number>() : new Map<
          string,
          number
        >();

        const currentTotal = Array.from(curCust.values()).reduce((s, x) => s + x, 0);
        const prevTotal = Array.from(prevCust.values()).reduce((s, x) => s + x, 0);

        const lostCustomers: Array<{ customer: string; lastMonthRevenue: number }> = [];
        const addedCustomers: Array<{ customer: string; currentMonthRevenue: number }> = [];
        const expansionCustomers: Array<{ customer: string; prevMonthRevenue: number; currentMonthRevenue: number; delta: number }> = [];
        const contractionCustomers: Array<{
          customer: string;
          prevMonthRevenue: number;
          currentMonthRevenue: number;
          delta: number;
        }> = [];

        if (prevMonth) {
          for (const [cust, prevRev] of prevCust.entries()) {
            if (!curCust.has(cust)) lostCustomers.push({ customer: cust, lastMonthRevenue: prevRev });
          }
          for (const [cust, curRev] of curCust.entries()) {
            if (!prevCust.has(cust)) addedCustomers.push({ customer: cust, currentMonthRevenue: curRev });
          }
          for (const [cust, curRev] of curCust.entries()) {
            if (!prevCust.has(cust)) continue;
            const prevRev = prevCust.get(cust) ?? 0;
            const delta = curRev - prevRev;
            if (delta > 0) {
              expansionCustomers.push({ customer: cust, prevMonthRevenue: prevRev, currentMonthRevenue: curRev, delta });
            } else if (delta < 0) {
              contractionCustomers.push({ customer: cust, prevMonthRevenue: prevRev, currentMonthRevenue: curRev, delta });
            }
          }
        }

        const lostRevenue = lostCustomers.reduce((s, x) => s + (x.lastMonthRevenue ?? 0), 0);
        const addedRevenue = addedCustomers.reduce((s, x) => s + (x.currentMonthRevenue ?? 0), 0);
        const expansionRevenue = expansionCustomers.reduce((s, x) => s + (x.delta ?? 0), 0);
        const contractionRevenue = contractionCustomers.reduce((s, x) => s + Math.abs(x.delta ?? 0), 0);
        const existingCustomerDelta = expansionRevenue - contractionRevenue;
        const netRevenueDelta = currentTotal - prevTotal;

        const churnRate = prevTotal ? lostRevenue / prevTotal : 0;
        const growthRate = prevTotal ? netRevenueDelta / prevTotal : 0;

        if (currentTotal === 0 && prevTotal === 0) continue;

        const detailRow = {
          company,
          month,
          prevMonth,
          prevTotal,
          currentTotal,
          lostRevenue,
          addedRevenue,
          expansionRevenue,
          contractionRevenue,
          existingCustomerDelta,
          netRevenueDelta,
          churnRate,
          growthRate,
          lostCustomers: lostCustomers.sort((a, b) => (b.lastMonthRevenue ?? 0) - (a.lastMonthRevenue ?? 0)),
          addedCustomers: addedCustomers.sort((a, b) => (b.currentMonthRevenue ?? 0) - (a.currentMonthRevenue ?? 0)),
          expansionCustomers: expansionCustomers.sort((a, b) => (b.delta ?? 0) - (a.delta ?? 0)),
          contractionCustomers: contractionCustomers.sort((a, b) => Math.abs(b.delta ?? 0) - Math.abs(a.delta ?? 0)),
        };

        churnDetails.push(detailRow);
        churnVsGrowth.push({
          company,
          month,
          prevMonth,
          prevTotal,
          currentTotal,
          lostRevenue,
          addedRevenue,
          expansionRevenue,
          contractionRevenue,
          existingCustomerDelta,
          netRevenueDelta,
          churnRate,
          growthRate,
        });
      }
    }

    // teamRevenue (STRICTLY slicer-driven): aggregate across ALL filtered rows
    const teamRevenueMap = new Map<string, number>();
    for (const r of filteredRows) {
      const key = (r.customer || r.team || "").trim();
      if (!key) continue;
      teamRevenueMap.set(key, (teamRevenueMap.get(key) ?? 0) + (r.revenue ?? 0));
    }
    const teamRevenue = Array.from(teamRevenueMap.entries())
      .map(([team, revenue]) => ({ team, revenue }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 20);

    return NextResponse.json({
      ok: true,
      currencySymbol,
      filters: { months: filtersMonths, companies: filtersCompanies, sources: filtersSources },
      selected: { months, companies, sources, months_mode, companies_mode, sources_mode },
      rawCount,
      filteredCount,
      monthTotals,
      growthSeries,
      growthTable,
      churnVsGrowth,
      churnDetails,
      teamRevenue,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}
