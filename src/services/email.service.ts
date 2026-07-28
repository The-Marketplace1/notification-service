import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import { logger } from "../lib/logger";

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT ?? "587", 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    logger.warn(
      "SMTP credentials not fully configured — email sending is disabled. Set SMTP_HOST, SMTP_USER, SMTP_PASS.",
    );
    transporter = nodemailer.createTransport({ jsonTransport: true });
    return transporter;
  }

  transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  return transporter;
}

function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/h[1-6]>/gi, "\n\n")
    .replace(/<a[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/gi, "$2 ($1)")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  from?: string;
}

export async function sendEmail(options: SendEmailOptions): Promise<void> {
  const from =
    options.from ??
    process.env.FROM_EMAIL ??
    "notifications@platform.local";

  const t = getTransporter();

  const result = await t.sendMail({
    from,
    to: options.to,
    subject: options.subject,
    html: options.html,
    text: options.text ?? htmlToText(options.html),
  });

  logger.info(
    { messageId: result.messageId, to: options.to },
    "Email dispatched",
  );
}
