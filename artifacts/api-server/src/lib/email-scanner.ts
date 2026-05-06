import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { openai } from "@workspace/integrations-openai-ai-server";
import { logger } from "./logger";

export interface ParsedApplication {
  dateOfContact: string;
  position: string | null;
  employer: string | null;
  contactName: string | null;
  interviewerInfo: string | null;
  methodOfContact: string;
  emailAddress: string | null;
  result: string;
  notes: string | null;
  sourceEmailId: string;
}

// ─── IMAP client builders ────────────────────────────────────────────────────

function buildImapClient(
  host: string,
  port: number,
  email: string,
  credentials: { password: string } | { oauthToken: string },
): ImapFlow {
  if ("oauthToken" in credentials) {
    return new ImapFlow({
      host,
      port,
      secure: true,
      auth: { user: email, accessToken: credentials.oauthToken },
      logger: false,
      tls: { rejectUnauthorized: false },
    });
  }
  return new ImapFlow({
    host,
    port,
    secure: true,
    auth: { user: email, pass: credentials.password },
    logger: false,
    tls: { rejectUnauthorized: false },
  });
}

// ─── Email filtering ─────────────────────────────────────────────────────────

/**
 * These senders/subjects are definitively NOT job application updates.
 * Skip them immediately without AI classification.
 */
function isExcluded(fromEmail: string, fromName: string, subject: string): boolean {
  const from = fromEmail.toLowerCase();
  const name = fromName.toLowerCase();
  const subj = subject.toLowerCase();

  // LinkedIn Job Alerts — newsletters sent by LinkedIn, not application replies
  if (from.includes("jobalerts") || from.includes("jobs-noreply@linkedin.com")) return true;
  if (from.includes("@linkedin.com") && name.includes("linkedin job alerts")) return true;
  if (from.includes("@linkedin.com") && /\d+\s+new jobs/i.test(subject)) return true;
  if (
    from.includes("@linkedin.com") &&
    (subj.includes("jobs for you") ||
      subj.includes("job alert") ||
      subj.includes("jobs you may be interested") ||
      subj.includes("top job picks") ||
      subj.includes("recommended jobs") ||
      subj.includes("new jobs matching"))
  )
    return true;

  // Generic job-board newsletter patterns
  if (/\d+\s+new jobs near you/i.test(subject)) return true;
  if (subj.includes("jobs matching your search")) return true;
  if (subj.includes("job recommendations for")) return true;
  if (subj.includes("weekly job digest")) return true;
  if (subj.includes("daily job alert")) return true;

  return false;
}

/** ATS/employer domains that always indicate a direct application update */
const ATS_DOMAINS = [
  "workday.com",
  "myworkdayjobs.com",
  "greenhouse.io",
  "lever.co",
  "taleo.net",
  "icims.com",
  "jobvite.com",
  "smartrecruiters.com",
  "bamboohr.com",
  "brassring.com",
  "successfactors.com",
  "sapjobs.com",
  "oracle.com",
  "adp.com",
  "ultipro.com",
  "paylocity.com",
  "dayforce.com",
  "kforce.com",
  "ashbyhq.com",
  "rippling.com",
  "eightfold.ai",
  "dover.com",
  "pinpointhq.com",
  "recruitee.com",
  "teamtailor.com",
  "workable.com",
];

/**
 * Some emails should always be classified regardless of keyword matching —
 * strong signals of an active application.
 */
function isAlwaysInclude(fromEmail: string, subject: string): boolean {
  const from = fromEmail.toLowerCase();
  const subj = subject.toLowerCase();

  if (ATS_DOMAINS.some((d) => from.includes(d))) return true;

  if (subj.includes("interview scheduling")) return true;
  if (subj.includes("interview invitation")) return true;
  if (subj.includes("schedule your interview")) return true;
  if (subj.includes("your application to ")) return true;
  if (subj.includes("regarding your application")) return true;
  if (subj.includes("thank you for applying")) return true;
  if (subj.includes("we received your application")) return true;
  if (subj.includes("application confirmation")) return true;
  if (subj.includes("offer letter")) return true;
  if (subj.includes("background check")) return true;
  if (subj.includes("pre-employment")) return true;
  if (subj.includes("start date")) return true;

  return false;
}

