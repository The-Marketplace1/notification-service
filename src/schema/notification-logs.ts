import { pgTable, uuid, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { notificationsTable } from "./notifications";

export const notificationLogStatusEnum = [
  "attempted",
  "delivered",
  "failed",
] as const;
export type NotificationLogStatus =
  (typeof notificationLogStatusEnum)[number];

export const notificationLogsTable = pgTable("notification_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  notificationId: uuid("notification_id")
    .notNull()
    .references(() => notificationsTable.id, { onDelete: "cascade" }),
  status: text("status").notNull().$type<NotificationLogStatus>(),
  errorMessage: text("error_message"),
  attemptNumber: integer("attempt_number").notNull().default(1),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertLogSchema = createInsertSchema(notificationLogsTable, {
  status: z.enum(notificationLogStatusEnum),
}).omit({ id: true, createdAt: true });

export type InsertLog = z.infer<typeof insertLogSchema>;
export type NotificationLog = typeof notificationLogsTable.$inferSelect;
