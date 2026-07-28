import { Worker, type Job } from "bullmq";
import { eq } from "drizzle-orm";
import { redisOptions } from "../lib/redis";
import { db } from "../lib/db";
import { notificationsTable, notificationLogsTable } from "../schema";
import { sendPush } from "../services/push.service";
import { logger } from "../lib/logger";
import type { PushJobData } from "../types/jobs";

export function startPushWorker(): Worker<PushJobData, void, string> {
  const worker = new Worker<PushJobData, void, string>(
    "push-notifications",
    async (job: Job<PushJobData, void, string>) => {
      const { notificationId, title, body, deviceTokens, topic, data } =
        job.data;
      const attempt = (job.attemptsMade ?? 0) + 1;

      try {
        await sendPush({ title, body, deviceTokens, topic, data });

        await db
          .update(notificationsTable)
          .set({ status: "sent", sentAt: new Date() })
          .where(eq(notificationsTable.id, notificationId));

        await db.insert(notificationLogsTable).values({
          notificationId,
          status: "delivered",
          attemptNumber: attempt,
        });

        logger.info({ notificationId, attempt }, "Push notification sent");
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : String(err);
        const isLastAttempt = attempt >= (job.opts?.attempts ?? 3);

        if (isLastAttempt) {
          await db
            .update(notificationsTable)
            .set({ status: "failed" })
            .where(eq(notificationsTable.id, notificationId));
        }

        await db.insert(notificationLogsTable).values({
          notificationId,
          status: "failed",
          errorMessage,
          attemptNumber: attempt,
        });

        logger.error({ notificationId, attempt, err }, "Push send failed");
        throw err;
      }
    },
    { connection: redisOptions, concurrency: 10 },
  );

  worker.on("error", (err) => {
    logger.error({ err }, "Push worker error");
  });