const JOB_KEYWORDS = [
  "application",
  "applied",
  "apply",
  "job",
  "position",
  "role",
  "opportunity",
  "interview",
  "recruiter",
  "hiring",
  "offer",
  "resume",
  "cv",
  "candidate",
  "career",
  "screening",
  "assessment",
  "rejection",
  "rejected",
  "background check",
  "onboarding",
  "talent",
  "staffing",
  "greenhouse",
  "lever",
  "workday",
  "taleo",
  "icims",
  "jobvite",
  "bamboohr",
  "we regret",
  "move forward",
  "not selected",
  "other candidates",
  "next steps",
];

function isJobRelated(fromEmail: string, subject: string, body: string): boolean {
  // Check always-include first (overrides keyword check)
  if (isAlwaysInclude(fromEmail, subject)) return true;

  // Broad keyword pass — searches subject + first 2000 chars of body
  const combined = (subject + " " + body.slice(0, 2000)).toLowerCase();
  if (JOB_KEYWORDS.some((kw) => combined.includes(kw))) return true;

  // Additional loose signals that are strong enough on their own
  const subj = subject.toLowerCase();
  if (subj.includes("schedule") && (subj.includes("call") || subj.includes("chat") || subj.includes("meeting"))) return true;
  if (subj.includes("following up") || subj.includes("next steps")) return true;
  if (subj.includes("phone screen") || subj.includes("technical screen") || subj.includes("tech screen")) return true;
  if (subj.includes("zoom") || subj.includes("google meet") || subj.includes("teams call")) return true;
  if (subj.includes("excited to") || subj.includes("congrats") || subj.includes("congratulations")) return true;
  if (subj.includes("we'd like to") || subj.includes("we would like to")) return true;
  if (subj.includes("moving forward") || subj.includes("next round")) return true;

  return false;
}

// ─── AI classification ───────────────────────────────────────────────────────

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/\s{2,}/g, " ")
    .trim();
}

async function classifyEmail(
  subject: string,
  fromName: string,
  fromEmail: string,
  rawBody: string,
  date: Date,
): Promise<ParsedApplication | null> {
  // Use plain text; strip HTML if needed
  const body = rawBody.startsWith("<") ? stripHtml(rawBody) : rawBody;

  const prompt = `You are a precise job application tracker. Carefully read this email and decide if it represents a direct interaction with an employer or recruiter about a specific job application.

Email:
- Date: ${date.toISOString()}
- From: ${fromName} <${fromEmail}>
- Subject: ${subject}
- Body:
${body.slice(0, 4000)}

SKIP this email (respond {"skip":true}) if it is:
- A LinkedIn Job Alert or any job recommendation newsletter
- A job board digest, "jobs for you", "new jobs matching" etc.
- A generic marketing or promotional email
- An automated receipt that has no application-specific content
- Anything NOT directly about a specific job YOU applied to

ONLY classify if the email is clearly about a specific job application — e.g. from an employer/recruiter/ATS confirming receipt, scheduling an interview, making an offer, or rejecting an application.

Respond ONLY with JSON, no markdown.

If skipping: {"skip":true}

If classifying:
{
  "position": "exact job title from email or null",
  "employer": "company name or null",
  "contactName": "recruiter or hiring manager name if mentioned, else null",
  "interviewerInfo": "for interview emails: the interviewer name(s) and title(s) listed in the email separated by semicolons (e.g. 'Jane Smith, Senior Engineer; Bob Jones, VP Engineering'); if no specific interviewers are listed, use the sender's name; null for non-interview emails",
  "methodOfContact": "email|zoom|teams|google-meet|phone|linkedin|other",
  "result": "interview|next-stage|rejected|applied|no-response",
  "notes": "one sentence summary (max 120 chars)"
}

Result rules:
- "interview" — they are scheduling or inviting you to an interview
- "next-stage" — you're advancing but no interview scheduled yet, or you received an offer
- "rejected" — application was declined / "not moving forward" / "other candidates"
- "applied" — application receipt confirmation only: "thank you for applying", "we received your application", "your application has been submitted" — no outcome yet
- "no-response" — job-related but none of the above categories fit

methodOfContact: use the platform if an interview link/invite is included (Zoom, Teams, Google Meet); otherwise "email".`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    max_completion_tokens: 512,
    messages: [{ role: "user", content: prompt }],
  });

  const content = response.choices[0]?.message?.content ?? "";

  try {
    const parsed = JSON.parse(content.trim());
    if (parsed.skip) return null;

    const nullify = (v: unknown): string | null => {
      if (v === null || v === undefined || v === "null" || v === "") return null;
      return String(v);
    };

    const result = parsed.result ?? "no-response";
    // For interview emails: use AI-extracted interviewer info, falling back to the sender's name
    const interviewerInfo =
      result === "interview"
        ? (nullify(parsed.interviewerInfo) ?? fromName)
        : nullify(parsed.interviewerInfo);

    return {
      dateOfContact: date.toISOString().split("T")[0],
      position: nullify(parsed.position),
      employer: nullify(parsed.employer),
      contactName: nullify(parsed.contactName),
      interviewerInfo,
      methodOfContact: parsed.methodOfContact ?? "email",
      emailAddress: fromEmail,
      result,
      notes: nullify(parsed.notes),
      sourceEmailId: "",
    };
  } catch {
    logger.warn({ content }, "Failed to parse AI response for email");
    return null;
  }
}

