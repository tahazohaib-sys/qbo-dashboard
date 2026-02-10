import { google } from "googleapis";

function mustEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function normalizePrivateKey(raw: string) {
  let k = raw.trim();
  if ((k.startsWith('"') && k.endsWith('"')) || (k.startsWith("'") && k.endsWith("'"))) {
    k = k.slice(1, -1);
  }
  return k.replace(/\\n/g, "\n");
}

export type RevenueRow = {
  source: string;
  customer: string; // from "Team" column
  type: string;
  month: string; // YYYY/MM
  incoming: number;
  outgoing: number;
  net: number;
  company: string;
};

function toNumber(v: any) {
  const n = Number(String(v ?? "").replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}

export async function fetchRevenueRowsFromSheet(): Promise<RevenueRow[]> {
  const spreadsheetId = mustEnv("GSHEETS_SPREADSHEET_ID");
  const sheetName = process.env.GSHEETS_SHEET_NAME || "Team Monthly Report";

  const clientEmail = mustEnv("GSHEETS_CLIENT_EMAIL");
  const privateKey = normalizePrivateKey(mustEnv("GSHEETS_PRIVATE_KEY"));

  const auth = new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });

  const sheets = google.sheets({ version: "v4", auth });

  // A:H matches your screenshot. You can extend later if needed.
  const range = `'${sheetName}'!A:H`;

  const resp = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  const values = resp.data.values || [];
  if (values.length <= 1) return [];

  const header = values[0].map((x) => String(x || "").trim().toLowerCase());
  const idx = (name: string) => header.indexOf(name.toLowerCase());

  const iSource = idx("source");
  const iTeam = idx("team");
  const iType = idx("type");
  const iMonth = idx("month");
  const iIncoming = idx("incoming");
  const iOutgoing = idx("outgoing");
  const iNet = idx("net");
  const iCompany = idx("company");

  const out: RevenueRow[] = [];

  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    const monthRaw = String(row[iMonth] ?? "").trim();
    if (!monthRaw) continue;

    const source = String(row[iSource] ?? "").trim();
    const customer = String(row[iTeam] ?? "").trim();
    const type = String(row[iType] ?? "").trim();
    const company = String(row[iCompany] ?? "").trim();

    const incoming = toNumber(row[iIncoming]);
    const outgoing = toNumber(row[iOutgoing]);
    const net = toNumber(row[iNet]);

    out.push({
      source,
      customer,
      type,
      month: monthRaw,
      incoming,
      outgoing,
      net,
      company,
    });
  }

  return out;
}
