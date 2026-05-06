import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { db, emailSessionsTable, applicationsTable } from "@workspace/db";
import { ConnectEmailBody, ScanEmailsBody } from "@workspace/api-zod";
import {
  getProviderConfig,
  obfuscate,
  deobfuscate,
} from "../lib/email-providers";
import { scanEmails, scanEmailsViaGmailApi, testConnection, probeMailbox } from "../lib/email-scanner";
import { eq, lt, and } from "drizzle-orm";

const router: IRouter = Router();

// ─── Google OAuth token refresh ───────────────────────────────────────────────

async function refreshGoogleToken(
  refreshToken: string,
): Promise<{ accessToken: string; expiresAt: number }> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Google token refresh failed: ${body}`);
  }

  const data = await res.json();
  return {
    accessToken: data.access_token as string,
    expiresAt: Date.now() + (data.expires_in as number) * 1000,
  };
}

/** Returns a valid Google access token, refreshing it if necessary. */
async function getValidGoogleToken(
  session: typeof emailSessionsTable.$inferSelect,
): Promise<string> {
  const BUFFER_MS = 5 * 60 * 1000;

  if (
    session.googleAccessToken &&
    session.googleTokenExpiresAt &&
    session.googleTokenExpiresAt - Date.now() > BUFFER_MS
  ) {
    return session.googleAccessToken;
  }

  if (!session.googleRefreshToken) {
    throw new Error(
      "Gmail session expired and no refresh token is available. Please reconnect Gmail.",
    );
  }

  const { accessToken, expiresAt } = await refreshGoogleToken(
    session.googleRefreshToken,
  );

  await db
    .update(emailSessionsTable)
    .set({ googleAccessToken: accessToken, googleTokenExpiresAt: expiresAt })
    .where(eq(emailSessionsTable.id, session.id));

  return accessToken;
}

// ─── Routes ───────────────────────────────────────────────────────────────────

router.get("/email/status", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Authentication required." });
    return;
  }

  const sessions = await db
    .select()
    .from(emailSessionsTable)
    .where(eq(emailSessionsTable.userId, userId))
    .orderBy(emailSessionsTable.createdAt);

  res.json({
    accounts: sessions.map((s) => ({
      id: s.id,
      email: s.email,
      provider: s.provider,
      lastScanned: s.lastScanned?.toISOString() ?? null,
    })),
  });
});

router.post("/email/connect", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Authentication required." });
    return;
  }

  const parsed = ConnectEmailBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { provider, email, password, imapHost, imapPort } = parsed.data;

  let config;
  try {
    config = getProviderConfig(provider, imapHost, imapPort);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
    return;
  }

  const credentials: { password: string } = { password: password ?? "" };

  try {
    await testConnection(config.host, config.port, email, credentials);
  } catch (err) {
    req.log.warn({ err }, "IMAP connection test failed");
    res.status(400).json({
      error:
        "Could not connect to email. Please check your credentials and try again.",
    });
    return;
  }

  // Upsert: update existing session for this user+email, or insert new
  const existing = await db
    .select()
    .from(emailSessionsTable)
    .where(
      and(
        eq(emailSessionsTable.userId, userId),
        eq(emailSessionsTable.email, email),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(emailSessionsTable)
      .set({
        provider,
        encryptedPassword: obfuscate(password ?? ""),
        authType: "password",
        imapHost: imapHost ?? null,
        imapPort: imapPort != null ? String(imapPort) : null,
      })
      .where(eq(emailSessionsTable.id, existing[0].id));
  } else {
    await db.insert(emailSessionsTable).values({
      userId,
      provider,
      email,
      encryptedPassword: obfuscate(password ?? ""),
      authType: "password",
      imapHost: imapHost ?? null,
      imapPort: imapPort != null ? String(imapPort) : null,
    });
  }

  res.json({ connected: true, email, provider });
});

router.post("/email/disconnect", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Authentication required." });
    return;
  }

  const sessionId = req.body?.sessionId as number | undefined;

  if (sessionId) {
    await db
      .delete(emailSessionsTable)
      .where(
        and(
          eq(emailSessionsTable.userId, userId),
          eq(emailSessionsTable.id, sessionId),
        ),
      );
  } else {
    await db
      .delete(emailSessionsTable)
      .where(eq(emailSessionsTable.userId, userId));
  }

  res.json({ success: true });
});

router.post("/email/scan", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Authentication required." });
    return;
  }

  const body = ScanEmailsBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const sessions = await db
    .select()
    .from(emailSessionsTable)
    .where(eq(emailSessionsTable.userId, userId));

  if (sessions.length === 0) {
    res.status(400).json({
      error: "No email connected. Please connect an email account first.",
    });
    return;
  }

  const maxEmails = body.data.maxEmails ?? 200;
  const clearPrevious = body.data.clearPrevious !== false;
  const daysBack = body.data.daysBack ?? 90;
  const dateFrom = body.data.dateFrom ?? null;
  const dateTo = body.data.dateTo ?? null;

  req.log.info(
    { dateFrom, dateTo, daysBack, maxEmails, clearPrevious, accounts: sessions.length },
    "Starting email scan",
  );

  let totalFound = 0;
  let totalAdded = 0;
  let totalUpdated = 0;
  let totalDeleted = 0;

  for (const session of sessions) {
    req.log.info({ email: session.email, authType: session.authType, dateFrom, dateTo, daysBack, maxEmails }, "Scanning session");

    let scanned: { results: Awaited<ReturnType<typeof scanEmails>>["results"]; sinceDate: Date };

    if (session.authType === "oauth_google_native") {
      let token: string;
      try {
        token = await getValidGoogleToken(session);
      } catch (err) {
        req.log.warn({ err, email: session.email }, "Skipping session: OAuth token refresh failed");
        continue;
      }
      try {
        scanned = await scanEmailsViaGmailApi(token, daysBack, maxEmails, dateFrom, dateTo);
      } catch (err) {
        req.log.error({ err, email: session.email }, "Gmail API scan failed for session");
        continue;
      }
    } else {
      let config;
      try {
        config = getProviderConfig(
          session.provider,
          session.imapHost,
          session.imapPort ? parseInt(session.imapPort, 10) : null,
        );
      } catch (err) {
        req.log.warn({ err, email: session.email }, "Skipping session with invalid provider config");
        continue;
      }

      const since = dateFrom ? new Date(dateFrom) : (() => { const d = new Date(); d.setDate(d.getDate() - daysBack); return d; })();
      const until = dateTo ? (() => { const d = new Date(dateTo); d.setHours(23, 59, 59, 999); return d; })() : null;

      const credentials = { password: deobfuscate(session.encryptedPassword) };
      try {
        scanned = await scanEmails(
          config.host,
          config.port,
          session.email,
          credentials,
          since,
          until,
          maxEmails,
          session.provider,
        );
      } catch (err) {
        req.log.error({ err, email: session.email }, "IMAP scan failed for session");
        continue;
      }
    }

    if (clearPrevious) {
      const sinceStr = scanned.sinceDate.toISOString().split("T")[0];
      const deleted = await db
        .delete(applicationsTable)
        .where(
          and(
            eq(applicationsTable.userId, userId),
            lt(applicationsTable.dateOfContact, sinceStr),
          ),
        )
        .returning({ id: applicationsTable.id });
      totalDeleted += deleted.length;
      req.log.info(
        { deleted: deleted.length, since: sinceStr, email: session.email },
        "Cleared applications outside scan window",
      );
    }

    let added = 0;
    let updated = 0;

    for (const app of scanned.results) {
      const existing = await db
        .select()
        .from(applicationsTable)
        .where(
          and(
            eq(applicationsTable.userId, userId),
            eq(applicationsTable.sourceEmailId, app.sourceEmailId),
          ),
        )
        .limit(1);

      if (existing.length > 0) {
        await db
          .update(applicationsTable)
          .set({
            result: app.result,
            notes: app.notes,
            contactName: app.contactName,
            interviewerInfo: app.interviewerInfo,
            methodOfContact: app.methodOfContact,
          })
          .where(eq(applicationsTable.id, existing[0].id));
        updated++;
      } else {
        await db.insert(applicationsTable).values({ ...app, userId });
        added++;
      }
    }

    await db
      .update(emailSessionsTable)
      .set({ lastScanned: new Date() })
      .where(eq(emailSessionsTable.id, session.id));

    totalFound += scanned.results.length;
    totalAdded += added;
    totalUpdated += updated;
  }

  req.log.info(
    { totalFound, totalAdded, totalUpdated, totalDeleted },
    "Email scan complete",
  );
  res.json({ found: totalFound, added: totalAdded, updated: totalUpdated });
});

// ─── Diagnostic probe (dev only) ──────────────────────────────────────────────
router.post("/email/probe", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Authentication required." });
    return;
  }

  const [session] = await db
    .select()
    .from(emailSessionsTable)
    .where(eq(emailSessionsTable.userId, userId))
    .limit(1);

  if (!session) {
    res.status(400).json({ error: "No email session" });
    return;
  }

  let config;
  try {
    config = getProviderConfig(
      session.provider,
      session.imapHost,
      session.imapPort ? parseInt(session.imapPort, 10) : null,
    );
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
    return;
  }

  const credentials = { password: deobfuscate(session.encryptedPassword) };
  const mailbox = (req.body.mailbox as string | undefined) ?? "[Gmail]/All Mail";
  const keyword = (req.body.keyword as string | undefined) ?? "interview";

  try {
    const result = await probeMailbox(
      config.host,
      config.port,
      session.email,
      credentials,
      mailbox,
      keyword,
    );
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
