import { logger } from "../lib/logger";

type TwilioClient = {
  messages: {
    create: (opts: {
      to: string;
      from: string;
      body: string;
    }) => Promise<{ sid: string }>;
  };
};

let twilioClient: TwilioClient | null = null;

async function getTwilioClient(): Promise<TwilioClient | null> {
  if (twilioClient) return twilioClient;

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (!accountSid || !authToken) {
    logger.warn(
      "Twilio credentials not configured — SMS sending is disabled. Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.",
    );
    return null;
  }

  try {
    const twilio = await import("twilio");
    twilioClient = twilio.default(accountSid, authToken) as TwilioClient;
    return twilioClient;
  } catch (err) {
    logger.error({ err }, "Failed to load Twilio client");
    return null;
  }
}

export interface SendSmsOptions {
  to: string;
  body: string;
}

export async function sendSms(options: SendSmsOptions): Promise<void> {
  const fromNumber = process.env.TWILIO_FROM_NUMBER;

  if (!fromNumber) {
    logger.warn("TWILIO_FROM_NUMBER not set — skipping SMS send.");
    return;
  }

  const client = await getTwilioClient();
  if (!client) return;

  const result = await client.messages.create({
    to: options.to,
    from: fromNumber,
    body: options.body,
  });

  logger.info({ sid: result.sid, to: options.to }, "SMS dispatched");
}
