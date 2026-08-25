export type NotificationRecipient = {
  email?: unknown;
  whatsapp_number?: unknown;
};

export type NotificationMessage = {
  subject: string;
  text: string;
  html?: string;
};

export type ChannelDelivery = {
  id: string;
  recipient: string;
};

export type NotificationChannelAdapter = {
  channel: string;
  resolveRecipient(recipient: NotificationRecipient): string;
  send(input: {
    recipient: string;
    message: NotificationMessage;
    idempotencyKey: string;
  }): Promise<ChannelDelivery>;
};

export type NotificationDeliveryResult = {
  channel: string;
  status: "SENT" | "FAILED";
  recipient?: string;
  provider_message_id?: string;
  sent_at?: string;
  duplicate?: boolean;
  error?: string;
};
