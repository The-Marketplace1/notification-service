import { db } from "../lib/db";
import { notificationsTable } from "../schema";
import { emailQueue, smsQueue } from "../queues";
import {
  defaultTemplates,
  interpolate,
  resolveTemplate,
} from "../lib/template";
import { safeAdd } from "../lib/safe-queue";
import { logger } from "../lib/logger";

export async function handleUserRegistered(payload: {
  userId: string;
  email: string;
  name?: string;
}): Promise<void> {
  const data = { name: payload.name ?? "there", email: payload.email };

  const [notification] = await db
    .insert(notificationsTable)
    .values({
      userId: payload.userId,
      channel: "email",
      template: "welcome",
      status: "pending",
      payload: payload as Record<string, unknown>,
    })
    .returning();

  const resolved = await resolveTemplate("welcome", "email", data);
  const subject = resolved?.subject ?? defaultTemplates.welcome.subject;
  const html =
    resolved?.content ?? interpolate(defaultTemplates.welcome.html, data);

  await safeAdd(emailQueue, "welcome-email", {
    notificationId: notification.id,
    to: payload.email,
    subject,
    html,
  });

  logger.info({ userId: payload.userId }, "Welcome email queued");
}

export async function handleEmailVerified(payload: {
  userId: string;
  email: string;
  name?: string;
}): Promise<void> {
  const data = { name: payload.name ?? "there" };

  const [notification] = await db
    .insert(notificationsTable)
    .values({
      userId: payload.userId,
      channel: "email",
      template: "email.verified",
      status: "pending",
      payload: payload as Record<string, unknown>,
    })
    .returning();

  const resolved = await resolveTemplate("email.verified", "email", data);
  const tpl = defaultTemplates["email.verified"];
  const subject = resolved?.subject ?? tpl.subject;
  const html = resolved?.content ?? interpolate(tpl.html, data);

  await safeAdd(emailQueue, "email-verified", {
    notificationId: notification.id,
    to: payload.email,
    subject,
    html,
  });

  logger.info({ userId: payload.userId }, "Email verified notification queued");
}

export async function handlePasswordResetRequested(payload: {
  userId: string;
  email: string;
  name?: string;
  resetUrl: string;
  phone?: string;
}): Promise<void> {
  const data = {
    name: payload.name ?? "there",
    resetUrl: payload.resetUrl,
  };
  const tpl = defaultTemplates["password.reset"];

  const [emailNotification] = await db
    .insert(notificationsTable)
    .values({
      userId: payload.userId,
      channel: "email",
      template: "password.reset",
      status: "pending",
      payload: payload as Record<string, unknown>,
    })
    .returning();

  const resolved = await resolveTemplate("password.reset", "email", data);
  const subject = resolved?.subject ?? tpl.subject;
  const html = resolved?.content ?? interpolate(tpl.html, data);

  await safeAdd(emailQueue, "password-reset-email", {
    notificationId: emailNotification.id,
    to: payload.email,
    subject,
    html,
  });

  if (payload.phone && tpl.sms) {
    const [smsNotification] = await db
      .insert(notificationsTable)
      .values({
        userId: payload.userId,
        channel: "sms",
        template: "password.reset",
        status: "pending",
        payload: payload as Record<string, unknown>,
      })
      .returning();

    await safeAdd(smsQueue, "password-reset-sms", {
      notificationId: smsNotification.id,
      to: payload.phone,
      body: interpolate(tpl.sms, data),
    });
  }

  logger.info({ userId: payload.userId }, "Password reset notification queued");
}
