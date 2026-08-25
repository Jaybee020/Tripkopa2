import { ServiceAuthError, ServiceError } from "./errors";

const PROVIDER = "meta-whatsapp";
const DEFAULT_API_VERSION = "v24.0";

export type WhatsAppTextInput = {
  to?: string;
  body: string;
  previewUrl?: boolean;
};

export type WhatsAppDelivery = {
  id: string;
  recipient: string;
  raw: Record<string, unknown>;
};

type WhatsAppMessage = {
  type: string;
  [key: string]: unknown;
};

function requiredEnvironment(name: "WHATSAPP_ACCESS_TOKEN" | "WHATSAPP_PHONE_NUMBER_ID") {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new ServiceAuthError(PROVIDER, new Error(`missing required env var: ${name}`));
  }
  return value;
}

function apiVersion() {
  const value = process.env.WHATSAPP_API_VERSION?.trim() || DEFAULT_API_VERSION;
  if (!/^v\d+\.\d+$/.test(value)) {
    throw Object.assign(new Error("WHATSAPP_API_VERSION must look like v24.0"), {
      status: 500,
    });
  }
  return value;
}

export function normalizeWhatsAppRecipient(value: string) {
  const recipient = value.trim().replace(/[^\d]/g, "");
  if (!/^\d{8,15}$/.test(recipient)) {
    throw Object.assign(
      new Error("WhatsApp recipient must be an international phone number with country code"),
      { status: 400 },
    );
  }
  return recipient;
}

function providerMessage(payload: unknown) {
  if (!payload || typeof payload !== "object") return null;
  const error = (payload as { error?: unknown }).error;
  if (!error || typeof error !== "object") return null;
  const message = (error as { message?: unknown }).message;
  return typeof message === "string" && message.trim() ? message : null;
}

export class WhatsAppService {
  async sendMessage(to: string, message: WhatsAppMessage): Promise<WhatsAppDelivery> {
    const recipient = normalizeWhatsAppRecipient(to);
    const phoneNumberId = requiredEnvironment("WHATSAPP_PHONE_NUMBER_ID");
    const accessToken = requiredEnvironment("WHATSAPP_ACCESS_TOKEN");
    const response = await fetch(
      `https://graph.facebook.com/${apiVersion()}/${encodeURIComponent(phoneNumberId)}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...message,
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: recipient,
        }),
      },
    );
    const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok) {
      const detail = providerMessage(payload);
      const error = new ServiceError(
        detail ? `WhatsApp request failed: ${detail}` : "WhatsApp request failed",
        PROVIDER,
        payload,
      );
      error.status = response.status === 401 || response.status === 403
        ? response.status
        : response.status === 429
          ? 429
          : response.status >= 500
            ? 502
            : 400;
      throw error;
    }

    const messages = Array.isArray(payload.messages) ? payload.messages : [];
    const first = messages[0];
    const id = first && typeof first === "object" && typeof (first as { id?: unknown }).id === "string"
      ? (first as { id: string }).id
      : null;
    if (!id) {
      const error = new ServiceError(
        "WhatsApp accepted the request without returning a message ID",
        PROVIDER,
        payload,
      );
      error.status = 502;
      throw error;
    }
    return { id, recipient, raw: payload };
  }

  sendText(input: WhatsAppTextInput) {
    const body = input.body.trim();
    if (!body) {
      throw Object.assign(new Error("WhatsApp text body is required"), { status: 400 });
    }
    const recipient = input.to?.trim() || process.env.WHATSAPP_RECIPIENT?.trim();
    if (!recipient) {
      throw Object.assign(
        new Error("WhatsApp recipient is required: provide 'to' or set WHATSAPP_RECIPIENT"),
        { status: 400 },
      );
    }
    return this.sendMessage(recipient, {
      type: "text",
      text: {
        body,
        preview_url: input.previewUrl ?? false,
      },
    });
  }
}

export const whatsapp = new WhatsAppService();
export default whatsapp;
