import { Worker, type Job } from "bullmq";
import { eq } from "drizzle-orm";
import { redisOptions } from "../lib/redis";
import { db } from "../lib/db";
import { notificationsTable, notificationLogsTable } from "../schema";
import { sendEmail } from "../services/email.service";
import { logger } from "../lib/logger";
import type { EmailJobData } from "../types/jobs";

export function startEmailWorker(): Worker<EmailJobData, void, string> {
  const worker = new Worker<EmailJobData, void, string>(
    "email-notifications",
    async (job: Job<EmailJobData, void, string>) => {
      const { notificationId, to, subject, html, text } = job.data;
      const attempt = (job.attemptsMade ?? 0) + 1;

      try {
        await sendEmail({ to, subject, html, text });

        await db
          .update(notificationsTable)
          .set({ status: "sent", sentAt: new Date() })
          .where(eq(notificationsTable.id, notificationId));

        await db.insert(notificationLogsTable).values({
          notificationId,
          status: "delivered",
          attemptNumber: attempt,
        });

        logger.info({ notificationId, to, attempt }, "Email sent");
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

        logger.error({ notificationId, to, attempt, err }, "Email send failed");
        throw err;
      }
    },
    { connection: redisOptions, concurrency: 5 },
  );

  worker.on("error", (err) => {
    logger.error({ err }, "Email worker error");
  });

  return worker;
}
