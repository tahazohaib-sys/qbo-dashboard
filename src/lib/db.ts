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

// --- External balances + Plaid mappings helpers ---

export type PlaidMapping = {
  id: number;
  qbo_account_id: string;
  plaid_item_id: string;
  plaid_account_id: string;
  plaid_access_token: string;
  created_at: string;
};

export async function ensureBankTables() {
  await pool.query(`
    create table if not exists plaid_mappings (
      id serial primary key,
      qbo_account_id text not null,
      plaid_item_id text not null,
      plaid_account_id text not null,
      plaid_access_token text not null,
      created_at timestamptz default now(),
      unique (qbo_account_id)
    )
  `);

  await pool.query(`
    create table if not exists external_balances (
      id serial primary key,
      qbo_account_id text not null,
      balance numeric not null,
      available numeric,
      source text,
      fetched_at timestamptz default now(),
      unique (qbo_account_id)
    )
  `);
}

export async function upsertPlaidMapping(m: {
  qboAccountId: string;
  plaidItemId: string;
  plaidAccountId: string;
  plaidAccessToken: string;
}) {
  await ensureBankTables();
  const q = `
    insert into plaid_mappings (qbo_account_id, plaid_item_id, plaid_account_id, plaid_access_token)
    values ($1,$2,$3,$4)
    on conflict (qbo_account_id) do update set
      plaid_item_id = excluded.plaid_item_id,
      plaid_account_id = excluded.plaid_account_id,
      plaid_access_token = excluded.plaid_access_token
    returning id, qbo_account_id, plaid_item_id, plaid_account_id, plaid_access_token, created_at
  `;
  const { rows } = await pool.query(q, [m.qboAccountId, m.plaidItemId, m.plaidAccountId, m.plaidAccessToken]);
  return rows[0] as PlaidMapping;
}

export async function getPlaidMappings() {
  await ensureBankTables();
  const { rows } = await pool.query(`select id, qbo_account_id, plaid_item_id, plaid_account_id, plaid_access_token, created_at from plaid_mappings`);
  return rows as PlaidMapping[];
}

export async function upsertExternalBalance(qboAccountId: string, balance: number, available?: number, source = "plaid") {
  await ensureBankTables();
  const q = `
    insert into external_balances (qbo_account_id, balance, available, source)
    values ($1,$2,$3,$4)
    on conflict (qbo_account_id) do update set
      balance = excluded.balance,
      available = excluded.available,
      source = excluded.source,
      fetched_at = now()
    returning id, qbo_account_id, balance, available, source, fetched_at
  `;
  const { rows } = await pool.query(q, [qboAccountId, balance, available ?? null, source]);
  return rows[0];
}

export async function getExternalBalances(qboAccountIds: string[]) {
  await ensureBankTables();
  if (!qboAccountIds || qboAccountIds.length === 0) return [];
  const params = qboAccountIds.map((_, i) => `$${i + 1}`).join(",");
  const q = `select qbo_account_id, balance, available, source, fetched_at from external_balances where qbo_account_id in (${params})`;
  const { rows } = await pool.query(q, qboAccountIds);
  return rows as Array<{ qbo_account_id: string; balance: string; available: string | null; source: string; fetched_at: string }>;
}
