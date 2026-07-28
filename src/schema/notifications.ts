import { pgTable, uuid, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const notificationChannelEnum = ["email", "sms", "push"] as const;
export type NotificationChannel = (typeof notificationChannelEnum)[number];

export const notificationStatusEnum = [
  "pending",
  "sent",
  "failed",
  "cancelled",
] as const;
export type NotificationStatus = (typeof notificationStatusEnum)[number];

export const notificationsTable = pgTable("notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  channel: text("channel").notNull().$type<NotificationChannel>(),
  template: text("template").notNull(),
  status: text("status")
    .notNull()
    .default("pending")
    .$type<NotificationStatus>(),
  payload: jsonb("payload").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  sentAt: timestamp("sent_at"),
});

export const insertNotificationSchema = createInsertSchema(notificationsTable, {
  channel: z.enum(notificationChannelEnum),
  status: z.enum(notificationStatusEnum).optional(),
}).omit({ id: true, createdAt: true });

export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Notification = typeof notificationsTable.$inferSelect;
