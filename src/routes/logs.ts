import { Router, type Request, type Response } from "express";
import { z } from "zod/v4";
import { eq, desc } from "drizzle-orm";
import { db } from "../lib/db";
import { notificationLogsTable } from "../schema";

const router = Router();

const listQuerySchema = z.object({
  notificationId: z.string().uuid().optional(),
  limit: z.coerce.number().min(1).max(200).default(50),
  offset: z.coerce.number().min(0).default(0),
});

router.get("/", async (req: Request, res: Response) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid query", issues: parsed.error.issues });
    return;
  }

  const { notificationId, limit, offset } = parsed.data;

  const rows = await db
    .select()
    .from(notificationLogsTable)
    .where(
      notificationId
        ? eq(notificationLogsTable.notificationId, notificationId)
        : undefined,
    )
    .orderBy(desc(notificationLogsTable.createdAt))
    .limit(limit)
    .offset(offset);

  res.json(rows);
});

export default router;
