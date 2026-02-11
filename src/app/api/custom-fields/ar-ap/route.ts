// src/app/api/custom-fields/ar-ap/route.ts
import { NextResponse } from "next/server";
import { Pool } from "pg";

export const dynamic = "force-dynamic";

function ymdOrToday(v: string | null) {
  if (v && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  return new Date().toISOString().slice(0, 10);
}

function cleanText(v: any) {
  return String(v ?? "").trim();
}

function toNumber(v: any) {
  const n = Number(String(v ?? "").replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}

function bad(msg: string, status = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const company = cleanText(searchParams.get("company") ?? "RTC League Pvt LTD");
    const module = cleanText(searchParams.get("module") ?? "ar_ap");
    const asOf = ymdOrToday(searchParams.get("asOf"));
    const sectionRaw = cleanText(searchParams.get("section")); // optional

    const params: any[] = [company, module, asOf];
    let where = `company = $1 AND module = $2 AND as_of = $3`;

    if (sectionRaw) {
      const section = sectionRaw.toLowerCase();
      if (section !== "payables" && section !== "receivables") {
        return bad("Invalid section. Use 'payables' or 'receivables'.");
      }
      params.push(section);
      where += ` AND section = $4`;
    }

    const r = await pool.query(
      `
      SELECT id, company, module, as_of, section, label, amount, notes, created_at
      FROM public.dashboard_custom_fields
      WHERE ${where}
      ORDER BY created_at DESC
      `,
      params
    );

    return NextResponse.json({ ok: true, rows: r.rows });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    const company = cleanText(body.company ?? "RTC League Pvt LTD");
    const module = cleanText(body.module ?? "ar_ap");
    const asOf = ymdOrToday(body.asOf ?? body.as_of ?? null);

    const section = cleanText(body.section).toLowerCase();
    if (section !== "payables" && section !== "receivables") {
      return bad("Invalid section. Use 'payables' or 'receivables'.");
    }

    const label = cleanText(body.label);
    if (!label) return bad("Label is required.");

    // ✅ DB column is "amount" (numeric)
    const amount = toNumber(body.amount);
    const notes = cleanText(body.notes ?? "");

    const r = await pool.query(
      `
      INSERT INTO public.dashboard_custom_fields
        (company, module, as_of, section, label, amount, notes)
      VALUES
        ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, company, module, as_of, section, label, amount, notes, created_at
      `,
      [company, module, asOf, section, label, amount, notes || null]
    );

    return NextResponse.json({ ok: true, row: r.rows[0] });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = cleanText(searchParams.get("id"));
    if (!id) return bad("Missing id");

    await pool.query(`DELETE FROM public.dashboard_custom_fields WHERE id = $1`, [id]);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
