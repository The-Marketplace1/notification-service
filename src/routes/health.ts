import { Router } from "express";
import { pool } from "../lib/db";
import { pingRedis } from "../lib/redis";

const router = Router();

router.get("/healthz", async (_req, res) => {
  const checks: Record<string, "ok" | "error"> = {
    server: "ok",
    database: "ok",
    redis: "ok",
  };

  await Promise.all([
    pool.query("SELECT 1").catch(() => {
      checks.database = "error";
    }),
    pingRedis().then((ok) => {
      if (!ok) checks.redis = "error";
    }),
  ]);

  const dbOk = checks.database === "ok";
  const allOk = dbOk && checks.redis === "ok";
  const status = allOk ? "ok" : dbOk ? "degraded" : "unhealthy";

  res.status(dbOk ? 200 : 503).json({
    status,
    checks,
    service: "notification-service",
    timestamp: new Date().toISOString(),
  });
});

export default router;
