import type { Worker } from "bullmq";
import { startEmailWorker } from "./email.worker";
import { startSmsWorker } from "./sms.worker";
import { startPushWorker } from "./push.worker";
import { logger } from "../lib/logger";

let workers: Worker[] = [];

export function startWorkers(): void {
  try {
    const emailWorker = startEmailWorker();
    const smsWorker = startSmsWorker();
    const pushWorker = startPushWorker();
    workers = [emailWorker, smsWorker, pushWorker];
    logger.info("Notification workers started (email, sms, push)");
  } catch (err) {
    logger.warn(
      { err },
      "Workers failed to start — service will run without queue processing until Redis is available",
    );
  }
}

export async function stopWorkers(): Promise<void> {
  if (!workers.length) return;
  await Promise.all(workers.map((w) => w.close()));
  logger.info("Notification workers stopped");
}
