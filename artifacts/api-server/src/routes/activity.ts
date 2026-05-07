import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { db, activityLogTable } from "@workspace/db";
import {
  CreateActivityBody,
  UpdateActivityBody,
  UpdateActivityParams,
  DeleteActivityParams,
} from "@workspace/api-zod";
import { eq, desc, and } from "drizzle-orm";

const router: IRouter = Router();

function requireAuth(req: Parameters<typeof getAuth>[0]): string | null {
  const { userId } = getAuth(req);
  return userId ?? null;
}

function serialize(entry: typeof activityLogTable.$inferSelect) {
  return {
    ...entry,
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
  };
}

router.get("/activity", async (req, res): Promise<void> => {
  const userId = requireAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Authentication required." });
    return;
  }

  const entries = await db
    .select()
    .from(activityLogTable)
    .where(eq(activityLogTable.userId, userId))
    .orderBy(desc(activityLogTable.date));

  res.json(entries.map(serialize));
});

router.post("/activity", async (req, res): Promise<void> => {
  const userId = requireAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Authentication required." });
    return;
  }

  const parsed = CreateActivityBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [entry] = await db
    .insert(activityLogTable)
    .values({ ...parsed.data, userId })
    .returning();

  res.status(201).json(serialize(entry));
});

router.patch("/activity/:id", async (req, res): Promise<void> => {
  const userId = requireAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Authentication required." });
    return;
  }

  const params = UpdateActivityParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateActivityBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [entry] = await db
    .update(activityLogTable)
    .set(parsed.data)
    .where(
      and(
        eq(activityLogTable.id, params.data.id),
        eq(activityLogTable.userId, userId),
      ),
    )
    .returning();

  if (!entry) {
    res.status(404).json({ error: "Entry not found" });
    return;
  }

  res.json(serialize(entry));
});

router.delete("/activity/:id", async (req, res): Promise<void> => {
  const userId = requireAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Authentication required." });
    return;
  }

  const params = DeleteActivityParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [entry] = await db
    .delete(activityLogTable)
    .where(
      and(
        eq(activityLogTable.id, params.data.id),
        eq(activityLogTable.userId, userId),
      ),
    )
    .returning();

  if (!entry) {
    res.status(404).json({ error: "Entry not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
