import app from "./app";
import { logger } from "./lib/logger";
import { pool } from "./lib/db";
import { startWorkers, stopWorkers } from "./workers";
import { closeQueues } from "./queues";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function main() {
  startWorkers();

  const server = app.listen(port, () => {
    logger.info({ port }, "Notification service listening");
  });

  async function shutdown(signal: string) {
    logger.info({ signal }, "Shutdown signal received");
    server.close(async () => {
      await stopWorkers();
      await closeQueues();
      await pool.end();
      logger.info("Graceful shutdown complete");
      process.exit(0);
    });

    setTimeout(() => {
      logger.error("Forced shutdown after timeout");
      process.exit(1);
    }, 15_000).unref();
  }

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((err) => {
  logger.error({ err }, "Fatal startup error");
  process.exit(1);
});
