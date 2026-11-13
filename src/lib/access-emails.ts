// Emails to a user about their dashboard access: approved, rejected, removed,
// or access level changed.
//
// Inbox placement: these are transactional, one-to-one emails. The layout is
// simple (no images, no tracking, one link), there is a plain-text version, and
// the wording is plain. These points help Gmail put the email in Primary, but
// the sender setup (SPF, DKIM and DMARC of the From domain) has the most effect.
// See README > "Access emails".
import { ADMIN_APPROVER_EMAIL } from "@/lib/auth";
import type { AccessLevel } from "@/lib/auth-db";

export type AccessEmailKind = "approved" | "rejected" | "revoked" | "updated";

/** The dashboard modules of each access level, as the user sees them. */
const ALL_MODULES = ["Profit & Loss", "Bank & Cash Balances", "AR/AP", "Retained Earning", "Financial Forecast", "Revenue Analytics"];

export function modulesFor(level: AccessLevel): { title: string; modules: string[]; note?: string } {
  if (level === "costing_only") {
    return {
      title: "Project Costing (data entry only)",
      modules: ["Project Costing: data entry"],
      note: "You can enter which employee works on which project and the percentage of time. Other modules are not part of your access.",
    };
  }
  if (level === "all_costing") {
    return { title: "All modules + Project Costing data entry", modules: [...ALL_MODULES, "Project Costing: data entry"] };
  }
  return { title: "All dashboard modules", modules: ALL_MODULES };
}

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/** A button that shows in all email apps, Outlook included (VML), with a gradient where the app supports it. */
function button(href: string, label: string) {
  const h = esc(href);
  return `
<table role="presentation" border="0" cellspacing="0" cellpadding="0" style="margin:8px 0 4px">
  <tr>
    <td align="center" bgcolor="#2563eb" style="border-radius:12px;background-color:#2563eb;background-image:linear-gradient(135deg,#2563eb 0%,#0891b2 55%,#059669 100%);box-shadow:0 8px 20px rgba(37,99,235,0.35)">
      <!--[if mso]>
      <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${h}" style="height:52px;v-text-anchor:middle;width:280px;" arcsize="24%" stroke="f" fillcolor="#2563eb">
        <w:anchorlock/>
        <center style="color:#ffffff;font-family:Arial,sans-serif;font-size:16px;font-weight:bold;">${esc(label)}</center>
      </v:roundrect>
      <![endif]-->
      <!--[if !mso]><!-- -->
      <a href="${h}" target="_blank" style="display:inline-block;padding:16px 34px;font-family:${FONT};font-size:16px;font-weight:700;line-height:20px;color:#ffffff;text-decoration:none;border-radius:12px;letter-spacing:0.2px">
        ${esc(label)}&nbsp;&nbsp;&rarr;
      </a>
      <!--<![endif]-->
    </td>
  </tr>
</table>`;
}

function moduleList(modules: string[]) {
  return modules
    .map(
      (m) => `
<tr>
  <td width="28" valign="top" style="padding:6px 0">
    <div style="width:20px;height:20px;border-radius:10px;background-color:#d1fae5;color:#047857;font-family:${FONT};font-size:12px;font-weight:700;line-height:20px;text-align:center">&#10003;</div>
  </td>
  <td valign="top" style="padding:6px 0;font-family:${FONT};font-size:15px;line-height:20px;color:#0f172a">${esc(m)}</td>
</tr>`
    )
    .join("");
}

