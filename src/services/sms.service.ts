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

async function getTwilioClient(): Promise<TwilioClient> {
  if (twilioClient) return twilioClient;

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (!accountSid || !authToken) {
    throw new Error(
      "Twilio credentials are not configured. Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.",
    );
  }

  try {
    const twilio = await import("twilio");
    twilioClient = twilio.default(accountSid, authToken) as TwilioClient;
    return twilioClient;
  } catch (err) {
    logger.error({ err }, "Failed to load Twilio client");
    throw err;
  }
}

export interface SendSmsOptions {
  to: string;
  body: string;
}

export async function sendSms(options: SendSmsOptions): Promise<void> {
  const fromNumber = process.env.TWILIO_FROM_NUMBER;

  if (!fromNumber) {
    throw new Error("TWILIO_FROM_NUMBER is not set.");
  }

  const client = await getTwilioClient();

  const result = await client.messages.create({
    to: options.to,
    from: fromNumber,
    body: options.body,
  });

  logger.info({ sid: result.sid, to: options.to }, "SMS dispatched");
}
