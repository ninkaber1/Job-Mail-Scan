import {
  pgTable,
  text,
  serial,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const applicationsTable = pgTable("applications", {
  id: serial("id").primaryKey(),
  dateOfContact: text("date_of_contact").notNull(),
  position: text("position"),
  employer: text("employer"),
  contactName: text("contact_name"),
  methodOfContact: text("method_of_contact").notNull().default("email"),
  emailAddress: text("email_address"),
  result: text("result").notNull().default("no-response"),
  notes: text("notes"),
  sourceEmailId: text("source_email_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertApplicationSchema = createInsertSchema(
  applicationsTable,
).omit({ id: true, createdAt: true, updatedAt: true });

export type InsertApplication = z.infer<typeof insertApplicationSchema>;
export type Application = typeof applicationsTable.$inferSelect;
