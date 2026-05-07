import {
  pgTable,
  text,
  serial,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

export const activityLogTable = pgTable(
  "activity_log",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id"),
    date: text("date").notNull(),
    description: text("description").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("activity_log_user_id_idx").on(t.userId)],
);

export type ActivityLog = typeof activityLogTable.$inferSelect;
