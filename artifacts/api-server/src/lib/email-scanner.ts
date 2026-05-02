import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { openai } from "@workspace/integrations-openai-ai-server";
import { logger } from "./logger";

export interface ParsedApplication {
  dateOfContact: string;
  position: string | null;
  employer: string | null;
  contactName: string | null;
  methodOfContact: string;
  emailAddress: string | null;
  result: string;
  notes: string | null;
  sourceEmailId: string;
}

function buildImapClientPassword(
  host: string,
  port: number,
  email: string,
  password: string,
): ImapFlow {
  return new ImapFlow({
    host,
    port,
    secure: true,
    auth: { user: email, pass: password },
    logger: false,
    tls: { rejectUnauthorized: false },
  });
}

function buildImapClientOAuth2(
  host: string,
  port: number,
  email: string,
  accessToken: string,
): ImapFlow {
  return new ImapFlow({
    host,
    port,
    secure: true,
    auth: { user: email, accessToken },
    logger: false,
    tls: { rejectUnauthorized: false },
  });
}

function buildImapClient(
  host: string,
  port: number,
  email: string,
  credentials: { password: string } | { oauthToken: string },
): ImapFlow {
  if ("oauthToken" in credentials) {
    return buildImapClientOAuth2(host, port, email, credentials.oauthToken);
  }
  return buildImapClientPassword(host, port, email, credentials.password);
}

const JOB_KEYWORDS = [
  "application",
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
  "apply",
  "applied",
  "screening",
  "assessment",
  "rejection",
  "rejected",
  "congratulations",
  "next steps",
  "background check",
  "onboarding",
  "hr",
  "talent",
  "staffing",
  "linkedin",
  "indeed",
  "glassdoor",
  "greenhouse",
  "lever",
  "workday",
];

function isJobRelated(subject: string, body: string): boolean {
  const combined = (subject + " " + body).toLowerCase();
  return JOB_KEYWORDS.some((kw) => combined.includes(kw));
}

async function classifyEmail(
  subject: string,
  fromName: string,
  fromEmail: string,
  body: string,
  date: Date,
): Promise<ParsedApplication | null> {
  const prompt = `You are a job application tracker. Analyze this email and extract job application data.

Email:
- Date: ${date.toISOString()}
- From: ${fromName} <${fromEmail}>
- Subject: ${subject}
- Body: ${body.slice(0, 2000)}

Respond ONLY with a JSON object (no markdown, no extra text). If this email is NOT related to a job application, respond with exactly: {"skip": true}

If it IS job-related, respond with:
{
  "position": "job title or null",
  "employer": "company name or null",
  "contactName": "recruiter/hiring manager/interviewer name or null",
  "methodOfContact": "email|zoom|teams|google-meet|phone|linkedin|other",
  "result": "interview|next-stage|rejected|no-response",
  "notes": "brief summary (max 100 chars) or null"
}

Rules:
- result="interview" if they're scheduling an interview or inviting you to interview
- result="next-stage" if you're progressing but no interview scheduled yet, or got an offer
- result="rejected" if application was declined
- result="no-response" if it's an acknowledgment with no clear outcome (e.g., "we received your application")
- methodOfContact: if an interview platform (Zoom, Teams, Meet) is mentioned, use that; otherwise "email"`;

  const response = await openai.chat.completions.create({
    model: "gpt-5-mini",
    max_completion_tokens: 512,
    messages: [{ role: "user", content: prompt }],
  });

  const content = response.choices[0]?.message?.content ?? "";

  try {
    const parsed = JSON.parse(content.trim());
    if (parsed.skip) return null;

    return {
      dateOfContact: date.toISOString().split("T")[0],
      position: parsed.position ?? null,
      employer: parsed.employer ?? null,
      contactName: parsed.contactName ?? null,
      methodOfContact: parsed.methodOfContact ?? "email",
      emailAddress: fromEmail,
      result: parsed.result ?? "no-response",
      notes: parsed.notes ?? null,
      sourceEmailId: "",
    };
  } catch {
    logger.warn({ content }, "Failed to parse AI response for email");
    return null;
  }
}

export async function scanEmails(
  host: string,
  port: number,
  email: string,
  credentials: { password: string } | { oauthToken: string },
  daysBack: number = 180,
  maxEmails: number = 200,
): Promise<ParsedApplication[]> {
  const client = buildImapClient(host, port, email, credentials);
  const results: ParsedApplication[] = [];

  await client.connect();

  try {
    await client.mailboxOpen("INBOX");

    const since = new Date();
    since.setDate(since.getDate() - daysBack);

    const messageUids = await client.search({ since });
    const uids = messageUids.slice(-maxEmails);

    logger.info({ count: uids.length, email }, "Fetching emails for scan");

    for await (const msg of client.fetch(
      uids.length > 0 ? uids : ["1:*"],
      { source: true, uid: true },
      { uid: true },
    )) {
      try {
        const parsed = await simpleParser(msg.source);
        const subject = parsed.subject ?? "";
        const textBody =
          typeof parsed.text === "string" ? parsed.text : (parsed.html ?? "");
        const fromAddress = parsed.from?.value[0];
        const fromEmail = fromAddress?.address ?? "";
        const fromName = fromAddress?.name ?? fromEmail;
        const date = parsed.date ?? new Date();
        const msgId = parsed.messageId ?? `uid-${msg.uid}`;

        if (!isJobRelated(subject, textBody)) continue;

        const app = await classifyEmail(
          subject,
          fromName,
          fromEmail,
          textBody,
          date,
        );
        if (!app) continue;

        app.sourceEmailId = msgId;
        results.push(app);
      } catch (err) {
        logger.warn({ err }, "Failed to process individual email");
      }
    }
  } finally {
    await client.logout();
  }

  return results;
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
