import { google } from "googleapis";
import * as fs from "fs";
import * as path from "path";

const LOGO_BUFFER: Buffer = (() => {
  try {
    return fs.readFileSync(path.join(process.cwd(), "server", "matcha-logo.png"));
  } catch {
    return Buffer.alloc(0);
  }
})();

let connectionSettings: any;

async function getAccessTokenAndEmail(): Promise<{ token: string; email: string }> {
  if (
    connectionSettings &&
    connectionSettings.settings.expires_at &&
    new Date(connectionSettings.settings.expires_at).getTime() > Date.now()
  ) {
    return {
      token: connectionSettings.settings.access_token,
      email:
        connectionSettings.settings.email ||
        connectionSettings.settings.oauth?.credentials?.email ||
        "victoria@matchaonice.com",
    };
  }

  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? "repl " + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
      ? "depl " + process.env.WEB_REPL_RENEWAL
      : null;

  if (!xReplitToken) {
    throw new Error("X-Replit-Token not found");
  }

  connectionSettings = await fetch(
    "https://" + hostname + "/api/v2/connection?include_secrets=true&connector_names=google-mail",
    {
      headers: { Accept: "application/json", "X-Replit-Token": xReplitToken },
    },
  )
    .then((res) => res.json())
    .then((data) => data.items?.[0]);

  const accessToken =
    connectionSettings?.settings?.access_token ||
    connectionSettings?.settings?.oauth?.credentials?.access_token;

  if (!connectionSettings || !accessToken) {
    throw new Error("Gmail not connected");
  }

  const email =
    connectionSettings?.settings?.email ||
    connectionSettings?.settings?.oauth?.credentials?.email ||
    "victoria@matchaonice.com";

  return { token: accessToken, email };
}

async function getGmailClient() {
  const { token } = await getAccessTokenAndEmail();
  const oauth2 = new google.auth.OAuth2();
  oauth2.setCredentials({ access_token: token });
  return google.gmail({ version: "v1", auth: oauth2 });
}

