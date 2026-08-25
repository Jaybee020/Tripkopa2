import type { SupabaseClient } from "@supabase/supabase-js";
import { emailChannel, whatsappChannel } from "@/lib/notifications/channels";
import type {
  NotificationChannelAdapter,
  NotificationDeliveryResult,
  NotificationMessage,
  NotificationRecipient,
} from "@/lib/notifications/types";

type NotificationType = "KYC_SUCCESS" | "REPAYMENT_REMINDER";

const CHANNEL_ENV: Record<NotificationType, string> = {
  KYC_SUCCESS: "KYC_SUCCESS_NOTIFICATION_CHANNELS",
  REPAYMENT_REMINDER: "REPAYMENT_REMINDER_NOTIFICATION_CHANNELS",
};

export function configuredNotificationChannels(type: NotificationType) {
  const environmentName = CHANNEL_ENV[type];
  const configured = process.env[environmentName] || process.env.NOTIFICATION_CHANNELS || "WHATSAPP";
  const channels = [...new Set(configured
    .split(",")
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean))];
  if (!channels.length) {
    throw Object.assign(new Error(`${environmentName} must contain at least one channel`), {
      status: 500,
    });
  }
  return channels;
}

export class NotificationDispatcher {
  private readonly adapters = new Map<string, NotificationChannelAdapter>();

  constructor(adapters: NotificationChannelAdapter[] = []) {
    for (const adapter of adapters) this.register(adapter);
  }

  register(adapter: NotificationChannelAdapter) {
    this.adapters.set(adapter.channel.trim().toUpperCase(), adapter);
    return this;
  }

  async send(input: {
    supabase: SupabaseClient;
    customerId: string;
    notificationType: NotificationType;
    entityType: string;
    entityId: string;
    idempotencyKey: string;
    recipient: NotificationRecipient;
    message: NotificationMessage;
    metadata?: Record<string, unknown>;
  }) {
    const channels = configuredNotificationChannels(input.notificationType);
    const results: NotificationDeliveryResult[] = [];

    for (const channel of channels) {
      if (!this.adapters.has(channel)) {
        throw Object.assign(
          new Error(`Notification channel ${channel} is configured but has no registered adapter`),
          { status: 500 },
        );
      }
    }

    for (const channel of channels) {
      const adapter = this.adapters.get(channel)!;

      const notificationKey = `${input.idempotencyKey}:${channel}`;
      const { data: existing, error: existingError } = await input.supabase
        .from("notification_deliveries")
        .select("*")
        .eq("notification_key", notificationKey)
        .maybeSingle();
      if (existingError) throw existingError;
      if (existing?.status === "SENT") {
        results.push({
          channel,
          status: "SENT",
          recipient: existing.recipient,
          provider_message_id: existing.provider_message_id,
          sent_at: existing.sent_at,
          duplicate: true,
        });
        continue;
      }

      let recipient = "";
      try {
        recipient = adapter.resolveRecipient(input.recipient);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        await this.recordFailure(input, channel, notificationKey, null, errorMessage, existing?.id);
        results.push({ channel, status: "FAILED", error: errorMessage });
        continue;
      }

      const delivery = existing || await this.createDelivery(
        input,
        channel,
        notificationKey,
        recipient,
      );
      try {
        const delivered = await adapter.send({
          recipient,
          message: input.message,
          idempotencyKey: notificationKey,
        });
        const sentAt = new Date().toISOString();
        const { error: updateError } = await input.supabase
          .from("notification_deliveries")
          .update({
            recipient: delivered.recipient,
            status: "SENT",
            provider_message_id: delivered.id,
            error: null,
            attempted_at: sentAt,
            sent_at: sentAt,
          })
          .eq("id", delivery.id);
        if (updateError) throw updateError;
        results.push({
          channel,
          status: "SENT",
          recipient: delivered.recipient,
          provider_message_id: delivered.id,
          sent_at: sentAt,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        await this.recordFailure(
          input,
          channel,
          notificationKey,
          recipient,
          errorMessage,
          delivery.id,
        );
        results.push({ channel, status: "FAILED", recipient, error: errorMessage });
      }
    }

    return {
      sent: results.some((item) => item.status === "SENT"),
      partial_failure:
        results.some((item) => item.status === "SENT") &&
        results.some((item) => item.status === "FAILED"),
      channels,
      deliveries: results,
    };
  }

  private async createDelivery(
    input: Parameters<NotificationDispatcher["send"]>[0],
    channel: string,
    notificationKey: string,
    recipient: string,
  ) {
    const { data, error } = await input.supabase
      .from("notification_deliveries")
      .insert({
        customer_id: input.customerId,
        notification_type: input.notificationType,
        entity_type: input.entityType,
        entity_id: input.entityId,
        notification_key: notificationKey,
        channel,
        recipient,
        status: "PENDING",
        attempted_at: new Date().toISOString(),
        metadata: input.metadata || {},
      })
      .select("*")
      .single();
    if (error?.code === "23505") {
      const { data: existing, error: existingError } = await input.supabase
        .from("notification_deliveries")
        .select("*")
        .eq("notification_key", notificationKey)
        .single();
      if (existingError) throw existingError;
      return existing;
    }
    if (error) throw error;
    return data;
  }

  private async recordFailure(
    input: Parameters<NotificationDispatcher["send"]>[0],
    channel: string,
    notificationKey: string,
    recipient: string | null,
    errorMessage: string,
    deliveryId?: string,
  ) {
    const values = {
      recipient,
      status: "FAILED",
      error: errorMessage.slice(0, 1000),
      attempted_at: new Date().toISOString(),
    };
    const query = deliveryId
      ? input.supabase.from("notification_deliveries").update(values).eq("id", deliveryId)
      : input.supabase.from("notification_deliveries").upsert({
          customer_id: input.customerId,
          notification_type: input.notificationType,
          entity_type: input.entityType,
          entity_id: input.entityId,
          notification_key: notificationKey,
          channel,
          metadata: input.metadata || {},
          ...values,
        }, { onConflict: "notification_key" });
    const { error } = await query;
    if (error) throw error;
  }
}

export const notifications = new NotificationDispatcher([emailChannel, whatsappChannel]);
