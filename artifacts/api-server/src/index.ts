import app from "./app";
import { logger } from "./lib/logger";
import { db, applicationsTable, emailSessionsTable } from "@workspace/db";
import { isNull } from "drizzle-orm";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function cleanupOrphanedRows() {
  try {
    const deletedApps = await db
      .delete(applicationsTable)
      .where(isNull(applicationsTable.userId))
      .returning({ id: applicationsTable.id });

    const deletedSessions = await db
      .delete(emailSessionsTable)
      .where(isNull(emailSessionsTable.userId))
      .returning({ id: emailSessionsTable.id });

    if (deletedApps.length > 0 || deletedSessions.length > 0) {
      logger.info(
        { deletedApps: deletedApps.length, deletedSessions: deletedSessions.length },
        "Cleaned up orphaned rows with null user_id",
      );
    }
  } catch (err) {
    logger.error({ err }, "Failed to clean up orphaned rows — continuing startup");
  }
}

cleanupOrphanedRows().then(() => {
  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ port }, "Server listening");
  });
});
