function mustEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function plaidBase() {
  const env = process.env.PLAID_ENV || "sandbox"; // sandbox/development/production
  if (env === "production") return "https://production.plaid.com";
  if (env === "development") return "https://development.plaid.com";
  return "https://sandbox.plaid.com";
}

export type PlaidAccount = {
  account_id: string;
  name: string;
  mask?: string;
  official_name?: string;
  subtype?: string;
  type?: string;
  balances: {
    available?: number | null;
    current: number;
    limit?: number | null;
  };
};

export async function getPlaidAccountsForAccessToken(accessToken: string): Promise<PlaidAccount[]> {
  const clientId = mustEnv("PLAID_CLIENT_ID");
  const secret = mustEnv("PLAID_SECRET");

  const url = `${plaidBase()}/accounts/get`;

  const body = {
    client_id: clientId,
    secret: secret,
    access_token: accessToken,
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Plaid accounts/get failed (${res.status}): ${txt}`);
  }

  const data = await res.json();
  return (data.accounts ?? []) as PlaidAccount[];
}
