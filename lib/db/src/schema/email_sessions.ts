import { pgTable, text, serial, timestamp, bigint } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

export const emailSessionsTable = pgTable("email_sessions", {
  id: serial("id").primaryKey(),
  userId: text("user_id"),
  provider: text("provider").notNull(),
  email: text("email").notNull(),
  encryptedPassword: text("encrypted_password").notNull().default(""),
  authType: text("auth_type").notNull().default("password"),
  // Google OAuth native tokens (used when authType = 'oauth_google_native')
  googleAccessToken: text("google_access_token"),
  googleRefreshToken: text("google_refresh_token"),
  googleTokenExpiresAt: bigint("google_token_expires_at", { mode: "number" }),
  imapHost: text("imap_host"),
  imapPort: text("imap_port"),
  lastScanned: timestamp("last_scanned", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertEmailSessionSchema = createInsertSchema(
  emailSessionsTable,
).omit({ id: true, createdAt: true, updatedAt: true });
