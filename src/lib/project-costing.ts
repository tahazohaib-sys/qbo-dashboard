// Project Costing module: data sources and storage.
//
// - Employees (name, designation, gross salary) come from the monthly Google
//   Sheet "RTC League Salary Sheet <Mon> <YYYY>". A new copy of this sheet is
//   made each month, so the file is found in Google Drive by its name.
// - Projects come from the "Team" column of the Revenue Analytics sheet. Only
//   the teams that have rows in the selected month are projects for that month.
// - The allocations (employee + project + percentage) are kept in Postgres.
import { google } from "googleapis";
import { query, withTransaction } from "@/lib/db";

/* ------------------------------------------------------------------ */
/* Months                                                              */
/* ------------------------------------------------------------------ */

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** Month key: "YYYY-MM". */
export function isMonthKey(v: string) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
}

/** "2026-10" -> "Oct 2026". */
export function monthLabel(key: string) {
  const [y, m] = key.split("-").map(Number);
  return `${MONTH_SHORT[m - 1]} ${y}`;
}

function monthFromName(name: string) {
  const n = name.trim().toLowerCase().slice(0, 3);
  const i = MONTH_SHORT.findIndex((x) => x.toLowerCase() === n);
  return i >= 0 ? i + 1 : 0;
}

function key(y: number, m: number) {
  if (!y || m < 1 || m > 12) return "";
  if (y < 100) y += 2000;
  return `${y}-${String(m).padStart(2, "0")}`;
}

