import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const notificationTemplatesTable = pgTable(
  "notification_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    channel: text("channel").notNull(),
    subject: text("subject"),
    content: text("content").notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("notification_templates_name_channel_idx").on(t.name, t.channel),
  ],
);

export const insertTemplateSchema = createInsertSchema(
  notificationTemplatesTable,
  {
    channel: z.enum(["email", "sms", "push"]),
    subject: z.string().optional(),
  },
).omit({ id: true, createdAt: true, updatedAt: true });

export const updateTemplateSchema = insertTemplateSchema.partial();

export type InsertTemplate = z.infer<typeof insertTemplateSchema>;
export type UpdateTemplate = z.infer<typeof updateTemplateSchema>;
export type NotificationTemplate =
  typeof notificationTemplatesTable.$inferSelect;
