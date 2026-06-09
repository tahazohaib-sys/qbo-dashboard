import crypto from "crypto";
import { query } from "@/lib/db";
import { createRawToken, hashToken } from "@/lib/auth";

export type DashboardUserStatus = "email_pending" | "approval_pending" | "approved" | "rejected";

export type DashboardUser = {
  id: string;
  email: string;
  password_hash: string;
  status: DashboardUserStatus;
  email_verified_at: Date | null;
};

export async function ensureAuthTables() {
  await query(`
    create table if not exists dashboard_users (
      id text primary key,
      email text not null unique,
      password_hash text not null,
      status text not null default 'email_pending',
      email_verified_at timestamptz,
      approved_at timestamptz,
      rejected_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `);

  await query(`
    create table if not exists dashboard_auth_tokens (
      token_hash text primary key,
      user_id text not null references dashboard_users(id) on delete cascade,
      token_type text not null,
      expires_at timestamptz not null,
      consumed_at timestamptz,
      created_at timestamptz not null default now()
    )
  `);

  await query(`create index if not exists dashboard_auth_tokens_user_idx on dashboard_auth_tokens(user_id)`);
}

export async function findUserByEmail(email: string): Promise<DashboardUser | null> {
  await ensureAuthTables();
  const { rows } = await query<DashboardUser>(
    `select id, email, password_hash, status, email_verified_at from dashboard_users where lower(email) = lower($1) limit 1`,
    [email]
  );
  return rows[0] ?? null;
}

export async function findUserById(id: string): Promise<DashboardUser | null> {
  await ensureAuthTables();
  const { rows } = await query<DashboardUser>(
    `select id, email, password_hash, status, email_verified_at from dashboard_users where id = $1 limit 1`,
    [id]
  );
  return rows[0] ?? null;
}

export async function upsertPendingUser(email: string, passwordHash: string) {
  await ensureAuthTables();
  const id = crypto.randomUUID();
  const { rows } = await query<DashboardUser>(
    `
      insert into dashboard_users (id, email, password_hash, status, email_verified_at, approved_at, rejected_at, updated_at)
      values ($1, lower($2), $3, 'email_pending', null, null, null, now())
      on conflict (email) do update set
        password_hash = excluded.password_hash,
        status = case
          when dashboard_users.status = 'approved' then dashboard_users.status
          else 'email_pending'
        end,
        email_verified_at = case
          when dashboard_users.status = 'approved' then dashboard_users.email_verified_at
          else null
        end,
        approved_at = case
          when dashboard_users.status = 'approved' then dashboard_users.approved_at
          else null
        end,
        rejected_at = null,
        updated_at = now()
      returning id, email, password_hash, status, email_verified_at
    `,
    [id, email, passwordHash]
  );
  return rows[0];
}

export async function createAuthToken(userId: string, tokenType: "email_verify" | "approval", expiresInHours: number) {
  await ensureAuthTables();
  await query(
    `update dashboard_auth_tokens set consumed_at = now() where user_id = $1 and token_type = $2 and consumed_at is null`,
    [userId, tokenType]
  );

  const rawToken = createRawToken();
  await query(
    `
      insert into dashboard_auth_tokens (token_hash, user_id, token_type, expires_at)
      values ($1, $2, $3, now() + ($4 || ' hours')::interval)
    `,
    [hashToken(rawToken), userId, tokenType, expiresInHours]
  );
  return rawToken;
}

export async function consumeAuthToken(rawToken: string, tokenType: "email_verify" | "approval") {
  await ensureAuthTables();
  const hashed = hashToken(rawToken);
  const { rows } = await query<{ user_id: string }>(
    `
      update dashboard_auth_tokens
      set consumed_at = now()
      where token_hash = $1
        and token_type = $2
        and consumed_at is null
        and expires_at > now()
      returning user_id
    `,
    [hashed, tokenType]
  );
  return rows[0]?.user_id ?? null;
}

export async function markEmailVerified(userId: string) {
  await ensureAuthTables();
  const { rows } = await query<DashboardUser>(
    `
      update dashboard_users
      set status = case when status = 'approved' then 'approved' else 'approval_pending' end,
          email_verified_at = coalesce(email_verified_at, now()),
          rejected_at = null,
          updated_at = now()
      where id = $1
      returning id, email, password_hash, status, email_verified_at
    `,
    [userId]
  );
  return rows[0] ?? null;
}

export async function decideUserApproval(userId: string, decision: "approve" | "reject") {
  await ensureAuthTables();
  const nextStatus = decision === "approve" ? "approved" : "rejected";
  const { rows } = await query<DashboardUser>(
    `
      update dashboard_users
      set status = $2,
          approved_at = case when $2 = 'approved' then now() else approved_at end,
          rejected_at = case when $2 = 'rejected' then now() else null end,
          updated_at = now()
      where id = $1
      returning id, email, password_hash, status, email_verified_at
    `,
    [userId, nextStatus]
  );
  return rows[0] ?? null;
}
