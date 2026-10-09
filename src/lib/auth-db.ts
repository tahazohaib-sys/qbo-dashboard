import crypto from "crypto";
import { query } from "@/lib/db";
import { createRawToken, hashToken, isAdminEmail } from "@/lib/auth";

export type DashboardUserStatus = "approval_pending" | "approved" | "rejected";

export type DashboardUser = {
  id: string;
  email: string;
  password_hash: string | null;
  status: DashboardUserStatus;
  email_verified_at: Date | null;
};

export type DashboardAccessUser = DashboardUser & {
  approved_at: Date | null;
  rejected_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

export async function ensureAuthTables() {
  await query(`
    create table if not exists dashboard_users (
      id text primary key,
      email text not null unique,
      password_hash text,
      status text not null default 'approval_pending',
      email_verified_at timestamptz,
      approved_at timestamptz,
      rejected_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `);

  await query(`alter table dashboard_users alter column password_hash drop not null`);
  await query(`alter table dashboard_users alter column status set default 'approval_pending'`);

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

export async function ensureAdminUser(email: string) {
  await ensureAuthTables();
  if (!isAdminEmail(email)) return null;

  const id = crypto.randomUUID();
  const { rows } = await query<DashboardUser>(
    `
      insert into dashboard_users (id, email, password_hash, status, email_verified_at, approved_at, rejected_at, updated_at)
      values ($1, lower($2), null, 'approved', now(), now(), null, now())
      on conflict (email) do update set
        status = 'approved',
        email_verified_at = coalesce(dashboard_users.email_verified_at, now()),
        approved_at = coalesce(dashboard_users.approved_at, now()),
        rejected_at = null,
        updated_at = now()
      returning id, email, password_hash, status, email_verified_at
    `,
    [id, email]
  );
  return rows[0] ?? null;
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

export async function listDashboardAccessUsers() {
  await ensureAuthTables();
  const { rows } = await query<DashboardAccessUser>(
    `
      select id, email, password_hash, status, email_verified_at, approved_at, rejected_at, created_at, updated_at
      from dashboard_users
      order by
        case status when 'approval_pending' then 0 when 'approved' then 1 else 2 end,
        updated_at desc
    `
  );
  return rows;
}

export async function setDashboardUserStatus(userId: string, status: DashboardUserStatus) {
  await ensureAuthTables();
  const { rows } = await query<DashboardAccessUser>(
    `
      update dashboard_users
      set status = $2,
          approved_at = case when $2 = 'approved' then now() else approved_at end,
          rejected_at = case when $2 = 'rejected' then now() else null end,
          updated_at = now()
      where id = $1
      returning id, email, password_hash, status, email_verified_at, approved_at, rejected_at, created_at, updated_at
    `,
    [userId, status]
  );
  return rows[0] ?? null;
}

export async function upsertAccessRequest(email: string) {
  await ensureAuthTables();
  if (isAdminEmail(email)) return ensureAdminUser(email);

  const id = crypto.randomUUID();
  const { rows } = await query<DashboardUser>(
    `
      insert into dashboard_users (id, email, password_hash, status, email_verified_at, approved_at, rejected_at, updated_at)
      values ($1, lower($2), null, 'approval_pending', null, null, null, now())
      on conflict (email) do update set
        status = case
          when dashboard_users.status = 'approved' then dashboard_users.status
          else 'approval_pending'
        end,
        rejected_at = null,
        updated_at = now()
      returning id, email, password_hash, status, email_verified_at
    `,
    [id, email]
  );
  return rows[0];
}

export async function setUserPassword(userId: string, passwordHash: string) {
  await ensureAuthTables();
  const { rows } = await query<DashboardUser>(
    `
      update dashboard_users
      set password_hash = $2,
          updated_at = now()
      where id = $1
      returning id, email, password_hash, status, email_verified_at
    `,
    [userId, passwordHash]
  );
  return rows[0] ?? null;
}

type AuthTokenType = "approval" | "login_code";

export async function createAuthToken(userId: string, tokenType: AuthTokenType, expiresInHours: number) {
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

export async function createLoginVerificationCode(userId: string) {
  await ensureAuthTables();
  await query(
    `update dashboard_auth_tokens set consumed_at = now() where user_id = $1 and token_type = 'login_code' and consumed_at is null`,
    [userId]
  );

  const code = String(crypto.randomInt(100000, 1000000));
  await query(
    `
      insert into dashboard_auth_tokens (token_hash, user_id, token_type, expires_at)
      values ($1, $2, 'login_code', now() + interval '15 minutes')
    `,
    [hashToken(code), userId]
  );
  return code;
}

export async function consumeLoginVerificationCode(email: string, code: string) {
  await ensureAuthTables();
  const normalizedCode = code.replace(/\D/g, "");
  if (normalizedCode.length !== 6) return null;

  const user = await findUserByEmail(email);
  if (!user || user.status !== "approved") return null;

  const { rows } = await query<{ user_id: string }>(
    `
      update dashboard_auth_tokens
      set consumed_at = now()
      where token_hash = $1
        and user_id = $2
        and token_type = 'login_code'
        and consumed_at is null
        and expires_at > now()
      returning user_id
    `,
    [hashToken(normalizedCode), user.id]
  );
  return rows[0]?.user_id ? user : null;
}

export async function consumeAuthToken(rawToken: string, tokenType: AuthTokenType) {
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
