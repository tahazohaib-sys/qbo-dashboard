import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined,
});

export type StoredTokens = {
  realmId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: string; // ISO string
};

export async function saveTokens(t: StoredTokens) {
  const q = `
    insert into qbo_tokens (id, realm_id, access_token, refresh_token, expires_at)
    values (1, $1, $2, $3, $4)
    on conflict (id) do update set
      realm_id = excluded.realm_id,
      access_token = excluded.access_token,
      refresh_token = excluded.refresh_token,
      expires_at = excluded.expires_at
  `;
  await pool.query(q, [t.realmId, t.accessToken, t.refreshToken, t.expiresAt]);
}

export async function getTokens(): Promise<StoredTokens | null> {
  const { rows } = await pool.query(
    `select realm_id, access_token, refresh_token, expires_at from qbo_tokens where id = 1 limit 1`
  );
  if (!rows?.length) return null;

  const r = rows[0];
  if (!r.realm_id || !r.access_token || !r.refresh_token || !r.expires_at) return null;

  return {
    realmId: r.realm_id,
    accessToken: r.access_token,
    refreshToken: r.refresh_token,
    expiresAt: new Date(r.expires_at).toISOString(),
  };
}
