import { Router, type IRouter } from "express";
import { clerkClient, getAuth } from "@clerk/express";
import { db, emailSessionsTable, applicationsTable } from "@workspace/db";
import { ConnectEmailBody, ScanEmailsBody } from "@workspace/api-zod";
import {
  getProviderConfig,
  obfuscate,
  deobfuscate,
} from "../lib/email-providers";
import { scanEmails, testConnection } from "../lib/email-scanner";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

async function getClerkGoogleToken(
  userId: string,
): Promise<{ token: string } | { error: string; scopesMissing?: boolean }> {
  const tokens = await clerkClient.users.getUserOauthAccessToken(
    userId,
    "google",
  );

  if (!tokens.data?.length) {
    return {
      error:
        "No Google OAuth token found. Make sure you signed in with Google and try reconnecting.",
    };
  }

  const tokenObj = tokens.data[0];
  const scopes = tokenObj.scopes ?? [];

  if (!scopes.includes("https://mail.google.com/")) {
    return {
      error:
        `Gmail access not granted. Your Google sign-in doesn't include Gmail scope. ` +
        `To fix: go to your Clerk dashboard → SSO Connections → Google → add ` +
        `"https://mail.google.com/" to scopes, then sign out and sign back in.`,
      scopesMissing: true,
    };
  }

  return { token: tokenObj.token };
}

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

  let credentials: { password: string } | { oauthToken: string };
  let authType: string;

  if (!password) {
    const { userId } = getAuth(req);
    req.log.info({ userId: userId ?? "null", provider, email }, "Google OAuth connect attempt");
    if (!userId) {
      res.status(400).json({
        error:
          "Not authenticated. Please sign in and try again.",
      });
      return;
    }

    const result = await getClerkGoogleToken(userId);
    if ("error" in result) {
      res.status(400).json({ error: result.error });
      return;
    }

    credentials = { oauthToken: result.token };
    authType = "oauth_google";
  } else {
    credentials = { password };
    authType = "password";
  }

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
      encryptedPassword:
        authType === "password" ? obfuscate(password as string) : "",
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

  const [session] = await db.select().from(emailSessionsTable).limit(1);

  if (!session) {
    res.status(400).json({
      error:
        "No email connected. Please connect an email account first.",
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

  if (session.authType === "oauth_google") {
    const { userId } = getAuth(req);
    if (!userId) {
      res.status(401).json({ error: "Authentication required." });
      return;
    }

    const result = await getClerkGoogleToken(userId);
    if ("error" in result) {
      res.status(400).json({ error: result.error });
      return;
    }

    credentials = { oauthToken: result.token };
  } else {
    credentials = { password: deobfuscate(session.encryptedPassword) };
  }

  const daysBack = body.data.daysBack ?? 180;
  const maxEmails = body.data.maxEmails ?? 200;

  req.log.info(
    { email: session.email, daysBack, maxEmails, authType: session.authType },
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
    );
  } catch (err) {
    req.log.error({ err }, "Email scan failed");
    res
      .status(400)
      .json({ error: `Scan failed: ${(err as Error).message}` });
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
