import crypto from "crypto";
import tls from "tls";
import { cookies } from "next/headers";

export const AUTH_COOKIE = "qbo_dashboard_session";
export const ADMIN_APPROVER_EMAIL = process.env.AUTH_APPROVER_EMAIL || "taha.zohaib@rtcleague.com";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

type SessionPayload = {
  sub: string;
  email: string;
  isAdmin?: boolean;
  exp: number;
};

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function isAdminEmail(email: string) {
  return normalizeEmail(email) === normalizeEmail(ADMIN_APPROVER_EMAIL);
}

function getAuthSecret() {
  const secret = process.env.AUTH_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error("AUTH_SECRET is required in production");
  }
  return "dev-only-qbo-dashboard-auth-secret";
}

function base64UrlEncode(value: Buffer | string) {
  return Buffer.from(value).toString("base64url");
}

function base64UrlJson(value: unknown) {
  return base64UrlEncode(JSON.stringify(value));
}

function sign(value: string) {
  return crypto.createHmac("sha256", getAuthSecret()).update(value).digest("base64url");
}

export function createSessionToken(payload: Omit<SessionPayload, "exp">) {
  const body = base64UrlJson({
    ...payload,
    isAdmin: payload.isAdmin ?? isAdminEmail(payload.email),
    exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS,
  });
  return `${body}.${sign(body)}`;
}

export function verifySessionToken(token: string | undefined): SessionPayload | null {
  if (!token || !token.includes(".")) return null;
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;

  const expected = sign(body);
  const safeExpected = Buffer.from(expected);
  const safeActual = Buffer.from(signature);
  if (safeExpected.length !== safeActual.length || !crypto.timingSafeEqual(safeExpected, safeActual)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SessionPayload;
    if (!payload?.sub || !payload?.email || !payload?.exp) return null;
    if (payload.exp <= Math.floor(Date.now() / 1000)) return null;
    return { ...payload, isAdmin: payload.isAdmin ?? isAdminEmail(payload.email) };
  } catch {
    return null;
  }
}

export async function getCurrentSession() {
  const cookieStore = await cookies();
  return verifySessionToken(cookieStore.get(AUTH_COOKIE)?.value);
}

export function hashPassword(password: string) {
  const salt = crypto.randomBytes(16).toString("base64url");
  const hash = crypto.pbkdf2Sync(password, salt, 210_000, 32, "sha256").toString("base64url");
  return `pbkdf2_sha256$210000$${salt}$${hash}`;
}

export function verifyPassword(password: string, storedHash: string) {
  const [algorithm, iterationsRaw, salt, expectedHash] = storedHash.split("$");
  if (algorithm !== "pbkdf2_sha256" || !iterationsRaw || !salt || !expectedHash) return false;

  const iterations = Number(iterationsRaw);
  if (!Number.isFinite(iterations) || iterations < 100_000) return false;

  const actualHash = crypto.pbkdf2Sync(password, salt, iterations, 32, "sha256").toString("base64url");
  const expected = Buffer.from(expectedHash);
  const actual = Buffer.from(actualHash);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

export function createRawToken() {
  return crypto.randomBytes(32).toString("base64url");
}

export function hashToken(rawToken: string) {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

export function getBaseUrl(request: Request) {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto") || "https";
  if (forwardedHost) return `${forwardedProto}://${forwardedHost}`;

  const requestOrigin = new URL(request.url).origin;
  if (requestOrigin) return requestOrigin;

  return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
}

function getEmailAddress(value: string) {
  const match = value.match(/<([^>]+)>/);
  return (match?.[1] || value).trim();
}

function normalizeSmtpData(value: string) {
  return value.replace(/\r?\n/g, "\r\n").replace(/^\./gm, "..");
}

async function sendSmtpEmail({
  host,
  port,
  user,
  pass,
  from,
  to,
  subject,
  html,
}: {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
  to: string;
  subject: string;
  html: string;
}) {
  await new Promise<void>((resolve, reject) => {
    const socket = tls.connect({ host, port, servername: host });
    let buffer = "";
    let pendingResponse: (() => void) | null = null;

    const fail = (error: Error) => {
      socket.destroy();
      reject(error);
    };

    const readResponse = (expected: number[]) =>
      new Promise<string>((responseResolve, responseReject) => {
        pendingResponse = () => {
          const lines = buffer.split(/\r?\n/);
          const completeIndex = lines.findIndex((line) => /^\d{3} /.test(line));
          if (completeIndex === -1) return;

          const responseLines = lines.splice(0, completeIndex + 1);
          buffer = lines.join("\r\n");
          pendingResponse = null;
          const code = Number(responseLines[responseLines.length - 1].slice(0, 3));
          const response = responseLines.join("\n");
          if (!expected.includes(code)) {
            responseReject(new Error(`SMTP email send failed: ${response}`));
            return;
          }
          responseResolve(response);
        };
        pendingResponse();
      });

    const sendCommand = async (command: string, expected: number[]) => {
      socket.write(`${command}\r\n`);
      return readResponse(expected);
    };

    socket.setTimeout(20_000, () => fail(new Error("SMTP email send timed out.")));
    socket.on("error", fail);
    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      pendingResponse?.();
    });

    socket.once("secureConnect", async () => {
      try {
        await readResponse([220]);
        await sendCommand("EHLO qbo-dashboard", [250]);
        await sendCommand(`AUTH PLAIN ${Buffer.from(`\0${user}\0${pass}`).toString("base64")}`, [235]);
        await sendCommand(`MAIL FROM:<${getEmailAddress(from)}>`, [250]);
        await sendCommand(`RCPT TO:<${getEmailAddress(to)}>`, [250, 251]);
        await sendCommand("DATA", [354]);
        socket.write(
          normalizeSmtpData(
            [
              `From: ${from}`,
              `To: ${to}`,
              `Subject: ${subject}`,
              "MIME-Version: 1.0",
              "Content-Type: text/html; charset=UTF-8",
              "",
              html,
            ].join("\r\n")
          ) + "\r\n.\r\n"
        );
        await readResponse([250]);
        await sendCommand("QUIT", [221]);
        socket.end();
        resolve();
      } catch (error) {
        fail(error instanceof Error ? error : new Error("SMTP email send failed."));
      }
    });
  });
}

export async function sendAuthEmail({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  const smtpHost = process.env.SMTP_HOST;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const smtpPort = Number(process.env.SMTP_PORT || 465);
  const from = process.env.AUTH_EMAIL_FROM || smtpUser || "QBO Dashboard <onboarding@resend.dev>";

  if (apiKey) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to, subject, html }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Email send failed: ${res.status} ${detail}`);
    }

    return { sent: true };
  }

  if (smtpHost && smtpUser && smtpPass) {
    await sendSmtpEmail({
      host: smtpHost,
      port: smtpPort,
      user: smtpUser,
      pass: smtpPass,
      from,
      to,
      subject,
      html,
    });

    return { sent: true };
  }

  console.log(`[auth-email-fallback] To: ${to}\nSubject: ${subject}\n${html}`);
  return { sent: false, reason: "Email delivery is not configured yet." };
}
