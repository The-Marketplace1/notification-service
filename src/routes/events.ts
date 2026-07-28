import { Router, type Request, type Response } from "express";
import { z } from "zod/v4";
import { logger } from "../lib/logger";
import {
  handleUserRegistered,
  handleEmailVerified,
  handlePasswordResetRequested,
  handleBookingCreated,
  handleBookingConfirmed,
  handleBookingCancelled,
  handleReviewCreated,
  handleProfessionalVerified,
  handleTransactionCompleted,
} from "../handlers";

const router = Router();

const userPayloadSchema = z.object({
  userId: z.string().min(1),
  email: z.string().email(),
  name: z.string().optional(),
});

const passwordResetPayloadSchema = z.object({
  userId: z.string().min(1),
  email: z.string().email(),
  resetUrl: z.string().url(),
  name: z.string().optional(),
  phone: z.string().optional(),
});

const bookingPayloadSchema = z.object({
  bookingId: z.string().min(1),
  customerUserId: z.string().min(1),
  professionalUserId: z.string().min(1),
  customerName: z.string().min(1),
  professionalName: z.string().min(1),
  customerEmail: z.string().email(),
  professionalEmail: z.string().email().optional(),
  customerPhone: z.string().optional(),
  date: z.string().min(1),
  time: z.string().min(1),
  reason: z.string().optional(),
  cancelledBy: z.string().optional(),
});

const reviewPayloadSchema = z.object({
  reviewId: z.string().min(1),
  subjectUserId: z.string().min(1),
  subjectEmail: z.string().email(),
  subjectName: z.string().min(1),
  reviewerName: z.string().min(1),
  rating: z.number().int().min(1).max(5),
  comment: z.string(),
});

const professionalVerifiedPayloadSchema = z.object({
  userId: z.string().min(1),
  email: z.string().email(),
  name: z.string().min(1),
});

const transactionPayloadSchema = z.object({
  userId: z.string().min(1),
  email: z.string().email(),
  name: z.string().min(1),
  transactionId: z.string().min(1),
  bookingId: z.string().min(1),
  amount: z.string().min(1),
  currency: z.string().min(1),
});

const eventEnvelopeSchema = z.object({
  event: z.string().min(1),
  payload: z.record(z.string(), z.unknown()),
});

function requireServiceSecret(req: Request, res: Response): boolean {
  const secret = process.env.SERVICE_SECRET;
  if (!secret) return true;

  const provided = req.headers["x-service-secret"];
  if (provided !== secret) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  return true;
}

function parsePayload<T>(
  schema: z.ZodType<T>,
  payload: Record<string, unknown>,
  res: Response,
): T | null {
  const result = schema.safeParse(payload);
  if (!result.success) {
    res
      .status(400)
      .json({ error: "Invalid event payload", issues: result.error.issues });
    return null;
  }
  return result.data;
}

router.post("/events", async (req: Request, res: Response) => {
  if (!requireServiceSecret(req, res)) return;

  const envelope = eventEnvelopeSchema.safeParse(req.body);
  if (!envelope.success) {
    res
      .status(400)
      .json({ error: "Invalid request", issues: envelope.error.issues });
    return;
  }

  const { event, payload } = envelope.data;
  req.log.info({ event }, "Received event");

  try {
    switch (event) {
      case "user.registered": {
        const data = parsePayload(userPayloadSchema, payload, res);
        if (!data) return;
        await handleUserRegistered(data);
        break;
      }

      case "user.email.verified": {
        const data = parsePayload(userPayloadSchema, payload, res);
        if (!data) return;
        await handleEmailVerified(data);
        break;
      }

      case "password.reset.requested": {
        const data = parsePayload(passwordResetPayloadSchema, payload, res);
        if (!data) return;
        await handlePasswordResetRequested(data);
        break;
      }

      case "booking.created": {
        const data = parsePayload(bookingPayloadSchema, payload, res);
        if (!data) return;
        await handleBookingCreated(data);
        break;
      }

      case "booking.confirmed": {
        const data = parsePayload(bookingPayloadSchema, payload, res);
        if (!data) return;
        await handleBookingConfirmed(data);
        break;
      }

      case "booking.cancelled": {
        const data = parsePayload(bookingPayloadSchema, payload, res);
        if (!data) return;
        await handleBookingCancelled(data);
        break;
      }

      case "review.created": {
        const data = parsePayload(reviewPayloadSchema, payload, res);
        if (!data) return;
        await handleReviewCreated(data);
        break;
      }

      case "professional.verified": {
        const data = parsePayload(
          professionalVerifiedPayloadSchema,
          payload,
          res,
        );
        if (!data) return;
        await handleProfessionalVerified(data);
        break;
      }

      case "transaction.completed": {
        const data = parsePayload(transactionPayloadSchema, payload, res);
        if (!data) return;
        await handleTransactionCompleted(data);
        break;
      }

      default:
        logger.warn({ event }, "Unknown event — ignoring");
        res.status(200).json({ status: "ignored", event });
        return;
    }

    res.status(202).json({ status: "accepted", event });
  } catch (err) {
    logger.error({ event, err }, "Error processing event");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