// ─── Gmail REST API scanner ──────────────────────────────────────────────────

interface GmailPart {
  mimeType: string;
  body: { data?: string; size: number };
  parts?: GmailPart[];
}

interface GmailPayload extends GmailPart {
  headers: Array<{ name: string; value: string }>;
}

interface GmailMessage {
  id: string;
  threadId: string;
  payload: GmailPayload;
  internalDate: string;
}

function getHeader(headers: Array<{ name: string; value: string }>, name: string): string {
  return headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

function extractBody(payload: GmailPart): string {
  if (payload.mimeType === "text/plain" && payload.body?.data) {
    return Buffer.from(payload.body.data, "base64url").toString("utf-8");
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === "text/plain" && part.body?.data) {
        return Buffer.from(part.body.data, "base64url").toString("utf-8");
      }
    }
    for (const part of payload.parts) {
      if (part.mimeType === "text/html" && part.body?.data) {
        return Buffer.from(part.body.data, "base64url").toString("utf-8");
      }
    }
    for (const part of payload.parts) {
      if (part.parts) {
        const body = extractBody(part);
        if (body) return body;
      }
    }
  }
  if (payload.mimeType === "text/html" && payload.body?.data) {
    return Buffer.from(payload.body.data, "base64url").toString("utf-8");
  }
  return "";
}

async function gmailApiFetch(accessToken: string, path: string): Promise<Response> {
  return fetch(`https://gmail.googleapis.com/gmail/v1${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

async function fetchMessageIds(
  accessToken: string,
  query: string,
  maxResults: number,
): Promise<string[]> {
  const ids: string[] = [];
  let pageToken: string | undefined;

  while (ids.length < maxResults) {
    const params = new URLSearchParams({
      q: query,
      maxResults: String(Math.min(500, maxResults - ids.length)),
      includeSpamTrash: "true",
    });
    if (pageToken) params.set("pageToken", pageToken);

    const res = await gmailApiFetch(accessToken, `/users/me/messages?${params}`);
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Gmail messages.list error: ${err}`);
    }

    const data = (await res.json()) as {
      messages?: Array<{ id: string }>;
      nextPageToken?: string;
    };

    if (data.messages) {
      for (const m of data.messages) ids.push(m.id);
    }

    if (!data.nextPageToken || ids.length >= maxResults) break;
    pageToken = data.nextPageToken;
  }

  return ids.slice(0, maxResults);
}

