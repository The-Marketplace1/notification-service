export interface EmailJobData {
  notificationId: string;
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface SmsJobData {
  notificationId: string;
  to: string;
  body: string;
}

export interface PushJobData {
  notificationId: string;
  userId: string;
  title: string;
  body: string;
  deviceTokens?: string[];
  topic?: string;
  data?: Record<string, string>;
}
