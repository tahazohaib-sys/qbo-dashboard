import { NextResponse } from "next/server";
import { Pool } from "pg";

export const dynamic = "force-dynamic";

export async function GET() {
  const url = process.env.DATABASE_URL;
  if (!url) return NextResponse.json({ ok: false, error: "DATABASE_URL missing" }, { status: 500 });

  const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });

  try {
    const db = await pool.query("select current_database() as db, current_user as usr, inet_server_addr() as host;");
    const cols = await pool.query(
      `select column_name, data_type
       from information_schema.columns
       where table_schema='public' and table_name='dashboard_custom_fields'
       order by ordinal_position`
    );

    return NextResponse.json({
      ok: true,
      connected: db.rows[0],
      columns: cols.rows,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Unknown error" }, { status: 500 });
  } finally {
    await pool.end();
  }
}
