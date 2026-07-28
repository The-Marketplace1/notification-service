import { db } from "../lib/db";
import { notificationsTable } from "../schema";
import { emailQueue, smsQueue, pushQueue } from "../queues";
import {
  defaultTemplates,
  interpolate,
  resolveTemplate,
} from "../lib/template";
import { safeAdd } from "../lib/safe-queue";
import { logger } from "../lib/logger";

interface BookingPayload {
  bookingId: string;
  customerUserId: string;
  professionalUserId: string;
  customerName: string;
  professionalName: string;
  customerEmail: string;
  professionalEmail?: string;
  customerPhone?: string;
  date: string;
  time: string;
  reason?: string;
}

async function enqueueBookingChannels(
  templateName: "booking.created" | "booking.confirmed" | "booking.cancelled",
  userId: string,
  email: string,
  phone: string | undefined,
  data: Record<string, string>,
): Promise<void> {
  const tpl = defaultTemplates[templateName];

  const [emailNotif] = await db
    .insert(notificationsTable)
    .values({
      userId,
      channel: "email",
      template: templateName,
      status: "pending",
      payload: data as Record<string, unknown>,
    })
    .returning();

  const resolved = await resolveTemplate(templateName, "email", data);
  await safeAdd(emailQueue, `${templateName}-email`, {
    notificationId: emailNotif.id,
    to: email,
    subject: resolved?.subject ?? tpl.subject,
    html: resolved?.content ?? interpolate(tpl.html, data),
  });

  if (phone && tpl.sms) {
    const [smsNotif] = await db
      .insert(notificationsTable)
      .values({
        userId,
        channel: "sms",
        template: templateName,
        status: "pending",
        payload: data as Record<string, unknown>,
      })
      .returning();

    const resolvedSms = await resolveTemplate(templateName, "sms", data);
    await safeAdd(smsQueue, `${templateName}-sms`, {
      notificationId: smsNotif.id,
      to: phone,
      body: resolvedSms?.content ?? interpolate(tpl.sms!, data),
    });
  }

  if (tpl.push) {
    const [pushNotif] = await db
      .insert(notificationsTable)
      .values({
        userId,
        channel: "push",
        template: templateName,
        status: "pending",
        payload: data as Record<string, unknown>,
      })
      .returning();

    const resolvedPush = await resolveTemplate(templateName, "push", data);
    const title = interpolate(tpl.push.title, data);
    const body = interpolate(tpl.push.body, data);

    await safeAdd(pushQueue, `${templateName}-push`, {
      notificationId: pushNotif.id,
      userId,
      title: resolvedPush ? (resolvedPush.subject ?? title) : title,
      body: resolvedPush?.content ?? body,
      topic: `user-${userId}`,
      data: data as Record<string, string>,
    });
  }
}

export async function handleBookingCreated(
  payload: BookingPayload,
): Promise<void> {
  const data = {
    bookingId: payload.bookingId,
    customerName: payload.customerName,
    professionalName: payload.professionalName,
    date: payload.date,
    time: payload.time,
  };

  await enqueueBookingChannels(
    "booking.created",
    payload.customerUserId,
    payload.customerEmail,
    payload.customerPhone,
    data,
  );

  logger.info(
    { bookingId: payload.bookingId },
    "Booking created notifications queued",
  );
}

export async function handleBookingConfirmed(
  payload: BookingPayload,
): Promise<void> {
  const data = {
    bookingId: payload.bookingId,
    customerName: payload.customerName,
    professionalName: payload.professionalName,
    date: payload.date,
    time: payload.time,
  };

  await enqueueBookingChannels(
    "booking.confirmed",
    payload.customerUserId,
    payload.customerEmail,
    payload.customerPhone,
    data,
  );

  logger.info(
    { bookingId: payload.bookingId },
    "Booking confirmed notifications queued",
  );
}

export async function handleBookingCancelled(
  payload: BookingPayload & { cancelledBy?: string },
): Promise<void> {
  const data = {
    bookingId: payload.bookingId,
    name: payload.customerName,
    professionalName: payload.professionalName,
    date: payload.date,
    time: payload.time,
    reason: payload.reason ?? "No reason provided",
  };

  await enqueueBookingChannels(
    "booking.cancelled",
    payload.customerUserId,
    payload.customerEmail,
    payload.customerPhone,
    data,
  );

  if (payload.professionalEmail) {
    const [emailNotif] = await db
      .insert(notificationsTable)
      .values({
        userId: payload.professionalUserId,
        channel: "email",
        template: "booking.cancelled",
        status: "pending",
        payload: data as Record<string, unknown>,
      })
      .returning();

    const tpl = defaultTemplates["booking.cancelled"];
    const proData = { ...data, name: payload.professionalName };
    await safeAdd(emailQueue, "booking-cancelled-pro-email", {
      notificationId: emailNotif.id,
      to: payload.professionalEmail,
      subject: interpolate(tpl.subject, proData),
      html: interpolate(tpl.html, proData),
    });
  }

  logger.info(
    { bookingId: payload.bookingId },
    "Booking cancelled notifications queued",
  );
}

