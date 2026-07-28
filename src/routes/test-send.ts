import { Router, type Request, type Response } from "express";
import { z } from "zod/v4";
import { emailQueue, smsQueue, pushQueue } from "../queues";
import { db } from "../lib/db";
import { notificationsTable } from "../schema";
import { safeAdd } from "../lib/safe-queue";
import { logger } from "../lib/logger";

const router = Router();

const testSchema = z.object({
  channel: z.enum(["email", "sms", "push"]),
  userId: z.string().default("test-user"),
  to: z.string().min(1),
  subject: z.string().optional(),
  content: z
    .string()
    .default("This is a test notification from notification-service."),
  title: z.string().optional(),
});

router.post("/test", async (req: Request, res: Response) => {
  if (process.env.NODE_ENV === "production") {
    res.status(403).json({ error: "Test endpoint disabled in production" });
    return;
  }

  const parsed = testSchema.safeParse(req.body);
  if (!parsed.success) {
    res
      .status(400)
      .json({ error: "Validation failed", issues: parsed.error.issues });
    return;
  }

  const { channel, userId, to, subject, content, title } = parsed.data;

  const [notification] = await db
    .insert(notificationsTable)
    .values({
      userId,
      channel,
      template: "test",
      status: "pending",
      payload: { test: true, to } as Record<string, unknown>,
    })
    .returning();

  const jobId = `test-${Date.now()}`;

  if (channel === "email") {
    await safeAdd(emailQueue, jobId, {
      notificationId: notification.id,
      to,
      subject: subject ?? "Test Notification",
      html: `<p>${content}</p>`,
    });
  } else if (channel === "sms") {
    await safeAdd(smsQueue, jobId, {
      notificationId: notification.id,
      to,
      body: content,
    });
  } else {
    await safeAdd(pushQueue, jobId, {
      notificationId: notification.id,
      userId,
      title: title ?? "Test Push",
      body: content,
      topic: `user-${userId}`,
    });
  }

  logger.info(
    { notificationId: notification.id, channel, to },
    "Test notification queued",
  );

  res.status(202).json({
    status: "queued",
    notificationId: notification.id,
    channel,
    to,
  });
});

export default router;
