import { createHash } from "node:crypto";
import { resend } from "@/lib/services/resend";
import { normalizeWhatsAppRecipient, whatsapp } from "@/lib/services/whatsapp";
import type { NotificationChannelAdapter } from "@/lib/notifications/types";

function requiredString(value: unknown, message: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw Object.assign(new Error(message), { status: 400 });
  }
  return value.trim();
}

export const emailChannel: NotificationChannelAdapter = {
  channel: "EMAIL",
  resolveRecipient(recipient) {
    return requiredString(recipient.email, "Customer email is required for email delivery");
  },
  async send({ recipient, message, idempotencyKey }) {
    const providerKey = `tripkopa-${createHash("sha256")
      .update(idempotencyKey)
      .digest("hex")}`;
    const delivered = await resend.sendEmail(
      {
        to: recipient,
        subject: message.subject,
        text: message.text,
        html: message.html,
      },
      { idempotencyKey: providerKey },
    );
    return { id: delivered.id, recipient };
  },
};

export const whatsappChannel: NotificationChannelAdapter = {
  channel: "WHATSAPP",
  resolveRecipient(recipient) {
    return normalizeWhatsAppRecipient(
      requiredString(
        recipient.whatsapp_number,
        "Customer WhatsApp number is required for WhatsApp delivery",
      ),
    );
  },
  async send({ recipient, message }) {
    const delivered = await whatsapp.sendText({ to: recipient, body: message.text });
    return { id: delivered.id, recipient: delivered.recipient };
  },
};
