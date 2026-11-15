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
    logger.info({ queueName: queue.name, jobName: name }, "Job queued");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    logger.error(
      { err, queueName: queue.name, jobName: name },
      "Job enqueue failed; rejecting the request to avoid false success",
    );

    throw new Error(
      `Failed to enqueue ${queue.name}/${name}: ${message}`,
    );
  }
}
