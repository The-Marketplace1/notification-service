import { Queue } from "bullmq";
import { redisOptions } from "../lib/redis";
import type { EmailJobData, SmsJobData, PushJobData } from "../types/jobs";

const defaultJobOptions = {
  attempts: 3,
  backoff: {
    type: "exponential" as const,
    delay: 2000,
  },
  removeOnComplete: { count: 500 },
  removeOnFail: { count: 200 },
};

export const emailQueue = new Queue<EmailJobData, void, string>(
  "email-notifications",
  { connection: redisOptions, defaultJobOptions },
);

export const smsQueue = new Queue<SmsJobData, void, string>(
  "sms-notifications",
  { connection: redisOptions, defaultJobOptions },
);

export const pushQueue = new Queue<PushJobData, void, string>(
  "push-notifications",
  { connection: redisOptions, defaultJobOptions },
);

export async function closeQueues(): Promise<void> {
  await Promise.all([
    emailQueue.close(),
    smsQueue.close(),
    pushQueue.close(),
  ]);
}
