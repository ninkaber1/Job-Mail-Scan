import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { db, emailSessionsTable, applicationsTable } from "@workspace/db";
import { ConnectEmailBody, ScanEmailsBody } from "@workspace/api-zod";
import {
  getProviderConfig,
  obfuscate,
  deobfuscate,
} from "../lib/email-providers";
import { scanEmails, testConnection } from "../lib/email-scanner";
import { eq, lt } from "drizzle-orm";

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
  const BUFFER_MS = 5 * 60 * 1000; // refresh 5 min before expiry

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

  // Persist updated token
  await db
    .update(emailSessionsTable)
    .set({ googleAccessToken: accessToken, googleTokenExpiresAt: expiresAt })
    .where(eq(emailSessionsTable.id, session.id));

  return accessToken;
}

// ─── Routes ───────────────────────────────────────────────────────────────────

router.get("/email/status", async (req, res): Promise<void> => {
  const [session] = await db
    .select()
    .from(emailSessionsTable)
    .orderBy(emailSessionsTable.createdAt)
    .limit(1);

  if (!session) {
    res.json({
      connected: false,
      email: null,
      provider: null,
      lastScanned: null,
    });
    return;
  }

  res.json({
    connected: true,
    email: session.email,
    provider: session.provider,
    lastScanned: session.lastScanned?.toISOString() ?? null,
  });
});

router.post("/email/connect", async (req, res): Promise<void> => {
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

  await db.delete(emailSessionsTable);

  const [session] = await db
    .insert(emailSessionsTable)
    .values({
      provider,
      email,
      encryptedPassword: obfuscate(password ?? ""),
      authType: "password",
      imapHost: imapHost ?? null,
      imapPort: imapPort != null ? String(imapPort) : null,
    })
    .returning();

  res.json({
    connected: true,
    email: session.email,
    provider: session.provider,
    lastScanned: null,
  });
});

router.post("/email/disconnect", async (_req, res): Promise<void> => {
  await db.delete(emailSessionsTable);
  res.json({ connected: false, email: null, provider: null, lastScanned: null });
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

  const [session] = await db.select().from(emailSessionsTable).limit(1);

  if (!session) {
    res.status(400).json({
      error: "No email connected. Please connect an email account first.",
    });
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

  let credentials: { password: string } | { oauthToken: string };

  if (session.authType === "oauth_google_native") {
    try {
      const token = await getValidGoogleToken(session);
      credentials = { oauthToken: token };
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
      return;
    }
  } else {
    credentials = { password: deobfuscate(session.encryptedPassword) };
  }

  const daysBack = body.data.daysBack ?? 90;
  const maxEmails = body.data.maxEmails ?? 200;
  // Default: clear entries outside the scan window so the dashboard reflects reality
  const clearPrevious = body.data.clearPrevious !== false;

  req.log.info(
    { email: session.email, daysBack, maxEmails, clearPrevious, authType: session.authType },
    "Starting email scan",
  );

  let scanned: Awaited<ReturnType<typeof scanEmails>>;
  try {
    scanned = await scanEmails(
      config.host,
      config.port,
      session.email,
      credentials,
      daysBack,
      maxEmails,
      session.provider,
    );
  } catch (err) {
    req.log.error({ err }, "Email scan failed");
    res.status(400).json({ error: `Scan failed: ${(err as Error).message}` });
    return;
  }

  // Optionally remove applications that fall outside the scan window
  let deleted = 0;
  if (clearPrevious) {
    const sinceStr = scanned.sinceDate.toISOString().split("T")[0];
    const result = await db
      .delete(applicationsTable)
      .where(lt(applicationsTable.dateOfContact, sinceStr))
      .returning({ id: applicationsTable.id });
    deleted = result.length;
    req.log.info({ deleted, since: sinceStr }, "Cleared applications outside scan window");
  }

  let added = 0;
  let updated = 0;

  for (const app of scanned.results) {
    const existing = await db
      .select()
      .from(applicationsTable)
      .where(eq(applicationsTable.sourceEmailId, app.sourceEmailId))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(applicationsTable)
        .set({
          result: app.result,
          notes: app.notes,
          contactName: app.contactName,
          methodOfContact: app.methodOfContact,
        })
        .where(eq(applicationsTable.id, existing[0].id));
      updated++;
    } else {
      await db.insert(applicationsTable).values(app);
      added++;
    }
  }

  await db
    .update(emailSessionsTable)
    .set({ lastScanned: new Date() })
    .where(eq(emailSessionsTable.id, session.id));

  req.log.info({ found: scanned.results.length, added, updated, deleted }, "Email scan complete");
  res.json({ found: scanned.results.length, added, updated });
});

export default router;
