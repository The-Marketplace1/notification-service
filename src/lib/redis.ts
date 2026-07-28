import net from "node:net";
import type { RedisOptions } from "bullmq";
import { logger } from "./logger";

function parseRedisUrl(url: string): RedisOptions {
  try {
    const u = new URL(url);
    return {
      host: u.hostname || "localhost",
      port: u.port ? parseInt(u.port, 10) : 6379,
      password: u.password || undefined,
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      lazyConnect: true,
    };
  } catch {
    logger.warn({ url: "invalid" }, "Could not parse REDIS_URL, using defaults");
    return {
      host: "localhost",
      port: 6379,
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      lazyConnect: true,
    };
  }
}

export const redisOptions: RedisOptions = parseRedisUrl(
  process.env.REDIS_URL ?? "redis://localhost:6379",
);

export async function pingRedis(): Promise<boolean> {
  return new Promise((resolve) => {
    const host = redisOptions.host ?? "localhost";
    const port = (redisOptions.port as number) ?? 6379;

    const socket = net.createConnection({ host, port }, () => {
      socket.write("PING\r\n");
    });

    socket.on("data", () => {
      socket.destroy();
      resolve(true);
    });

    socket.on("error", () => resolve(false));

    setTimeout(() => {
      socket.destroy();
      resolve(false);
    }, 2000).unref();
  });
}