/** Reads the month formats found in the sheets ("2026/10", "2026-10", "10/2026", "Oct 2026", "October-26"). "" when unknown. */
export function parseMonth(raw: string): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  let m = s.match(/^(\d{4})[/\-.](\d{1,2})(?:[/\-.]\d{1,2})?$/);
  if (m) return key(Number(m[1]), Number(m[2]));
  m = s.match(/^(\d{1,2})[/\-.](\d{4})$/);
  if (m) return key(Number(m[2]), Number(m[1]));
  m = s.match(/^([A-Za-z]{3,9})[\s\-,'’]+(\d{2,4})$/);
  if (m) return key(Number(m[2]), monthFromName(m[1]));
  m = s.match(/^(\d{4})[\s\-]+([A-Za-z]{3,9})$/);
  if (m) return key(Number(m[1]), monthFromName(m[2]));
  return "";
}

/* ------------------------------------------------------------------ */
/* Google access                                                       */
/* ------------------------------------------------------------------ */

function mustEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function normalizePrivateKey(raw: string) {
  let k = raw.trim();
  if ((k.startsWith('"') && k.endsWith('"')) || (k.startsWith("'") && k.endsWith("'"))) k = k.slice(1, -1);
  return k.replace(/\\n/g, "\n");
}

function googleAuth() {
  return new google.auth.JWT({
    email: mustEnv("GSHEETS_SA_CLIENT_EMAIL"),
    key: normalizePrivateKey(mustEnv("GSHEETS_SA_PRIVATE_KEY")),
    scopes: [
      "https://www.googleapis.com/auth/spreadsheets.readonly",
      "https://www.googleapis.com/auth/drive.metadata.readonly",
    ],
  });
}

function toNum(x: unknown) {
  const n = Number(String(x ?? "").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

const CACHE_MS = 5 * 60 * 1000;

/* ------------------------------------------------------------------ */
/* Revenue sheet (same sheet as Revenue Analytics)                     */
/* ------------------------------------------------------------------ */

type RevenueRow = { month: string; team: string; revenue: number };
let revenueCache: { at: number; rows: RevenueRow[] } | null = null;

async function readRevenueRows(): Promise<RevenueRow[]> {
  if (revenueCache && Date.now() - revenueCache.at < CACHE_MS) return revenueCache.rows;

  const sheets = google.sheets({ version: "v4", auth: googleAuth() });
  const tabName = process.env.GSHEETS_TAB_NAME || "Team Monthly Report";
  const resp = await sheets.spreadsheets.values.get({ spreadsheetId: mustEnv("GSHEETS_SHEET_ID"), range: `${tabName}!A:H` });
  const values = resp.data.values || [];
  if (values.length <= 1) return [];

  const header = values[0].map((x) => String(x ?? "").trim().toLowerCase());
  const col = (name: string, fallback: number) => {
    const i = header.indexOf(name);
    return i >= 0 ? i : fallback;
  };
  const iTeam = col("team", 1);
  const iMonth = col("month", 3);
  const iIncoming = col("incoming", 4);
  const iNet = col("net", 6);

  const rows: RevenueRow[] = [];
  for (const r of values.slice(1)) {
    const month = parseMonth(String(r[iMonth] ?? ""));
    const team = String(r[iTeam] ?? "").trim();
    if (!month || !team) continue;
    // Same revenue definition as Revenue Analytics: Net when present, else Incoming.
    rows.push({ month, team, revenue: toNum(r[iNet]) || toNum(r[iIncoming]) });
  }
  revenueCache = { at: Date.now(), rows };
  return rows;
}

/** All months in the revenue sheet, newest first. */
export async function listRevenueMonths() {
  const rows = await readRevenueRows();
  return Array.from(new Set(rows.map((r) => r.month))).sort().reverse();
}

/** Revenue (USD) per team for one month. Only teams that appear in that month. */
export async function revenueByTeam(month: string) {
  const rows = await readRevenueRows();
  const map = new Map<string, number>();
  for (const r of rows) {
    if (r.month !== month) continue;
    map.set(r.team, (map.get(r.team) ?? 0) + r.revenue);
  }
  return map;
}

/* ------------------------------------------------------------------ */
/* Salary sheet                                                        */
/* ------------------------------------------------------------------ */

export type Employee = { name: string; designation: string; department: string; grossSalary: number };
export type SalarySheet = {
  fileName: string;
  tabName: string;
  /** All employees in the sheet (all departments). */
  employees: Employee[];
  /** true when the sheet has a Department column. */
  hasDepartment: boolean;
  /** Set when the data comes from the copy saved in the database, not from Google Sheets. */
  savedAt?: string;
};

/** The department whose employees are allocated to projects. */
export function costingDepartment() {
  return process.env.SALARY_SHEET_DEPARTMENT || "Technical";
}

/** Employees of the costing department (all employees when the sheet has no Department column). */
export function technicalEmployees(sheet: SalarySheet) {
  if (!sheet.hasDepartment) return sheet.employees;
  const dep = costingDepartment().toLowerCase();
  return sheet.employees.filter((e) => e.department.trim().toLowerCase() === dep);
}

const salaryCache = new Map<string, { at: number; value: SalarySheet }>();

function salaryPrefix() {
  return process.env.SALARY_SHEET_NAME_PREFIX || "RTC League Salary Sheet";
}

/** The names the salary sheet of a month can have: "... Oct 2026" or "... October 2026". */
export function salarySheetNames(month: string) {
  const [y, m] = month.split("-").map(Number);
  return [`${salaryPrefix()} ${MONTH_SHORT[m - 1]} ${y}`, `${salaryPrefix()} ${MONTH_LONG[m - 1]} ${y}`];
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

async function findSalaryFile(month: string) {
  const drive = google.drive({ version: "v3", auth: googleAuth() });
  const [y] = month.split("-");
  const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  const folder = process.env.SALARY_SHEET_FOLDER_ID;
  const q = [
    `name contains '${esc(salaryPrefix())}'`,
    `name contains '${y}'`,
    "mimeType = 'application/vnd.google-apps.spreadsheet'",
    "trashed = false",
    folder ? `'${esc(folder)}' in parents` : "",
  ]
    .filter(Boolean)
    .join(" and ");

  const resp = await drive.files.list({
    q,
    fields: "files(id, name, modifiedTime)",
    orderBy: "modifiedTime desc",
    pageSize: 100,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  const wanted = salarySheetNames(month).map(norm);
  const files = resp.data.files || [];
  return files.find((f) => wanted.includes(norm(f.name || ""))) ?? null;
}

type ColumnMap = { name: number; designation: number; department: number; gross: number };

/** Finds the header cells for employee name, designation and gross salary. */
function matchHeader(row: unknown[]): ColumnMap | null {
  const cells = row.map((c) => norm(String(c ?? "")));
  const find = (test: (c: string) => boolean) => cells.findIndex(test);

  const gross = find((c) => c.includes("gross"));
  const designation = find((c) => c.includes("designation") || c === "title" || c === "job title" || c === "position");
  let name = find((c) => (c.includes("employee") && c.includes("name")) || c === "name" || c === "employee" || c === "full name");
  if (name < 0) name = find((c) => c.includes("name") && !c.includes("father") && !c.includes("bank") && !c.includes("account"));
  const department = find((c) => c === "department" || c === "dept" || c.startsWith("department"));
  if (name < 0 || gross < 0) return null;
  return { name, designation, department, gross };
}

/** Reads the employees of one month from the salary sheet. Throws a clear message when the sheet is not found. */
async function readSalarySheetFromGoogle(month: string): Promise<SalarySheet> {
  const hit = salaryCache.get(month);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;

  const file = await findSalaryFile(month);
  if (!file?.id) {
    throw new Error(
      `Salary sheet "${salarySheetNames(month)[0]}" was not found. Share it with the service account ${process.env.GSHEETS_SA_CLIENT_EMAIL ?? ""} (Viewer).`
    );
  }

  const sheets = google.sheets({ version: "v4", auth: googleAuth() });
  const meta = await sheets.spreadsheets.get({ spreadsheetId: file.id, fields: "sheets.properties.title" });
  const allTabs = (meta.data.sheets || []).map((s) => s.properties?.title || "").filter(Boolean);
  // The salary sheet keeps the employee list in the "Employees" tab (columns
  // "Employee Name", "Designation", "Gross Salary"). Try that tab first, then the others.
  const preferred = process.env.SALARY_SHEET_TAB_NAME || "Employees";
  const tabs = allTabs.includes(preferred) ? [preferred, ...allTabs.filter((t) => t !== preferred)] : allTabs;

  for (const tab of tabs) {
    const resp = await sheets.spreadsheets.values.get({
      spreadsheetId: file.id,
      range: `'${tab.replace(/'/g, "''")}'!A1:AZ2000`,
      valueRenderOption: "UNFORMATTED_VALUE",
    });
    const values = resp.data.values || [];

    // The header row is not always row 1 (titles can be above it).
    let headerRow = -1;
    let cols: ColumnMap | null = null;
    for (let r = 0; r < Math.min(values.length, 30); r++) {
      cols = matchHeader(values[r] || []);
      if (cols) {
        headerRow = r;
        break;
      }
    }
    if (!cols) continue;

    const byName = new Map<string, Employee>();
    for (const row of values.slice(headerRow + 1)) {
      const name = String(row[cols.name] ?? "").replace(/\s+/g, " ").trim();
      if (!name || /^(total|grand total|sub ?total)\b/i.test(name)) continue;
      const grossSalary = toNum(row[cols.gross]);
      const designation = cols.designation >= 0 ? String(row[cols.designation] ?? "").trim() : "";
      const department = cols.department >= 0 ? String(row[cols.department] ?? "").trim() : "";
      if (!grossSalary && !designation) continue;
      // The same name twice: keep the first row (names are the key for allocations).
      if (!byName.has(name.toLowerCase())) byName.set(name.toLowerCase(), { name, designation, department, grossSalary });
    }
    if (!byName.size) continue;

    const value: SalarySheet = {
      fileName: file.name || "",
      tabName: tab,
      employees: Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name)),
      hasDepartment: cols.department >= 0,
    };
    salaryCache.set(month, { at: Date.now(), value });
    return value;
  }

  throw new Error(`No tab in "${file.name}" has the columns Employee Name and Gross Salary.`);
}

/* ------------------------------------------------------------------ */
/* Allocations (Postgres)                                              */
/* ------------------------------------------------------------------ */

export type Allocation = {
  id: number;
  month: string;
  employeeName: string;
  projectName: string;
  percentage: number;
  updatedBy: string | null;
  updatedAt: string;
};

let tableReady: Promise<void> | null = null;

function ensureTable() {
  if (!tableReady) {
    tableReady = query(`
      create table if not exists project_cost_salary_snapshots (
        month text not null,
        employee_name text not null,
        designation text not null default '',
        department text not null default '',
        gross_salary numeric(14, 2) not null default 0,
        file_name text not null default '',
        tab_name text not null default '',
        has_department boolean not null default true,
        saved_at timestamptz not null default now(),
        primary key (month, employee_name)
      )
    `)
      .then(() => query(`
      create table if not exists project_cost_allocations (
        id bigserial primary key,
        month text not null,
        employee_name text not null,
        project_name text not null,
        percentage numeric(6, 2) not null check (percentage > 0 and percentage <= 100),
        updated_by text,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        unique (month, employee_name, project_name)
      )
    `))
      .then(() => query(`create index if not exists project_cost_allocations_month_idx on project_cost_allocations(month)`))
      .then(() => undefined)
      .catch((e) => {
        tableReady = null;
        throw e;
      });
  }
  return tableReady;
}

type AllocationRow = {
  id: string;
  month: string;
  employee_name: string;
  project_name: string;
  percentage: string;
  updated_by: string | null;
  updated_at: Date;
};

const toAllocation = (r: AllocationRow): Allocation => ({
  id: Number(r.id),
  month: r.month,
  employeeName: r.employee_name,
  projectName: r.project_name,
  percentage: Number(r.percentage),
  updatedBy: r.updated_by,
  updatedAt: new Date(r.updated_at).toISOString(),
});

export async function listAllocations(month: string): Promise<Allocation[]> {
  await ensureTable();
  const { rows } = await query<AllocationRow>(
    `select id, month, employee_name, project_name, percentage, updated_by, updated_at
     from project_cost_allocations where month = $1 order by employee_name, project_name`,
    [month]
  );
  return rows.map(toAllocation);
}

export type AllocationInput = { id?: number; employeeName: string; projectName: string; percentage: number };

export class AllocationError extends Error {}
/** Another user changed the same rows after this user loaded them. */
export class AllocationConflictError extends AllocationError {}

/**
 * Saves the changes of one month in one transaction.
 *
 * - versions: the updatedAt of each row id as the user loaded it. A row that
 *   another user changed or deleted after that is a conflict, and nothing is saved.
 * - Only rows that differ from the database are written, so a save does not
 *   undo another user's changes to rows this user did not touch.
 * - One lock for each month makes saves of the same month run one at a time,
 *   so the "not more than 100%" check sees all committed rows.
 */
export async function saveAllocations(
  month: string,
  rows: AllocationInput[],
  deletedIds: number[],
  versions: Record<string, string>,
  user: string
) {
  await ensureTable();

  const seen = new Set<string>();
  for (const r of rows) {
    if (!r.employeeName || !r.projectName) throw new AllocationError("Each row needs an employee and a project.");
    if (!(r.percentage > 0 && r.percentage <= 100)) {
      throw new AllocationError(`Percentage for ${r.employeeName} / ${r.projectName} must be more than 0 and not more than 100.`);
    }
    const k = `${r.employeeName.toLowerCase()}||${r.projectName.toLowerCase()}`;
    if (seen.has(k)) throw new AllocationError(`${r.employeeName} has ${r.projectName} two times. Keep one row.`);
    seen.add(k);
  }

  await withTransaction(async (db) => {
    await db.query(`select pg_advisory_xact_lock(hashtext('project_cost_allocations:' || $1))`, [month]);

    const { rows: currentRows } = await db.query<AllocationRow>(
      `select id, month, employee_name, project_name, percentage, updated_by, updated_at
       from project_cost_allocations where month = $1`,
      [month]
    );
    const current = new Map(currentRows.map((r) => [Number(r.id), toAllocation(r)]));

    const stale = (id: number) => {
      const row = current.get(id);
      if (!row) return "deleted";
      const loaded = versions[String(id)];
      if (loaded && new Date(loaded).getTime() !== new Date(row.updatedAt).getTime()) return row.updatedBy || "another user";
      return "";
    };

    // Rows with an id that this user changed; unchanged rows are not written.
    const changed = rows.filter((r) => {
      if (!r.id) return false;
      const old = current.get(r.id);
      return !old || old.employeeName !== r.employeeName || old.projectName !== r.projectName || old.percentage !== r.percentage;
    });

    for (const id of [...deletedIds, ...changed.map((r) => r.id!)]) {
      const who = stale(id);
      if (who === "deleted") {
        if (deletedIds.includes(id)) continue; // Already deleted: nothing to do.
        throw new AllocationConflictError("A row you changed was deleted by another user. Reload the month and enter your changes again.");
      }
      if (who) throw new AllocationConflictError(`${who} changed the same rows after you loaded the month. Reload the month and enter your changes again.`);
    }

    if (deletedIds.length) {
      await db.query(`delete from project_cost_allocations where month = $1 and id = any($2::bigint[])`, [month, deletedIds]);
    }
    // Free the (employee, project) pairs of rows that change, so that two rows can swap values.
    if (changed.length) {
      await db.query(`update project_cost_allocations set project_name = '__moving__' || id where month = $1 and id = any($2::bigint[])`, [
        month,
        changed.map((r) => r.id),
      ]);
    }
    for (const r of changed) {
      await db.query(
        `update project_cost_allocations
         set employee_name = $2, project_name = $3, percentage = $4, updated_by = $5, updated_at = now()
         where month = $1 and id = $6`,
        [month, r.employeeName, r.projectName, r.percentage, user, r.id]
      );
    }
    // New rows. A pair that another user added in the meantime is a unique-key conflict (reported as 409).
    for (const r of rows.filter((x) => !x.id)) {
      await db.query(
        `insert into project_cost_allocations (month, employee_name, project_name, percentage, updated_by)
         values ($1, $2, $3, $4, $5)`,
        [month, r.employeeName, r.projectName, r.percentage, user]
      );
    }

    const { rows: over } = await db.query<{ employee_name: string; total: string }>(
      `select employee_name, sum(percentage) as total from project_cost_allocations
       where month = $1 group by employee_name having sum(percentage) > 100`,
      [month]
    );
    if (over.length) {
      const list = over.map((o) => `${o.employee_name} (${Number(o.total)}%)`).join(", ");
      throw new AllocationError(`Total percentage is more than 100% for: ${list}. Nothing was saved.`);
    }
  });

  return listAllocations(month);
}

/* ------------------------------------------------------------------ */
/* Salary history (copy of each month's salary sheet in Postgres)      */
/* ------------------------------------------------------------------ */

async function saveSalarySnapshot(month: string, sheet: SalarySheet) {
  await ensureTable();
  await withTransaction(async (db) => {
    await db.query(`delete from project_cost_salary_snapshots where month = $1`, [month]);
    for (const e of sheet.employees) {
      await db.query(
        `insert into project_cost_salary_snapshots
           (month, employee_name, designation, department, gross_salary, file_name, tab_name, has_department)
         values ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [month, e.name, e.designation, e.department, e.grossSalary, sheet.fileName, sheet.tabName, sheet.hasDepartment]
      );
    }
  });
}

/** The saved copy of a month's salary sheet. null when there is no copy. */
export async function loadSalarySnapshot(month: string): Promise<SalarySheet | null> {
  await ensureTable();
  const { rows } = await query<{
    employee_name: string;
    designation: string;
    department: string;
    gross_salary: string;
    file_name: string;
    tab_name: string;
    has_department: boolean;
    saved_at: Date;
  }>(
    `select employee_name, designation, department, gross_salary, file_name, tab_name, has_department, saved_at
     from project_cost_salary_snapshots where month = $1 order by employee_name`,
    [month]
  );
  if (!rows.length) return null;
  return {
    fileName: rows[0].file_name,
    tabName: rows[0].tab_name,
    hasDepartment: rows[0].has_department,
    savedAt: new Date(rows[0].saved_at).toISOString(),
    employees: rows.map((r) => ({
      name: r.employee_name,
      designation: r.designation,
      department: r.department,
      grossSalary: Number(r.gross_salary),
    })),
  };
}

const snapshotSavedAt = new Map<string, number>();

/**
 * Salary data of one month. Reads Google Sheets and saves a copy in the
 * database, so the month stays available when the sheet is changed, moved or
 * deleted later. When Google Sheets cannot be read, the saved copy is used.
 */
export async function readSalarySheet(month: string): Promise<SalarySheet> {
  try {
    const sheet = await readSalarySheetFromGoogle(month);
    // Save at most once in 5 minutes for each month (the sheet read is cached for the same time).
    const last = snapshotSavedAt.get(month) ?? 0;
    if (Date.now() - last > CACHE_MS) {
      await saveSalarySnapshot(month, sheet);
      snapshotSavedAt.set(month, Date.now());
    }
    return sheet;
  } catch (e) {
    const saved = await loadSalarySnapshot(month).catch(() => null);
    if (saved) return saved;
    throw e;
  }
}

/** All months that have allocations, newest first. */
export async function listAllocationMonths(): Promise<string[]> {
  await ensureTable();
  const { rows } = await query<{ month: string }>(`select distinct month from project_cost_allocations order by month desc`);
  return rows.map((r) => r.month);
}

/** All allocations of all months. */
export async function listAllAllocations(): Promise<Allocation[]> {
  await ensureTable();
  const { rows } = await query<AllocationRow>(
    `select id, month, employee_name, project_name, percentage, updated_by, updated_at
     from project_cost_allocations order by month, employee_name, project_name`
  );
  return rows.map(toAllocation);
}
