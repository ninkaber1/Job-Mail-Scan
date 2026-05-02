import { Router, type IRouter } from "express";
import { db, emailSessionsTable, applicationsTable } from "@workspace/db";
import {
  ConnectEmailBody,
  ScanEmailsBody,
} from "@workspace/api-zod";
import { getProviderConfig, obfuscate, deobfuscate } from "../lib/email-providers";
import { scanEmails, testConnection } from "../lib/email-scanner";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

router.get("/email/status", async (req, res): Promise<void> => {
  const [session] = await db
    .select()
    .from(emailSessionsTable)
    .orderBy(emailSessionsTable.createdAt)
    .limit(1);

  if (!session) {
    res.json({ connected: false, email: null, provider: null, lastScanned: null });
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

  const { provider, email, password, oauthToken, imapHost, imapPort } = parsed.data;

  if (!password && !oauthToken) {
    res.status(400).json({ error: "Either password or oauthToken is required." });
    return;
  }

  let config;
  try {
    config = getProviderConfig(provider, imapHost, imapPort);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
    return;
  }

  const credentials = oauthToken
    ? { oauthToken }
    : { password: password! };

  try {
    await testConnection(config.host, config.port, email, credentials);
  } catch (err) {
    req.log.warn({ err }, "IMAP connection test failed");
    res.status(400).json({ error: "Could not connect to email. Please check your credentials." });
    return;
  }

  await db.delete(emailSessionsTable);

  const authType = oauthToken ? "oauth_google" : "password";

  const [session] = await db
    .insert(emailSessionsTable)
    .values({
      provider,
      email,
      encryptedPassword: oauthToken ? "" : obfuscate(password!),
      authType,
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

router.post("/email/disconnect", async (req, res): Promise<void> => {
  await db.delete(emailSessionsTable);
  res.json({ connected: false, email: null, provider: null, lastScanned: null });
});

router.post("/email/scan", async (req, res): Promise<void> => {
  const body = ScanEmailsBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [session] = await db
    .select()
    .from(emailSessionsTable)
    .limit(1);

  if (!session) {
    res.status(400).json({ error: "No email connected. Please connect an email account first." });
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

  if (session.authType === "oauth_google") {
    const oauthToken = body.data.oauthToken;
    if (!oauthToken) {
      res.status(400).json({ error: "This account uses Google OAuth. Please provide a fresh oauthToken to scan." });
      return;
    }
    credentials = { oauthToken };
  } else {
    credentials = { password: deobfuscate(session.encryptedPassword) };
  }

  const daysBack = body.data.daysBack ?? 180;
  const maxEmails = body.data.maxEmails ?? 200;

  req.log.info({ email: session.email, daysBack, maxEmails, authType: session.authType }, "Starting email scan");

  let scanned: Awaited<ReturnType<typeof scanEmails>>;
  try {
    scanned = await scanEmails(config.host, config.port, session.email, credentials, daysBack, maxEmails);
  } catch (err) {
    req.log.error({ err }, "Email scan failed");
    res.status(400).json({ error: `Scan failed: ${(err as Error).message}` });
    return;
  }

  let added = 0;
  let updated = 0;

  for (const app of scanned) {
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

  req.log.info({ found: scanned.length, added, updated }, "Email scan complete");

  res.json({ found: scanned.length, added, updated });
});

export default router;
