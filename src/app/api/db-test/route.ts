import { NextResponse } from "next/server";
import { Pool } from "pg";

export async function GET() {
  try {
    const conn = process.env.DATABASE_URL;

    if (!conn) {
      return NextResponse.json(
        { ok: false, error: "DATABASE_URL is missing" },
        { status: 500 }
      );
    }

    const pool = new Pool({
      connectionString: conn,
      ssl: { rejectUnauthorized: false },
    });

    const result = await pool.query("select now() as now");

    return NextResponse.json({
      ok: true,
      now: result.rows[0].now,
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err.message },
      { status: 500 }
    );
  }
}
