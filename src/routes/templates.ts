import { Router, type Request, type Response } from "express";
import { z } from "zod/v4";
import { eq } from "drizzle-orm";
import { db } from "../lib/db";
import {
  notificationTemplatesTable,
  insertTemplateSchema,
  updateTemplateSchema,
} from "../schema";

const router = Router();

router.get("/", async (_req: Request, res: Response) => {
  const templates = await db
    .select()
    .from(notificationTemplatesTable)
    .orderBy(notificationTemplatesTable.name);
  res.json(templates);
});

router.post("/", async (req: Request, res: Response) => {
  const parsed = insertTemplateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Validation failed", issues: parsed.error.issues });
    return;
  }

  try {
    const [template] = await db
      .insert(notificationTemplatesTable)
      .values(parsed.data)
      .returning();
    res.status(201).json(template);
  } catch (err: unknown) {
    const isDuplicate =
      err instanceof Error &&
      (err.message.includes("duplicate key") ||
        err.message.includes("unique constraint") ||
        (err as { cause?: { code?: string } }).cause?.code === "23505");
    if (isDuplicate) {
      res.status(409).json({
        error: `A template named "${parsed.data.name}" for channel "${parsed.data.channel}" already exists`,
      });
      return;
    }
    throw err;
  }
});

router.get("/:id", async (req: Request, res: Response) => {
  const id = String(req.params["id"]);

  const [template] = await db
    .select()
    .from(notificationTemplatesTable)
    .where(eq(notificationTemplatesTable.id, id))
    .limit(1);

  if (!template) {
    res.status(404).json({ error: "Template not found" });
    return;
  }
  res.json(template);
});

router.put("/:id", async (req: Request, res: Response) => {
  const id = String(req.params["id"]);

  const parsed = updateTemplateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Validation failed", issues: parsed.error.issues });
    return;
  }

  const [updated] = await db
    .update(notificationTemplatesTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(notificationTemplatesTable.id, id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Template not found" });
    return;
  }
  res.json(updated);
});

router.delete("/:id", async (req: Request, res: Response) => {
  const id = String(req.params["id"]);

  const [deleted] = await db
    .delete(notificationTemplatesTable)
    .where(eq(notificationTemplatesTable.id, id))
    .returning({ id: notificationTemplatesTable.id });

  if (!deleted) {
    res.status(404).json({ error: "Template not found" });
    return;
  }
  res.status(204).send();
});

export default router;
