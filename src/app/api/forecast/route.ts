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
  return Math.max(-0.5, Math.min(0.5, g));
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
    const currentCash: number | null =
      typeof body?.currentCash === "number" ? safeNum(body.currentCash) : null;

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
    const avgProfit = avgRevenue - avgOpex;
    const avgNetMarginPct = avgRevenue > 0 ? avgProfit / avgRevenue : 0;
    const expenseRatio = avgRevenue > 0 ? avgOpex / avgRevenue : null;

    const gRev = clampGrowth(averageMoMGrowth(revenues));
    const gExp = clampGrowth(averageMoMGrowth(expenses));

    const last = series[series.length - 1];

    // Scenario builder: rMul = revenue growth multiplier, eMul = expense growth multiplier
    function buildScenario(
      rMul: number,
      eMul: number
    ): Array<{
      month: string;
      revenue: number;
      opex: number;
      profit: number;
      profitMarginPct: number;
      cumulativeProfit: number;
    }> {
      let cumProfit = 0;
      return Array.from({ length: horizon }, (_, i) => {
        const revenue = last.revenue * Math.pow(1 + clampGrowth(gRev * rMul), i + 1);
        const opex = last.expenses * Math.pow(1 + clampGrowth(gExp * eMul), i + 1);
        const profit = revenue - opex;
        cumProfit += profit;
        return {
          month: addMonths(last.month, i + 1),
          revenue,
          opex,
          profit,
          profitMarginPct: revenue !== 0 ? profit / revenue : 0,
          cumulativeProfit: cumProfit,
        };
      });
    }

    const baseForecast = buildScenario(1.0, 1.0);
    const pessimisticForecast = buildScenario(0.5, 1.5);
    const optimisticForecast = buildScenario(1.5, 0.5);

    const breakevenRevenue = avgOpex;
    const revenueForMargin = (m: number) =>
      m >= 1 ? 0 : breakevenRevenue / (1 - m);

    // Months until base forecast first reaches break-even (profit >= 0)
    const beProfitIdx = baseForecast.findIndex((p) => p.profit >= 0);
    const monthsToBreakeven = beProfitIdx === -1 ? null : beProfitIdx + 1;

    // Cash runway
    const runwayMonths =
      currentCash !== null && avgOpex > 0 ? currentCash / avgOpex : null;

    // Summary metrics
    const firstFc = baseForecast[0];
    const lastFc = baseForecast[baseForecast.length - 1];
    const totalCumulativeProfit = lastFc?.cumulativeProfit ?? 0;

    const scenarioSummary = (rows: typeof baseForecast) => {
      const last = rows[rows.length - 1];
      return {
        endRevenue: last?.revenue ?? 0,
        endOpex: last?.opex ?? 0,
        endProfit: last?.profit ?? 0,
        totalProfit: last?.cumulativeProfit ?? 0,
        endMarginPct: last?.profitMarginPct ?? 0,
      };
    };

    return NextResponse.json({
      ok: true,
      horizon,
      meta: {
        monthsUsed,
        lastMonth: last.month,
        ...(currentCash !== null ? { currentCash } : {}),
      },
      trends: {
        revenueMoM: gRev,
        expensesMoM: gExp,
        revenueTrendLabel:
          gRev > 0.01 ? "Increasing" : gRev < -0.01 ? "Decreasing" : "Stable",
        expenseTrendLabel:
          gExp > 0.01 ? "Increasing" : gExp < -0.01 ? "Decreasing" : "Stable",
        expenseRatio,
      },
      averages: {
        avgMonthlyRevenue: avgRevenue,
        avgMonthlyOpex: avgOpex,
        avgMonthlyProfit: avgProfit,
        avgNetMarginPct,
      },
      benchmarks: {
        breakevenRevenue,
        margin10: revenueForMargin(0.1),
        margin20: revenueForMargin(0.2),
        margin30: revenueForMargin(0.3),
        monthsToBreakeven,
      },
      summary: {
        nextMonthRevenue: firstFc?.revenue ?? 0,
        nextMonthOpex: firstFc?.opex ?? 0,
        nextMonthProfit: firstFc?.profit ?? 0,
        endRevenue: lastFc?.revenue ?? 0,
        endOpex: lastFc?.opex ?? 0,
        endProfit: lastFc?.profit ?? 0,
        cumulativeProfit: totalCumulativeProfit,
        runwayMonths,
      },
      forecast: baseForecast,
      scenarios: {
        pessimistic: pessimisticForecast,
        base: baseForecast,
        optimistic: optimisticForecast,
        summary: {
          pessimistic: scenarioSummary(pessimisticForecast),
          base: scenarioSummary(baseForecast),
          optimistic: scenarioSummary(optimisticForecast),
        },
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Forecast error" });
  }
}
