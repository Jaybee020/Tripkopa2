import type { SupabaseClient } from "@supabase/supabase-js";
import { notifications } from "@/lib/notifications/dispatcher";

type KycNotificationCustomer = {
  id: string;
  email?: unknown;
  whatsapp_number?: unknown;
  first_name?: unknown;
  last_name?: unknown;
};

function escapeHtml(value: string) {
  const replacements: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    "\"": "&quot;",
  };
  return value.replace(/[&<>'\"]/g, (character) => replacements[character] || character);
}

export async function sendKycSuccessNotifications(
  supabase: SupabaseClient,
  sessionId: string,
  customer: KycNotificationCustomer,
) {
  const { data: session, error: sessionError } = await supabase
    .from("kyc_sessions")
    .select("id,status")
    .eq("id", sessionId)
    .eq("customer_id", customer.id)
    .single();
  if (sessionError) throw sessionError;
  if (session.status !== "VERIFIED") return { sent: false, reason: "KYC_NOT_VERIFIED" };

  const name = [customer.first_name, customer.last_name]
    .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
    .join(" ") || "Traveller";
  const text = [
    `Hello ${name},`,
    "",
    "Your Tripkopa identity verification has been completed successfully.",
    "Your dedicated Tripkopa wallet account is now ready for eligible bookings and payments.",
    "Reply CONTINUE to resume your booking and repayment plan.",
    "",
    "For your security, Tripkopa will never include your BVN in a message or ask you to reply with it.",
    "",
    "Tripkopa",
  ].join("\n");

  const result = await notifications.send({
    supabase,
    customerId: customer.id,
    notificationType: "KYC_SUCCESS",
    entityType: "kyc_session",
    entityId: sessionId,
    idempotencyKey: `tripkopa-kyc:${customer.id}:${sessionId}`,
    recipient: customer,
    message: {
      subject: "Your Tripkopa identity verification is complete",
      text,
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.6;color:#17202a;max-width:600px;margin:0 auto">
          <h2 style="color:#0b6b57">Identity verification complete</h2>
          <p>Hello ${escapeHtml(name)},</p>
          <p>Your Tripkopa identity verification has been completed successfully.</p>
          <p>Your dedicated Tripkopa wallet account is now ready for eligible bookings and payments.</p>
          <p><strong>Reply CONTINUE in your Tripkopa WhatsApp chat to resume your booking and repayment plan.</strong></p>
          <p style="color:#5f6b76">For your security, Tripkopa will never include your BVN in a message or ask you to reply with it.</p>
          <p>Tripkopa</p>
        </div>
      `,
    },
    metadata: { session_id: sessionId },
  });

  const newlySent = result.deliveries.filter(
    (delivery) => delivery.status === "SENT" && !delivery.duplicate,
  );
  if (newlySent.length) {
    await supabase.from("operational_events").insert({
      customer_id: customer.id,
      event_type: "kyc.success_notification_sent",
      payload: {
        session_id: sessionId,
        channels: newlySent.map((delivery) => delivery.channel),
        deliveries: newlySent,
      },
    });
  }
  return result;
}
