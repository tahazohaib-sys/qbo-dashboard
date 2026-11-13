// src/app/api/fx-rate/route.ts
//
// Market exchange rate USD -> PKR (PKR for 1 USD). See src/lib/fx-rate.ts for
// the sources. The dashboard lets the user type a different rate when all
// sources fail.
import { NextResponse } from "next/server";
import { getUsdPkrRate } from "@/lib/fx-rate";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const value = await getUsdPkrRate();
    return NextResponse.json({ ok: true, base: "USD", quote: "PKR", ...value });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
