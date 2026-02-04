import { NextResponse } from "next/server";

type SeriesPoint = {
  month: string;
  revenue: number;
  expenses: number;
};

function safeNum(x: any) {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Average MoM growth (no minimum months)
 */
function averageMoMGrowth(values: number[]) {
  if (!values || values.length < 2) return 0;

  let sum = 0;
  let cnt = 0;
  for (let i = 1; i < values.length; i++) {
    const prev = values[i - 1];
    const curr = values[i];
    if (!Number.isFinite(prev) || !Number.isFinite(curr) || prev === 0) continue;
    sum += (curr - prev) / prev;
    cnt++;
  }
  return cnt ? sum / cnt : 0;
}

function clampGrowth(g: number) {
  return Math.max(-0.5, Math.min(0.5, g)); // keep sane
}

function addMonths(ym: string, add: number) {
  const [y, m] = ym.split("-").map(Number);
  if (!y || !m) return `${ym}+${add}m`;
  const d = new Date(y, m - 1 + add, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const seriesRaw: SeriesPoint[] = Array.isArray(body?.series) ? body.series : [];
    const horizon = body?.horizon === 12 ? 12 : 6;

    if (!seriesRaw.length) {
      return NextResponse.json({ ok: false, error: "No data in selected range" });
    }

    const series = seriesRaw.map((x) => ({
      month: String(x.month),
      revenue: safeNum(x.revenue),
      expenses: safeNum(x.expenses),
    }));

    const monthsUsed = series.length;

    const revenues = series.map((x) => x.revenue);
    const expenses = series.map((x) => x.expenses);

    const avgRevenue = revenues.reduce((a, b) => a + b, 0) / monthsUsed;
    const avgOpex = expenses.reduce((a, b) => a + b, 0) / monthsUsed;

    const gRev = clampGrowth(averageMoMGrowth(revenues));
    const gExp = clampGrowth(averageMoMGrowth(expenses));

    const last = series[series.length - 1];

    const forecast = [];
    for (let i = 1; i <= horizon; i++) {
      const revenue = last.revenue * Math.pow(1 + gRev, i);
      const opex = last.expenses * Math.pow(1 + gExp, i);
      forecast.push({
        month: addMonths(last.month, i),
        revenue,
        opex,
        profit: revenue - opex,
      });
    }

    const breakevenRevenue = avgOpex;

    const revenueForMargin = (m: number) =>
      m >= 1 ? 0 : breakevenRevenue / (1 - m);

    return NextResponse.json({
      ok: true,
      horizon,
      meta: { monthsUsed },
      trends: {
        revenueMoM: gRev,
        expensesMoM: gExp,
      },
      averages: {
        avgMonthlyRevenue: avgRevenue,
        avgMonthlyOpex: avgOpex,
        avgMonthlyProfit: avgRevenue - avgOpex,
      },
      benchmarks: {
        breakevenRevenue,
        margin10: revenueForMargin(0.1),
        margin20: revenueForMargin(0.2),
        margin30: revenueForMargin(0.3),
      },
      forecast,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Forecast error" });
  }
}
