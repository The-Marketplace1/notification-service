import { logger } from "../lib/logger";

interface FirebaseMessaging {
  send: (message: Record<string, unknown>) => Promise<string>;
  sendEachForMulticast: (message: Record<string, unknown>) => Promise<{
    responses: Array<{ success: boolean; error?: { message: string } }>;
  }>;
}

let messaging: FirebaseMessaging | null = null;

async function getMessaging(): Promise<FirebaseMessaging> {
  if (messaging) return messaging;

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;

  if (!serviceAccountJson) {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT not set. Push notification delivery is disabled.",
    );
  }

  try {
    const admin = await import("firebase-admin");
    const serviceAccount = JSON.parse(serviceAccountJson) as Record<string, unknown>;

    if (!admin.default.apps.length) {
      admin.default.initializeApp({
        credential: admin.default.credential.cert(
          serviceAccount as Parameters<typeof admin.default.credential.cert>[0],
        ),
      });
    }

    messaging = admin.default.messaging() as unknown as FirebaseMessaging;
    return messaging;
  } catch (err) {
    logger.error({ err }, "Failed to initialize Firebase Admin");
    throw err;
  }
}

export interface SendPushOptions {
  deviceTokens?: string[];
  topic?: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}

export async function sendPush(options: SendPushOptions): Promise<void> {
  const m = await getMessaging();

  if (options.topic) {
    const messageId = await m.send({
      topic: options.topic,
      notification: { title: options.title, body: options.body },
      data: options.data,
    });

    logger.info({ messageId, topic: options.topic }, "Push sent to topic");
    return;
  }

  if (!options.deviceTokens?.length) {
    throw new Error(
      "No device tokens or topic provided for push notification",
    );
  }

  const response = await m.sendEachForMulticast({
    tokens: options.deviceTokens,
    notification: { title: options.title, body: options.body },
    data: options.data,
  });

  const failed = response.responses.filter((r) => !r.success);

  if (failed.length) {
    const errorList = failed.map((r) => r.error?.message ?? "unknown");
    throw new Error(
      `Push delivery partially failed: ${errorList.join(", ")}`,
    );
  }

  logger.info(
    { successCount: response.responses.length - failed.length },
    "Push notifications dispatched",
  );
}
