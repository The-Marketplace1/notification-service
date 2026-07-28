import { Worker, type Job } from "bullmq";
import { eq } from "drizzle-orm";
import { redisOptions } from "../lib/redis";
import { db } from "../lib/db";
import { notificationsTable, notificationLogsTable } from "../schema";
import { sendSms } from "../services/sms.service";
import { logger } from "../lib/logger";
import type { SmsJobData } from "../types/jobs";

export function startSmsWorker(): Worker<SmsJobData, void, string> {
  const worker = new Worker<SmsJobData, void, string>(
    "sms-notifications",
    async (job: Job<SmsJobData, void, string>) => {
      const { notificationId, to, body } = job.data;
      const attempt = (job.attemptsMade ?? 0) + 1;

      try {
        await sendSms({ to, body });

        await db
          .update(notificationsTable)
          .set({ status: "sent", sentAt: new Date() })
          .where(eq(notificationsTable.id, notificationId));

        await db.insert(notificationLogsTable).values({
          notificationId,
          status: "delivered",
          attemptNumber: attempt,
        });

        logger.info({ notificationId, to, attempt }, "SMS sent");
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

        logger.error({ notificationId, to, attempt, err }, "SMS send failed");
        throw err;
      }
    },
    { connection: redisOptions, concurrency: 3 },
  );

  worker.on("error", (err) => {
    logger.error({ err }, "SMS worker error");
  });

  return worker;
}
