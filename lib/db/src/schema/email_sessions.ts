import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const emailSessionsTable = pgTable("email_sessions", {
  id: serial("id").primaryKey(),
  provider: text("provider").notNull(),
  email: text("email").notNull(),
  encryptedPassword: text("encrypted_password").notNull().default(""),
  authType: text("auth_type").notNull().default("password"),
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

export type InsertEmailSession = z.infer<typeof insertEmailSessionSchema>;
export type EmailSession = typeof emailSessionsTable.$inferSelect;
