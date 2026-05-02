import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { db, emailSessionsTable } from "@workspace/db";
import crypto from "crypto";
import { logger } from "../lib/logger";
import { testConnection } from "../lib/email-scanner";
import { getProviderConfig } from "../lib/email-providers";

const router: IRouter = Router();

const GMAIL_SCOPE = [
  "https://mail.google.com/",
  "https://www.googleapis.com/auth/userinfo.email",
].join(" ");

function getCallbackUrl(): string {
  const domains = process.env.REPLIT_DOMAINS;
  if (domains) {
    return `https://${domains.split(",")[0]}/api/auth/google/callback`;
  }
  return `http://localhost:${process.env.PORT ?? 8080}/api/auth/google/callback`;
}

function signState(data: object): string {
  const payload = JSON.stringify(data);
  const secret = process.env.SESSION_SECRET ?? "insecure-dev";
  const sig = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  return Buffer.from(JSON.stringify({ payload, sig })).toString("base64url");
}

function verifyState(state: string): { userId: string; email: string } | null {
  try {
    const { payload, sig } = JSON.parse(Buffer.from(state, "base64url").toString());
    const secret = process.env.SESSION_SECRET ?? "insecure-dev";
    const expected = crypto.createHmac("sha256", secret).update(payload).digest("hex");
    if (sig !== expected) return null;
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

function getFrontendBase(): string {
  const domains = process.env.REPLIT_DOMAINS;
  if (domains) return `https://${domains.split(",")[0]}`;
  return "";
}

/** Returns whether Google OAuth is configured (client ID + secret both present) */
router.get("/auth/google/status", (_req, res): void => {
  const configured =
    !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  res.json({ configured });
});

/** Redirects the user to Google's OAuth consent screen */
router.get("/auth/google/authorize", (req, res): void => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    res.status(503).json({
      error:
        "Google OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables.",
    });
    return;
  }

  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "You must be signed in to connect Gmail." });
    return;
  }

  const email = (req.query.email as string | undefined) ?? "";
  const state = signState({ userId, email });
  const redirectUri = getCallbackUrl();

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GMAIL_SCOPE,
    access_type: "offline",
    prompt: "consent",
    state,
    login_hint: email,
  });

  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

/** Google OAuth callback — exchanges code for tokens and saves them */
router.get("/auth/google/callback", async (req, res): Promise<void> => {
  const { code, state, error } = req.query as Record<string, string>;
  const frontendBase = getFrontendBase();

  if (error) {
    logger.warn({ error }, "Google OAuth denied by user");
    res.redirect(`${frontendBase}/connect?error=denied`);
    return;
  }

  if (!code || !state) {
    res.redirect(`${frontendBase}/connect?error=invalid`);
    return;
  }

  const stateData = verifyState(state);
  if (!stateData) {
    res.redirect(`${frontendBase}/connect?error=invalid_state`);
    return;
  }

  const clientId = process.env.GOOGLE_CLIENT_ID!;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET!;
  const redirectUri = getCallbackUrl();

  // Exchange authorization code for tokens
  let tokenData: {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    token_type: string;
    email?: string;
  };

  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      logger.error({ err }, "Google token exchange failed");
      res.redirect(`${frontendBase}/connect?error=token_exchange`);
      return;
    }

    tokenData = await tokenRes.json();
  } catch (err) {
    logger.error({ err }, "Google token exchange network error");
    res.redirect(`${frontendBase}/connect?error=network`);
    return;
  }

  // Get the user's email via the userinfo endpoint
  let googleEmail = stateData.email;
  try {
    const infoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    if (infoRes.ok) {
      const info = await infoRes.json();
      googleEmail = info.email ?? googleEmail;
    }
  } catch {
    // non-fatal — we'll use the hint email
  }

  if (!googleEmail) {
    res.redirect(`${frontendBase}/connect?error=no_email`);
    return;
  }

  // Test IMAP connection with the new OAuth token
  try {
    const config = getProviderConfig("gmail");
    await testConnection(config.host, config.port, googleEmail, {
      oauthToken: tokenData.access_token,
    });
  } catch (err) {
    logger.error({ err }, "IMAP test failed with Google OAuth token");
    res.redirect(`${frontendBase}/connect?error=imap_failed`);
    return;
  }

  const expiresAt = Date.now() + tokenData.expires_in * 1000;

  // Save to DB (replace any existing session)
  await db.delete(emailSessionsTable);
  await db.insert(emailSessionsTable).values({
    provider: "gmail",
    email: googleEmail,
    encryptedPassword: "",
    authType: "oauth_google_native",
    googleAccessToken: tokenData.access_token,
    googleRefreshToken: tokenData.refresh_token ?? null,
    googleTokenExpiresAt: expiresAt,
    imapHost: null,
    imapPort: null,
  });

  logger.info({ email: googleEmail }, "Gmail connected via Google OAuth");
  res.redirect(`${frontendBase}/connect?connected=true`);
});

export default router;
