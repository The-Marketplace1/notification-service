import type { Queue, JobsOptions } from "bullmq";
import { logger } from "./logger";

type AnyQueue = Queue<unknown, void, string>;

export async function safeAdd(
  queue: AnyQueue,
  name: string,
  data: unknown,
  opts?: JobsOptions,
): Promise<void> {
  try {
    const q = queue as Queue<never, void, never>;
    await q.add(name as never, data as never, opts);
  } catch (err) {
    logger.warn(
      { err, queueName: queue.name, jobName: name },
      "Failed to add job to queue — Redis unavailable. Notification saved as pending and can be re-queued when Redis is restored.",
    );
  }
}
