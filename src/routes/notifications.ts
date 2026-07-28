import { Router, type Request, type Response } from "express";
import { z } from "zod/v4";
import { eq, and, desc, sql } from "drizzle-orm";
import { db } from "../lib/db";
import { notificationsTable, notificationStatusEnum } from "../schema";

const router = Router();

const listQuerySchema = z.object({
  userId: z.string().optional(),
  channel: z.enum(["email", "sms", "push"]).optional(),
  status: z.enum(notificationStatusEnum).optional(),
  limit: z.coerce.number().min(1).max(100).default(20),
  offset: z.coerce.number().min(0).default(0),
});

router.get("/", async (req: Request, res: Response) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid query", issues: parsed.error.issues });
    return;
  }

  const { userId, channel, status, limit, offset } = parsed.data;

  const conditions = [];
  if (userId) conditions.push(eq(notificationsTable.userId, userId));
  if (channel) conditions.push(eq(notificationsTable.channel, channel));
  if (status) conditions.push(eq(notificationsTable.status, status));

  const rows = await db
    .select()
    .from(notificationsTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(notificationsTable.createdAt))
    .limit(limit)
    .offset(offset);

  const [countRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(notificationsTable)
    .where(conditions.length ? and(...conditions) : undefined);

  res.json({
    data: rows,
    total: countRow?.count ?? 0,
    limit,
    offset,
  });
});

router.get("/:id", async (req: Request, res: Response) => {
  const id = String(req.params["id"]);

  const [notification] = await db
    .select()
    .from(notificationsTable)
    .where(eq(notificationsTable.id, id))
    .limit(1);

  if (!notification) {
    res.status(404).json({ error: "Notification not found" });
    return;
  }

  res.json(notification);
});

router.patch("/:id/cancel", async (req: Request, res: Response) => {
  const id = String(req.params["id"]);

  const [existing] = await db
    .select({ status: notificationsTable.status })
    .from(notificationsTable)
    .where(eq(notificationsTable.id, id))
    .limit(1);

  if (!existing) {
    res.status(404).json({ error: "Notification not found" });
    return;
  }

  if (existing.status !== "pending") {
    res.status(409).json({
      error: `Cannot cancel notification with status "${existing.status}"`,
    });
    return;
  }

  const [updated] = await db
    .update(notificationsTable)
    .set({ status: "cancelled" })
    .where(eq(notificationsTable.id, id))
    .returning();

  res.json(updated);
});

export default router;
