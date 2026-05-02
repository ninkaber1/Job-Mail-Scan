import { Router, type IRouter } from "express";
import { db, applicationsTable } from "@workspace/db";
import {
  CreateApplicationBody,
  UpdateApplicationBody,
  GetApplicationParams,
  UpdateApplicationParams,
  DeleteApplicationParams,
  ListApplicationsQueryParams,
} from "@workspace/api-zod";
import { eq, desc, and, ilike, or } from "drizzle-orm";

const router: IRouter = Router();

router.get("/applications/summary", async (_req, res): Promise<void> => {
  const all = await db
    .select()
    .from(applicationsTable)
    .orderBy(desc(applicationsTable.dateOfContact));

  const byResult = {
    interview: 0,
    nextStage: 0,
    rejected: 0,
    noResponse: 0,
  };

  for (const app of all) {
    if (app.result === "interview") byResult.interview++;
    else if (app.result === "next-stage") byResult.nextStage++;
    else if (app.result === "rejected") byResult.rejected++;
    else byResult.noResponse++;
  }

  const recentActivity = all.slice(0, 5).map((app) => ({
    ...app,
    dateOfContact: app.dateOfContact,
    createdAt: app.createdAt.toISOString(),
    updatedAt: app.updatedAt.toISOString(),
  }));

  res.json({
    total: all.length,
    byResult,
    recentActivity,
  });
});

router.get("/applications", async (req, res): Promise<void> => {
  const queryParsed = ListApplicationsQueryParams.safeParse(req.query);

  const filters = [];

  if (queryParsed.success) {
    if (queryParsed.data.result) {
      filters.push(eq(applicationsTable.result, queryParsed.data.result));
    }
    if (queryParsed.data.search) {
      const s = `%${queryParsed.data.search}%`;
      filters.push(
        or(
          ilike(applicationsTable.position, s),
          ilike(applicationsTable.employer, s),
          ilike(applicationsTable.contactName, s),
          ilike(applicationsTable.emailAddress, s),
        ),
      );
    }
  }

  const apps = await db
    .select()
    .from(applicationsTable)
    .where(filters.length > 0 ? and(...filters) : undefined)
    .orderBy(desc(applicationsTable.dateOfContact));

  res.json(
    apps.map((app) => ({
      ...app,
      createdAt: app.createdAt.toISOString(),
      updatedAt: app.updatedAt.toISOString(),
    })),
  );
});

router.post("/applications", async (req, res): Promise<void> => {
  const parsed = CreateApplicationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [app] = await db
    .insert(applicationsTable)
    .values(parsed.data)
    .returning();

  res.status(201).json({
    ...app,
    createdAt: app.createdAt.toISOString(),
    updatedAt: app.updatedAt.toISOString(),
  });
});

router.get("/applications/:id", async (req, res): Promise<void> => {
  const params = GetApplicationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [app] = await db
    .select()
    .from(applicationsTable)
    .where(eq(applicationsTable.id, params.data.id));

  if (!app) {
    res.status(404).json({ error: "Application not found" });
    return;
  }

  res.json({
    ...app,
    createdAt: app.createdAt.toISOString(),
    updatedAt: app.updatedAt.toISOString(),
  });
});

router.patch("/applications/:id", async (req, res): Promise<void> => {
  const params = UpdateApplicationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateApplicationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [app] = await db
    .update(applicationsTable)
    .set(parsed.data)
    .where(eq(applicationsTable.id, params.data.id))
    .returning();

  if (!app) {
    res.status(404).json({ error: "Application not found" });
    return;
  }

  res.json({
    ...app,
    createdAt: app.createdAt.toISOString(),
    updatedAt: app.updatedAt.toISOString(),
  });
});

router.delete("/applications/:id", async (req, res): Promise<void> => {
  const params = DeleteApplicationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [app] = await db
    .delete(applicationsTable)
    .where(eq(applicationsTable.id, params.data.id))
    .returning();

  if (!app) {
    res.status(404).json({ error: "Application not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