export async function getGmailSenderInfo() {
  const { email } = await getAccessTokenAndEmail();
  return { email };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function bodyToHtml(body: string): string {
  // Convert plain text body into HTML paragraphs / line breaks
  return body
    .split(/\n{2,}/)
    .map((para) => `<p style="margin:0 0 14px 0;">${escapeHtml(para).replace(/\n/g, "<br/>")}</p>`)
    .join("");
}

function buildCampaignHtml(params: {
  name: string;
  body: string;
  senderName: string;
}): string {
  const personalizedBody = params.body.replace(/\{\{\s*name\s*\}\}/g, params.name || "there");
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${escapeHtml(params.senderName)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f0ede6;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#2a2520;">
  <div style="background-color:#f0ede6;padding:32px 16px;">
    <div style="max-width:600px;margin:0 auto;background-color:#faf9f6;border-radius:4px;overflow:hidden;box-shadow:0 4px 32px rgba(42,37,32,0.10);">
      <div style="background-color:#352d17;padding:28px 32px;text-align:center;">
        <img src="cid:matcha-logo" alt="Matcha On Ice" style="max-width:280px;width:80%;" />
      </div>
      <div style="padding:32px 36px;font-size:15px;line-height:1.6;color:#2a2520;">
        ${bodyToHtml(personalizedBody)}
      </div>
      <div style="background-color:#352d17;padding:18px 32px;text-align:center;color:rgba(255,255,255,0.55);font-size:11px;">
        ${escapeHtml(params.senderName)} &middot; San Diego, CA
      </div>
    </div>
  </div>
</body>
</html>`;
}

function makeRfc2822(params: {
  to: string;
  from: string;
  replyTo: string;
  subject: string;
  htmlBody: string;
  pdfBuffer?: Buffer;
  pdfFilename?: string;
  logoBuffer: Buffer;
  messageId: string;
  fromDomain: string;
}): string {
  const mixedBoundary = `MOI_mixed_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const relatedBoundary = `MOI_related_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  const htmlBase64 = Buffer.from(params.htmlBody, "utf-8").toString("base64");
  const encodedSubject = `=?UTF-8?B?${Buffer.from(params.subject, "utf-8").toString("base64")}?=`;

  const lines: string[] = [
    `From: ${params.from}`,
    `To: ${params.to}`,
    `Reply-To: ${params.replyTo}`,
    `Subject: ${encodedSubject}`,
    `Message-ID: <${params.messageId}@${params.fromDomain}>`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/mixed; boundary="${mixedBoundary}"`,
    ``,
    `--${mixedBoundary}`,
    `Content-Type: multipart/related; boundary="${relatedBoundary}"`,
    ``,
    `--${relatedBoundary}`,
    `Content-Type: text/html; charset="UTF-8"`,
    `Content-Transfer-Encoding: base64`,
    ``,
    htmlBase64.match(/.{1,76}/g)!.join("\r\n"),
    ``,
    `--${relatedBoundary}`,
    `Content-Type: image/png; name="matcha-logo.png"`,
    `Content-ID: <matcha-logo>`,
    `Content-Disposition: inline; filename="matcha-logo.png"`,
    `Content-Transfer-Encoding: base64`,
    ``,
    (params.logoBuffer.length > 0
      ? (params.logoBuffer.toString("base64").match(/.{1,76}/g) || []).join("\r\n")
      : ""),
    ``,
    `--${relatedBoundary}--`,
    ``,
  ];

  if (params.pdfBuffer && params.pdfBuffer.length > 0 && params.pdfFilename) {
    lines.push(
      `--${mixedBoundary}`,
      `Content-Type: application/pdf; name="${params.pdfFilename}"`,
      `Content-Disposition: attachment; filename="${params.pdfFilename}"`,
      `Content-Transfer-Encoding: base64`,
      ``,
      (params.pdfBuffer.toString("base64").match(/.{1,76}/g) || []).join("\r\n"),
      ``,
    );
  }

  lines.push(`--${mixedBoundary}--`);

  return Buffer.from(lines.join("\r\n")).toString("base64url");
}

export async function sendCampaignEmail(params: {
  to: string;
  name: string;
  subject: string;
  body: string;
  senderName: string;
  replyTo: string;
  pdfBuffer?: Buffer;
  pdfFilename?: string;
}): Promise<{ messageIdHeader: string; gmailMessageId: string; threadId: string }> {
  const gmail = await getGmailClient();
  const { email: senderAddress } = await getAccessTokenAndEmail();

  const personalizedSubject = params.subject.replace(/\{\{\s*name\s*\}\}/g, params.name || "there");
  const htmlBody = buildCampaignHtml({
    name: params.name,
    body: params.body,
    senderName: params.senderName,
  });

  const fromHeader = `${params.senderName} <${senderAddress}>`;
  const fromDomain = (senderAddress.split("@")[1] || "matchaonice.com").trim();
  const localId = `moi-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
  const messageIdHeader = `${localId}@${fromDomain}`;

  const raw = makeRfc2822({
    to: params.to,
    from: fromHeader,
    replyTo: params.replyTo,
    subject: personalizedSubject,
    htmlBody,
    pdfBuffer: params.pdfBuffer,
    pdfFilename: params.pdfFilename,
    logoBuffer: LOGO_BUFFER,
    messageId: localId,
    fromDomain,
  });

  const result = await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw },
  });

  return {
    messageIdHeader,
    gmailMessageId: result.data.id || "",
    threadId: result.data.threadId || "",
  };
}

export type ReplyTarget = {
  recipientId: string;
  email: string;
  messageIdHeader?: string | null;
  threadId?: string | null;
};

// Polls Gmail inbox for replies received after `sinceMs` and correlates them
// to specific recipients via two signals (both required):
//   1. From-address matches the recipient's email (avoids cross-recipient leaks)
//   2. In-Reply-To / References header references the outbound Message-ID
//      we stored when sending — OR the inbound message lives in the same
//      Gmail thread we sent on.
// Excludes auto-replies (Auto-Submitted header) and bounce daemons.
export async function checkCampaignReplies(
  targets: ReplyTarget[],
  sinceMs: number,
): Promise<Set<string>> {
  const replied = new Set<string>();
  if (targets.length === 0) return replied;
  const gmail = await getGmailClient();
  const sinceSec = Math.floor(sinceMs / 1000);

  const byEmail = new Map<string, ReplyTarget[]>();
  for (const t of targets) {
    const k = t.email.toLowerCase();
    if (!byEmail.has(k)) byEmail.set(k, []);
    byEmail.get(k)!.push(t);
  }

  const emails = Array.from(byEmail.keys());
  const BATCH = 25;
  for (let i = 0; i < emails.length; i += BATCH) {
    const slice = emails.slice(i, i + BATCH);
    const fromQ = slice.map((e) => `from:${e}`).join(" OR ");
    const q = `in:inbox after:${sinceSec} (${fromQ}) -from:mailer-daemon -from:postmaster -label:^automated`;
    try {
      const list = await gmail.users.messages.list({
        userId: "me",
        q,
        maxResults: 100,
      });
      const messages = list.data.messages || [];
      for (const m of messages) {
        if (!m.id) continue;
        const msg = await gmail.users.messages.get({
          userId: "me",
          id: m.id,
          format: "metadata",
          metadataHeaders: ["From", "Auto-Submitted", "In-Reply-To", "References"],
        });
        const headers = msg.data.payload?.headers || [];
        const get = (n: string) =>
          headers.find((h) => (h.name || "").toLowerCase() === n.toLowerCase())?.value || "";

        const autoSubmitted = get("Auto-Submitted");
        if (autoSubmitted && autoSubmitted.toLowerCase() !== "no") continue;

        const fromHeader = get("From");
        const match = fromHeader.match(/<([^>]+)>/) || fromHeader.match(/([\w.+-]+@[\w.-]+\.\w+)/);
        const fromEmail = (match?.[1] || "").toLowerCase().trim();
        const recipientCandidates = byEmail.get(fromEmail);
        if (!recipientCandidates || recipientCandidates.length === 0) continue;

        const inReplyTo = get("In-Reply-To");
        const references = get("References");
        const referencedIds = new Set<string>();
        for (const raw of [inReplyTo, references]) {
          const re = /<([^>]+)>/g;
          let m2: RegExpExecArray | null;
          while ((m2 = re.exec(raw)) !== null) {
            referencedIds.add(m2[1].toLowerCase().trim());
          }
        }

        const replyThreadId = msg.data.threadId || "";

        // Per-recipient correlation: require either a header reference to that
        // specific recipient's outbound Message-Id OR same Gmail thread.
        let matchedRecipient: ReplyTarget | undefined;
        for (const cand of recipientCandidates) {
          const candMsgId = cand.messageIdHeader?.toLowerCase();
          const candThread = cand.threadId;
          if (candMsgId && referencedIds.has(candMsgId)) {
            matchedRecipient = cand;
            break;
          }
          if (candThread && replyThreadId && candThread === replyThreadId) {
            matchedRecipient = cand;
            break;
          }
        }
        if (!matchedRecipient) continue;
        replied.add(matchedRecipient.recipientId);
      }
    } catch (e) {
      console.error("Gmail reply check failed:", e);
    }
  }
  return replied;
}
