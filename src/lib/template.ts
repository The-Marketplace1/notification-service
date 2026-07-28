import { db } from "./db";
import { notificationTemplatesTable } from "../schema";
import { eq, and } from "drizzle-orm";
import type { NotificationChannel } from "../schema";

export function interpolate(
  content: string,
  data: Record<string, unknown>,
): string {
  return content.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const val = data[key];
    return val !== undefined && val !== null ? String(val) : "";
  });
}

export async function resolveTemplate(
  name: string,
  channel: NotificationChannel,
  data: Record<string, unknown>,
): Promise<{ subject: string | null; content: string } | null> {
  const [template] = await db
    .select()
    .from(notificationTemplatesTable)
    .where(
      and(
        eq(notificationTemplatesTable.name, name),
        eq(notificationTemplatesTable.channel, channel),
        eq(notificationTemplatesTable.active, true),
      ),
    )
    .limit(1);

  if (!template) {
    return null;
  }

  return {
    subject: template.subject ? interpolate(template.subject, data) : null,
    content: interpolate(template.content, data),
  };
}

export const defaultTemplates: Record<
  string,
  { subject: string; html: string; sms?: string; push?: { title: string; body: string } }
> = {
  welcome: {
    subject: "Welcome to the platform!",
    html: `<h1>Welcome, {{name}}!</h1><p>Thanks for joining. Your account is ready.</p>`,
    push: { title: "Welcome!", body: "Your account is ready, {{name}}." },
  },
  "email.verified": {
    subject: "Your email has been verified",
    html: `<h1>Email Verified</h1><p>Hi {{name}}, your email address has been successfully verified.</p>`,
  },
  "password.reset": {
    subject: "Password Reset Request",
    html: `<h1>Reset Your Password</h1><p>Hi {{name}},</p><p>Click <a href="{{resetUrl}}">here</a> to reset your password. This link expires in 1 hour.</p><p>If you didn't request this, ignore this email.</p>`,
    sms: "Your password reset link: {{resetUrl}} (expires in 1 hour)",
  },
  "booking.created": {
    subject: "Booking Confirmation #{{bookingId}}",
    html: `<h1>Booking Confirmed</h1><p>Hi {{customerName}},</p><p>Your booking with <strong>{{professionalName}}</strong> on <strong>{{date}}</strong> at <strong>{{time}}</strong> has been created.</p><p>Booking ID: {{bookingId}}</p>`,
    sms: "Booking confirmed with {{professionalName}} on {{date}} at {{time}}. Ref: {{bookingId}}",
    push: { title: "Booking Created", body: "Your booking with {{professionalName}} on {{date}} is confirmed." },
  },
  "booking.confirmed": {
    subject: "Booking Accepted #{{bookingId}}",
    html: `<h1>Booking Accepted</h1><p>Hi {{customerName}},</p><p><strong>{{professionalName}}</strong> has accepted your booking for {{date}} at {{time}}.</p>`,
    sms: "{{professionalName}} accepted your booking for {{date}} at {{time}}. Ref: {{bookingId}}",
    push: { title: "Booking Accepted", body: "{{professionalName}} accepted your booking for {{date}}." },
  },
  "booking.cancelled": {
    subject: "Booking Cancelled #{{bookingId}}",
    html: `<h1>Booking Cancelled</h1><p>Hi {{name}},</p><p>Your booking (ID: {{bookingId}}) on {{date}} has been cancelled.</p><p>Reason: {{reason}}</p>`,
    sms: "Your booking {{bookingId}} on {{date}} has been cancelled. Reason: {{reason}}",
    push: { title: "Booking Cancelled", body: "Your booking on {{date}} was cancelled." },
  },
  "review.created": {
    subject: "You have a new review",
    html: `<h1>New Review Received</h1><p>Hi {{name}},</p><p>You received a {{rating}}-star review from {{reviewerName}}:</p><blockquote>{{comment}}</blockquote>`,
    push: { title: "New Review", body: "You received a {{rating}}-star review from {{reviewerName}}." },
  },
  "professional.verified": {
    subject: "Your professional profile has been verified",
    html: `<h1>Profile Verified!</h1><p>Hi {{name}},</p><p>Congratulations! Your professional profile has been verified. You can now accept bookings.</p>`,
    push: { title: "Profile Verified", body: "Your professional profile is now verified. Start accepting bookings!" },
  },
  "transaction.completed": {
    subject: "Payment Receipt #{{transactionId}}",
    html: `<h1>Payment Received</h1><p>Hi {{name}},</p><p>Your payment of <strong>{{amount}} {{currency}}</strong> for booking {{bookingId}} has been processed.</p><p>Transaction ID: {{transactionId}}</p>`,
    sms: "Payment of {{amount}} {{currency}} received for booking {{bookingId}}. Ref: {{transactionId}}",
  },
};