function layout({
  preheader,
  accent,
  badgeBg,
  badge,
  title,
  body,
}: {
  preheader: string;
  accent: string;
  badgeBg: string;
  badge: string;
  title: string;
  body: string;
}) {
  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${esc(title)}</title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
</head>
<body style="margin:0;padding:0;background-color:#eef2f7">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#eef2f7">${esc(preheader)}</div>
<table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" bgcolor="#eef2f7" style="background-color:#eef2f7">
  <tr>
    <td align="center" style="padding:32px 12px">
      <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width:560px">
        <tr>
          <td bgcolor="#0b1730" style="border-radius:18px 18px 0 0;background-color:#0b1730;background-image:linear-gradient(135deg,#0b1730 0%,#0f2a4a 55%,#0b3b3a 100%);padding:26px 32px">
            <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
              <tr>
                <td style="font-family:${FONT};font-size:12px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:#7dd3fc">RTC League &middot; Finance</td>
              </tr>
              <tr>
                <td style="padding-top:6px;font-family:${FONT};font-size:22px;font-weight:700;color:#ffffff">QBO Dashboard</td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td bgcolor="${accent}" style="height:4px;line-height:4px;font-size:0;background-color:${accent}">&nbsp;</td>
        </tr>
        <tr>
          <td bgcolor="#ffffff" style="background-color:#ffffff;border-radius:0 0 18px 18px;padding:32px;box-shadow:0 12px 32px rgba(15,23,42,0.08)">
            <div style="display:inline-block;padding:5px 12px;border-radius:999px;background-color:${badgeBg};color:${accent};font-family:${FONT};font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase">${esc(badge)}</div>
            <h1 style="margin:16px 0 8px;font-family:${FONT};font-size:24px;line-height:30px;font-weight:700;color:#0f172a">${esc(title)}</h1>
            ${body}
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:20px 24px;font-family:${FONT};font-size:12px;line-height:18px;color:#64748b">
            You get this email because access to the QBO Dashboard was requested with this address.<br>
            Questions? Reply to this email or write to ${esc(ADMIN_APPROVER_EMAIL)}.
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

const p = (text: string) => `<p style="margin:0 0 16px;font-family:${FONT};font-size:15px;line-height:24px;color:#334155">${text}</p>`;

function accessBox(level: AccessLevel) {
  const m = modulesFor(level);
  return `
<table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="margin:4px 0 22px;border:1px solid #e2e8f0;border-radius:14px;background-color:#f8fafc">
  <tr>
    <td style="padding:18px 20px">
      <div style="font-family:${FONT};font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#64748b">Your access</div>
      <div style="margin:4px 0 10px;font-family:${FONT};font-size:17px;font-weight:700;color:#0f172a">${esc(m.title)}</div>
      <table role="presentation" border="0" cellspacing="0" cellpadding="0">${moduleList(m.modules)}</table>
      ${m.note ? `<div style="margin-top:10px;font-family:${FONT};font-size:13px;line-height:20px;color:#475569">${esc(m.note)}</div>` : ""}
    </td>
  </tr>
</table>`;
}

function steps() {
  const items = [
    "Open the login page with the button below.",
    "Enter this email address and choose a password.",
    "Enter the six-digit code that we send to this email.",
  ];
  return `
<table role="presentation" border="0" cellspacing="0" cellpadding="0" style="margin:0 0 18px">
  ${items
    .map(
      (t, i) => `
  <tr>
    <td width="32" valign="top" style="padding:5px 0">
      <div style="width:22px;height:22px;border-radius:11px;background-color:#dbeafe;color:#1d4ed8;font-family:${FONT};font-size:12px;font-weight:700;line-height:22px;text-align:center">${i + 1}</div>
    </td>
    <td valign="top" style="padding:5px 0;font-family:${FONT};font-size:14px;line-height:22px;color:#334155">${esc(t)}</td>
  </tr>`
    )
    .join("")}
</table>`;
}

/** Subject, HTML and plain text of an access email. */
export function buildAccessEmail({
  kind,
  email,
  level,
  loginUrl,
}: {
  kind: AccessEmailKind;
  email: string;
  level: AccessLevel;
  loginUrl: string;
}): { subject: string; html: string; text: string } {
  const m = modulesFor(level);
  const moduleText = m.modules.map((x) => `  - ${x}`).join("\n");
  const contact = `Questions? Reply to this email or write to ${ADMIN_APPROVER_EMAIL}.`;

  if (kind === "approved" || kind === "updated") {
    const approved = kind === "approved";
    const subject = approved ? "Your QBO Dashboard access is approved" : "Your QBO Dashboard access was updated";
    const intro = approved
      ? `Your request to use the QBO Dashboard is approved for <strong>${esc(email)}</strong>.`
      : `The administrator changed the access of <strong>${esc(email)}</strong> on the QBO Dashboard.`;
    const html = layout({
      preheader: approved ? `You can now log in. Access: ${m.title}.` : `Your access is now: ${m.title}.`,
      accent: "#047857",
      badgeBg: "#d1fae5",
      badge: approved ? "Access approved" : "Access updated",
      title: approved ? "Welcome to the QBO Dashboard" : "Your access was updated",
      body: `${p(intro)}${accessBox(level)}${approved ? steps() : ""}${button(loginUrl, "Log in to QBO Dashboard")}
<p style="margin:14px 0 0;font-family:${FONT};font-size:12px;line-height:18px;color:#94a3b8">If the button does not work, copy this link into your browser:<br><a href="${esc(loginUrl)}" style="color:#2563eb;word-break:break-all">${esc(loginUrl)}</a></p>`,
    });
    const text = [
      approved ? "Welcome to the QBO Dashboard" : "Your QBO Dashboard access was updated",
      approved ? `Your request to use the QBO Dashboard is approved for ${email}.` : `The administrator changed the access of ${email}.`,
      `Your access: ${m.title}\n${moduleText}${m.note ? `\n\n${m.note}` : ""}`,
      approved ? "To log in:\n  1. Open the login page.\n  2. Enter this email address and choose a password.\n  3. Enter the six-digit code that we send to this email." : null,
      `Log in: ${loginUrl}`,
      contact,
    ]
      .filter((x): x is string => Boolean(x))
      .join("\n\n");
    return { subject, html, text };
  }

  const revoked = kind === "revoked";
  const subject = revoked ? "Your QBO Dashboard access was removed" : "Your QBO Dashboard access request was not approved";
  const html = layout({
    preheader: revoked ? "Your access to the QBO Dashboard has ended." : "Your access request was not approved.",
    accent: "#be123c",
    badgeBg: "#ffe4e6",
    badge: revoked ? "Access removed" : "Request not approved",
    title: revoked ? "Your access was removed" : "Your request was not approved",
    body: `${p(
      revoked
        ? `The administrator removed the access of <strong>${esc(email)}</strong> to the QBO Dashboard. You cannot log in now.`
        : `Your request to use the QBO Dashboard with <strong>${esc(email)}</strong> was not approved. You cannot log in with this address.`
    )}${p(`If you think this is a mistake, reply to this email or write to <a href="mailto:${esc(ADMIN_APPROVER_EMAIL)}" style="color:#2563eb">${esc(ADMIN_APPROVER_EMAIL)}</a>.`)}`,
  });
  const text = [
    revoked ? "Your QBO Dashboard access was removed" : "Your QBO Dashboard access request was not approved",
    "",
    revoked
      ? `The administrator removed the access of ${email} to the QBO Dashboard. You cannot log in now.`
      : `Your request to use the QBO Dashboard with ${email} was not approved. You cannot log in with this address.`,
    "",
    `If you think this is a mistake, reply to this email or write to ${ADMIN_APPROVER_EMAIL}.`,
  ].join("\n");
  return { subject, html, text };
}

/**
 * Sends an access email to the user. Never throws: the access change is already
 * saved, so a failed email is reported to the admin, not raised as an error.
 */
export async function sendAccessEmail({
  kind,
  email,
  level,
  baseUrl,
}: {
  kind: AccessEmailKind;
  email: string;
  level: AccessLevel;
  baseUrl: string;
}): Promise<{ sent: boolean; error?: string }> {
  try {
    const { sendAuthEmail } = await import("@/lib/auth");
    const loginUrl = `${baseUrl.replace(/\/$/, "")}/login${kind === "approved" ? "?approved=1" : ""}`;
    const msg = buildAccessEmail({ kind, email, level, loginUrl });
    const result = await sendAuthEmail({ to: email, subject: msg.subject, html: msg.html, text: msg.text });
    return result.sent ? { sent: true } : { sent: false, error: result.reason || "Email delivery is not configured." };
  } catch (e) {
    return { sent: false, error: e instanceof Error ? e.message : String(e) };
  }
}
