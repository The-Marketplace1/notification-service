import type { NextFunction, Request, Response } from "express";

export function requireServiceSecret(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const secret = process.env.SERVICE_SECRET;

  if (!secret) {
    res.status(500).json({
      error: "SERVICE_SECRET is not configured on this service",
    });
    return;
  }

  const provided = req.header("x-service-secret");

  if (!provided || provided !== secret) {
    res.status(401).json({
      error: "Unauthorized",
    });
    return;
  }

  next();
}
