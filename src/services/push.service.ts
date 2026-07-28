import { logger } from "../lib/logger";

interface FirebaseMessaging {
  send: (message: Record<string, unknown>) => Promise<string>;
  sendEachForMulticast: (message: Record<string, unknown>) => Promise<{
    responses: Array<{ success: boolean; error?: { message: string } }>;
  }>;
}

let messaging: FirebaseMessaging | null = null;

async function getMessaging(): Promise<FirebaseMessaging | null> {
  if (messaging) return messaging;

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!serviceAccountJson) {
    logger.warn(
      "FIREBASE_SERVICE_ACCOUNT not set — push notifications are disabled.",
    );
    return null;
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
    return null;
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
  if (!m) return;

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
    logger.warn("No device tokens or topic provided for push notification");
    return;
  }

  const response = await m.sendEachForMulticast({
    tokens: options.deviceTokens,
    notification: { title: options.title, body: options.body },
    data: options.data,
  });

  const failed = response.responses.filter((r) => !r.success);
  if (failed.length) {
    logger.warn(
      { failed: failed.map((r) => r.error?.message) },
      `${failed.length} push notification(s) failed`,
    );
  }

  logger.info(
    { successCount: response.responses.length - failed.length },
    "Push notifications dispatched",
  );
}