export async function handleReviewCreated(payload: {
  reviewId: string;
  subjectUserId: string;
  subjectEmail: string;
  subjectName: string;
  reviewerName: string;
  rating: number;
  comment: string;
}): Promise<void> {
  const data = {
    name: payload.subjectName,
    reviewerName: payload.reviewerName,
    rating: String(payload.rating),
    comment: payload.comment,
  };

  const tpl = defaultTemplates["review.created"];

  const [notif] = await db
    .insert(notificationsTable)
    .values({
      userId: payload.subjectUserId,
      channel: "email",
      template: "review.created",
      status: "pending",
      payload: payload as Record<string, unknown>,
    })
    .returning();

  const resolved = await resolveTemplate("review.created", "email", data);
  await safeAdd(emailQueue, "review-created-email", {
    notificationId: notif.id,
    to: payload.subjectEmail,
    subject: resolved?.subject ?? tpl.subject,
    html: resolved?.content ?? interpolate(tpl.html, data),
  });

  if (tpl.push) {
    const [pushNotif] = await db
      .insert(notificationsTable)
      .values({
        userId: payload.subjectUserId,
        channel: "push",
        template: "review.created",
        status: "pending",
        payload: payload as Record<string, unknown>,
      })
      .returning();

    await safeAdd(pushQueue, "review-created-push", {
      notificationId: pushNotif.id,
      userId: payload.subjectUserId,
      title: interpolate(tpl.push.title, data),
      body: interpolate(tpl.push.body, data),
      topic: `user-${payload.subjectUserId}`,
    });
  }

  logger.info({ reviewId: payload.reviewId }, "Review notification queued");
}

export async function handleProfessionalVerified(payload: {
  userId: string;
  email: string;
  name: string;
}): Promise<void> {
  const data = { name: payload.name };
  const tpl = defaultTemplates["professional.verified"];

  const [notif] = await db
    .insert(notificationsTable)
    .values({
      userId: payload.userId,
      channel: "email",
      template: "professional.verified",
      status: "pending",
      payload: payload as Record<string, unknown>,
    })
    .returning();

  const resolved = await resolveTemplate(
    "professional.verified",
    "email",
    data,
  );
  await safeAdd(emailQueue, "professional-verified-email", {
    notificationId: notif.id,
    to: payload.email,
    subject: resolved?.subject ?? tpl.subject,
    html: resolved?.content ?? interpolate(tpl.html, data),
  });

  if (tpl.push) {
    const [pushNotif] = await db
      .insert(notificationsTable)
      .values({
        userId: payload.userId,
        channel: "push",
        template: "professional.verified",
        status: "pending",
        payload: payload as Record<string, unknown>,
      })
      .returning();

    await safeAdd(pushQueue, "professional-verified-push", {
      notificationId: pushNotif.id,
      userId: payload.userId,
      title: tpl.push.title,
      body: interpolate(tpl.push.body, data),
      topic: `user-${payload.userId}`,
    });
  }

  logger.info(
    { userId: payload.userId },
    "Professional verified notification queued",
  );
}

export async function handleTransactionCompleted(payload: {
  userId: string;
  email: string;
  name: string;
  transactionId: string;
  bookingId: string;
  amount: string;
  currency: string;
}): Promise<void> {
  const data = {
    name: payload.name,
    transactionId: payload.transactionId,
    bookingId: payload.bookingId,
    amount: payload.amount,
    currency: payload.currency,
  };
  const tpl = defaultTemplates["transaction.completed"];

  const [notif] = await db
    .insert(notificationsTable)
    .values({
      userId: payload.userId,
      channel: "email",
      template: "transaction.completed",
      status: "pending",
      payload: payload as Record<string, unknown>,
    })
    .returning();

  const resolved = await resolveTemplate(
    "transaction.completed",
    "email",
    data,
  );
  await safeAdd(emailQueue, "transaction-completed-email", {
    notificationId: notif.id,
    to: payload.email,
    subject: resolved?.subject ?? interpolate(tpl.subject, data),
    html: resolved?.content ?? interpolate(tpl.html, data),
  });

  logger.info(
    { transactionId: payload.transactionId },
    "Transaction receipt queued",
  );
}