async function fetchMessage(accessToken: string, messageId: string): Promise<GmailMessage> {
  const res = await gmailApiFetch(
    accessToken,
    `/users/me/messages/${messageId}?format=full`,
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gmail messages.get error (${messageId}): ${err}`);
  }
  return res.json() as Promise<GmailMessage>;
}

export async function scanEmailsViaGmailApi(
  accessToken: string,
  daysBack: number = 90,
  maxEmails: number = 200,
  dateFrom: string | null = null,
  dateTo: string | null = null,
): Promise<{ results: ParsedApplication[]; sinceDate: Date }> {
  const since = dateFrom ? new Date(dateFrom) : (() => {
    const d = new Date();
    d.setDate(d.getDate() - daysBack);
    return d;
  })();

  const until = dateTo ? (() => {
    const d = new Date(dateTo);
    d.setHours(23, 59, 59, 999);
    return d;
  })() : null;

  const sinceStr = `${since.getFullYear()}/${String(since.getMonth() + 1).padStart(2, "0")}/${String(since.getDate()).padStart(2, "0")}`;

  const subjectKeywords =
    "interview OR offer OR application OR recruiter OR hiring OR opportunity OR screening OR assessment OR position OR job";
  const atsFromClause = ATS_DOMAINS.map((d) => `from:${d}`).join(" OR ");

  let query = `after:${sinceStr} (subject:(${subjectKeywords}) OR ${atsFromClause})`;
  if (until) {
    const beforeStr = `${until.getFullYear()}/${String(until.getMonth() + 1).padStart(2, "0")}/${String(until.getDate()).padStart(2, "0")}`;
    query += ` before:${beforeStr}`;
  }

  logger.info({ query, since: since.toISOString(), until: until?.toISOString() ?? "now", maxEmails }, "Starting Gmail REST API scan");

  const messageIds = await fetchMessageIds(accessToken, query, maxEmails);
  logger.info({ count: messageIds.length }, "Gmail API: message IDs retrieved");

  const results: ParsedApplication[] = [];
  const seenIds = new Set<string>();
  let excluded = 0;
  let notJobRelated = 0;
  let aiSkipped = 0;
  let classified = 0;

  for (const msgId of messageIds) {
    try {
      const msg = await fetchMessage(accessToken, msgId);
      const headers = msg.payload.headers;

      const subject = getHeader(headers, "Subject");
      const fromRaw = getHeader(headers, "From");
      const dateStr = getHeader(headers, "Date");
      const messageId = getHeader(headers, "Message-ID") || msgId;

      const fromMatch = fromRaw.match(/^(?:"?([^"<]*)"?\s*)?<?([^>]+)>?\s*$/);
      const fromName = fromMatch?.[1]?.trim() || fromRaw;
      const fromEmail = fromMatch?.[2]?.trim() || fromRaw;

      const date = dateStr
        ? new Date(dateStr)
        : new Date(parseInt(msg.internalDate, 10));

      if (seenIds.has(messageId)) continue;
      seenIds.add(messageId);

      const rawBody = extractBody(msg.payload);
      const textBody = rawBody.startsWith("<") ? stripHtml(rawBody) : rawBody;

      if (isExcluded(fromEmail, fromName, subject)) {
        logger.info({ subject, fromEmail }, "Email excluded (newsletter/alert)");
        excluded++;
        continue;
      }

      if (!isJobRelated(fromEmail, subject, textBody)) {
        logger.info({ subject, fromEmail }, "Email skipped (no job keywords)");
        notJobRelated++;
        continue;
      }

      logger.info({ subject, fromEmail, date: date.toISOString() }, "Sending to AI for classification");

      const app = await classifyEmail(subject, fromName, fromEmail, textBody, date);
      if (!app) {
        aiSkipped++;
        continue;
      }

      app.sourceEmailId = messageId;
      results.push(app);
      classified++;
      logger.info({ subject, fromEmail, result: app.result, employer: app.employer }, "Email classified as job application");
    } catch (err) {
      logger.warn({ err, msgId }, "Failed to process Gmail message");
    }
  }

  logger.info({ total: results.length, excluded, notJobRelated, aiSkipped, classified }, "Gmail REST API scan complete");
  return { results, sinceDate: since };
}

// ─── IMAP scanner (App Password / non-Gmail OAuth) ───────────────────────────

// ─── Job-related subject keywords for IMAP server-side search ────────────────

// These keywords are passed to IMAP SEARCH so Gmail's server filters emails
// before we download anything — no count cap needed.
const JOB_SUBJECT_KEYWORDS = [
  "interview",
  "offer",
  "application",
  "recruiter",
  "position",
  "hiring",
  "opportunity",
  "screening",
  "background check",
  "onboarding",
  "assessment",
  "job",
];

type ImapSearchObject = Parameters<ImapFlow["search"]>[0];

function buildSubjectOrSearch(keywords: string[]): ImapSearchObject {
  // No `since` here — we search the entire mailbox by subject keyword.
  // Gmail's INTERNALDATE (used by IMAP SINCE) is unreliable for All Mail:
  // old emails get re-indexed with recent internal dates, and conversely
  // actual recent emails can have stale internal dates. We apply date
  // filtering ourselves after fetching envelopes.
  const searches: ImapSearchObject[] = keywords.map((kw) => ({ subject: kw }));
  function nest(items: ImapSearchObject[]): ImapSearchObject {
    if (items.length === 1) return items[0];
    return { or: [items[0], nest(items.slice(1))] as [ImapSearchObject, ImapSearchObject] };
  }
  return nest(searches);
}

// ─── Per-mailbox scan helper ─────────────────────────────────────────────────

async function scanMailbox(
  client: ImapFlow,
  mailbox: string,
  since: Date,
  until: Date | null,
  maxEmails: number,
  seenIds: Set<string>,
): Promise<ParsedApplication[]> {
  try {
    await client.mailboxOpen(mailbox);
  } catch (err) {
    logger.warn({ mailbox, err }, "Could not open mailbox, skipping");
    return [];
  }

  logger.info({ mailbox }, "Opened mailbox for scan");

  // Step 1: Subject keyword search across the ENTIRE mailbox (no date filter).
  // Gmail's INTERNALDATE is unreliable in All Mail — old emails surface in
  // recent SINCE queries and genuine recent emails can be missed. We filter
  // by the actual Date: header ourselves after fetching envelopes.
  const searchQuery = buildSubjectOrSearch(JOB_SUBJECT_KEYWORDS);
  const keywordUids = await client.search(searchQuery);

  // Step 2: Recency catch-all — most recent maxEmails UIDs for emails with
  // job content in the body but no obvious job keyword in the subject.
  const allUids = await client.search({ since });
  const recentUids = allUids.slice(-maxEmails);

  // Union and deduplicate
  const combinedUids = [...new Set([...keywordUids, ...recentUids])];

  if (combinedUids.length === 0) {
    logger.info({ mailbox, since: since.toISOString() }, "No emails found");
    return [];
  }

  // Step 3: Fetch lightweight envelopes so we can filter by actual Date: header.
  // This is the reliable date — not Gmail's INTERNALDATE.
  logger.info({ mailbox, keywordUids: keywordUids.length, recentFallback: recentUids.length, combined: combinedUids.length }, "Fetching envelopes to filter by date");

  const uidDates: Array<{ uid: number; date: Date; fromKeyword: boolean }> = [];
  const keywordSet = new Set(keywordUids);
  for await (const env of client.fetch(combinedUids, { envelope: true }, { uid: true })) {
    const date = env.envelope?.date ?? new Date(0);
    uidDates.push({ uid: env.uid, date, fromKeyword: keywordSet.has(env.uid) });
  }

  // Keyword matches are filtered by actual Date: header (reliable).
  // Recency fallback UIDs are already pre-filtered by IMAP SINCE; pass them through.
  // Apply optional upper bound (until) to both sets.
  const filtered = uidDates.filter(({ date, fromKeyword }) => {
    if (until && date > until) return false;
    return !fromKeyword || date >= since;
  });
  filtered.sort((a, b) => b.date.getTime() - a.date.getTime());
  const messageUids = filtered.map((e) => e.uid);

  if (messageUids.length === 0) {
    logger.info({ mailbox, since: since.toISOString() }, "No emails in date range after envelope filter");
    return [];
  }

  logger.info({
    mailbox,
    keywordMatches: keywordUids.length,
    recentFallback: recentUids.length,
    afterDateFilter: messageUids.length,
    since: since.toISOString(),
    newestInBatch: filtered[0]?.date.toISOString(),
    oldestInBatch: filtered[filtered.length - 1]?.date.toISOString(),
  }, "Fetching email bodies for scan");

  const results: ParsedApplication[] = [];
  let excluded = 0;
  let notJobRelated = 0;
  let aiSkipped = 0;
  let classified = 0;
  let duplicate = 0;

  for await (const msg of client.fetch(messageUids, { source: true, uid: true }, { uid: true })) {
    try {
      const parsed = await simpleParser(msg.source);
      const subject = parsed.subject ?? "";
      const fromAddress = parsed.from?.value[0];
      const fromEmail = fromAddress?.address ?? "";
      const fromName = fromAddress?.name ?? fromEmail;
      const date = parsed.date ?? new Date();
      const msgId = parsed.messageId ?? `uid-${msg.uid}`;

      // Skip duplicates seen in a previous mailbox
      if (seenIds.has(msgId)) {
        duplicate++;
        continue;
      }
      seenIds.add(msgId);

      const textBody =
        typeof parsed.text === "string" && parsed.text.trim()
          ? parsed.text
          : typeof parsed.html === "string" ? parsed.html : "";

      if (isExcluded(fromEmail, fromName, subject)) {
        logger.info({ subject, fromEmail, date: date.toISOString() }, "Email excluded (newsletter/alert)");
        excluded++;
        continue;
      }

      if (!isJobRelated(fromEmail, subject, textBody)) {
        logger.info({ subject, fromEmail, date: date.toISOString() }, "Email skipped (no job keywords)");
        notJobRelated++;
        continue;
      }

      logger.info({ subject, fromEmail, date: date.toISOString() }, "Sending to AI for classification");

      const app = await classifyEmail(subject, fromName, fromEmail, textBody, date);
      if (!app) {
        logger.info({ subject, fromEmail, date: date.toISOString() }, "AI skipped email");
        aiSkipped++;
        continue;
      }

      app.sourceEmailId = msgId;
      results.push(app);
      classified++;
      logger.info({ mailbox, subject, fromEmail, result: app.result, employer: app.employer }, "Email classified as job application");
    } catch (err) {
      logger.warn({ err }, "Failed to process individual email");
    }
  }

  logger.info({ mailbox, excluded, notJobRelated, aiSkipped, classified, duplicate }, "Mailbox scan filter summary");
  return results;
}

// ─── Public scan entry point ─────────────────────────────────────────────────

export async function scanEmails(
  host: string,
  port: number,
  email: string,
  credentials: { password: string } | { oauthToken: string },
  since: Date,
  until: Date | null = null,
  maxEmails: number = 200,
  provider: string = "gmail",
): Promise<{ results: ParsedApplication[]; sinceDate: Date }> {
  const client = buildImapClient(host, port, email, credentials);
  const allResults: ParsedApplication[] = [];

  await client.connect();

  // For Gmail we scan two mailboxes:
  //   [Gmail]/All Mail  — everything except Spam/Trash
  //   [Gmail]/Spam      — ATS/recruiter emails from large firms often land here
  // For other providers, INBOX is the standard single mailbox.
  const mailboxes =
    provider.toLowerCase() === "gmail"
      ? ["[Gmail]/All Mail", "[Gmail]/Spam"]
      : ["INBOX"];

  const seenIds = new Set<string>();

  try {
    for (const mailbox of mailboxes) {
      const mbResults = await scanMailbox(client, mailbox, since, until, maxEmails, seenIds);
      allResults.push(...mbResults);
    }
  } finally {
    await client.logout();
  }

  logger.info({ total: allResults.length, mailboxes }, "Total emails classified across all mailboxes");
  return { results: allResults, sinceDate: since };
}

export interface MailboxProbeResult {
  mailbox: string;
  totalMessages: number;
  recentSample: Array<{ uid: number; date: string; internalDate: string; subject: string }>;
  keywordSample: Array<{ uid: number; date: string; internalDate: string; subject: string }>;
}

export async function probeMailbox(
  host: string,
  port: number,
  email: string,
  credentials: { password: string } | { oauthToken: string },
  mailbox: string = "[Gmail]/All Mail",
  keyword: string = "interview",
): Promise<MailboxProbeResult> {
  const client = buildImapClient(host, port, email, credentials);
  await client.connect();
  try {
    const info = await client.mailboxOpen(mailbox);
    const totalMessages = info.exists ?? 0;

    // Most recent 10 UIDs by UID number
    const allUids = await client.search({ all: true });
    const recentUidNums = allUids.slice(-10);
    const recentSample: MailboxProbeResult["recentSample"] = [];
    for await (const env of client.fetch(recentUidNums, { envelope: true, internalDate: true }, { uid: true })) {
      recentSample.push({
        uid: env.uid,
        date: env.envelope?.date?.toISOString() ?? "unknown",
        internalDate: (env.internalDate as Date | undefined)?.toISOString() ?? "unknown",
        subject: (env.envelope?.subject ?? "").slice(0, 100),
      });
    }

    // Subject keyword search — first 10 and last 10
    const kwUids = await client.search({ subject: keyword });
    const kwSample = [...kwUids.slice(0, 5), ...kwUids.slice(-5)];
    const kwUniq = [...new Set(kwSample)];
    const keywordSample: MailboxProbeResult["keywordSample"] = [];
    for await (const env of client.fetch(kwUniq, { envelope: true, internalDate: true }, { uid: true })) {
      keywordSample.push({
        uid: env.uid,
        date: env.envelope?.date?.toISOString() ?? "unknown",
        internalDate: (env.internalDate as Date | undefined)?.toISOString() ?? "unknown",
        subject: (env.envelope?.subject ?? "").slice(0, 100),
      });
    }

    return { mailbox, totalMessages, recentSample, keywordSample };
  } finally {
    await client.logout();
  }
}

export async function testConnection(
  host: string,
  port: number,
  email: string,
  credentials: { password: string } | { oauthToken: string },
): Promise<void> {
  const client = buildImapClient(host, port, email, credentials);
  await client.connect();
  await client.logout();
}
