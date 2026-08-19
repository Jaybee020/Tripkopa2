import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resend } from "@/lib/services/resend";

type KycEmailCustomer = {
  id: string;
  email?: unknown;
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
  return value.replace(/[&<>'"]/g, (character) => replacements[character] || character);
}

export async function sendKycSuccessEmail(
  supabase: SupabaseClient,
  sessionId: string,
  customer: KycEmailCustomer,
) {
  const email = typeof customer.email === "string" ? customer.email.trim() : "";
  if (!email) throw new Error("Customer email is required for the KYC confirmation email");

  const { data: session, error: sessionError } = await supabase
    .from("kyc_sessions")
    .select("id,status,success_email_status,success_email_sent_at")
    .eq("id", sessionId)
    .eq("customer_id", customer.id)
    .single();
  if (sessionError) throw sessionError;
  if (session.status !== "VERIFIED") return { sent: false, reason: "KYC_NOT_VERIFIED" };
  if (session.success_email_status === "SENT") {
    return { sent: true, sent_at: session.success_email_sent_at, duplicate: true };
  }

  const name = [customer.first_name, customer.last_name]
    .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
    .join(" ") || "Traveller";
  const idempotencyKey = `tripkopa-kyc-${createHash("sha256")
    .update(`${customer.id}:${sessionId}`)
    .digest("hex")}`;

  try {
    const delivered = await resend.sendEmail(
      {
        to: email,
        subject: "Your Tripkopa identity verification is complete",
        text: [
          `Hello ${name},`,
          "",
          "Your Tripkopa identity verification has been completed successfully.",
          "Your dedicated Tripkopa wallet account is now ready for eligible bookings and payments.",
          "",
          "For your security, Tripkopa will never include your BVN in an email or ask you to reply with it.",
          "",
          "Tripkopa",
        ].join("\n"),
        html: `
          <div style="font-family:Arial,sans-serif;line-height:1.6;color:#17202a;max-width:600px;margin:0 auto">
            <h2 style="color:#0b6b57">Identity verification complete</h2>
            <p>Hello ${escapeHtml(name)},</p>
            <p>Your Tripkopa identity verification has been completed successfully.</p>
            <p>Your dedicated Tripkopa wallet account is now ready for eligible bookings and payments.</p>
            <p style="color:#5f6b76">For your security, Tripkopa will never include your BVN in an email or ask you to reply with it.</p>
            <p>Tripkopa</p>
          </div>
        `,
      },
      { idempotencyKey },
    );
    const sentAt = new Date().toISOString();
    const { data: updatedSession, error: updateError } = await supabase
      .from("kyc_sessions")
      .update({
        success_email_status: "SENT",
        success_email_sent_at: sentAt,
        success_email_provider_id: delivered.id,
        success_email_error: null,
      })
      .eq("id", sessionId)
      .eq("customer_id", customer.id)
      .neq("success_email_status", "SENT")
      .select("id")
      .maybeSingle();
    if (updateError) throw updateError;
    if (updatedSession) {
      await supabase.from("operational_events").insert({
        customer_id: customer.id,
        event_type: "kyc.success_email_sent",
        payload: { session_id: sessionId, channel: "EMAIL" },
      });
    }
    return { sent: true, sent_at: sentAt };
  } catch (error) {
    await supabase
      .from("kyc_sessions")
      .update({
        success_email_status: "FAILED",
        success_email_error: error instanceof Error
          ? error.message.slice(0, 1000)
          : "KYC confirmation email failed",
      })
      .eq("id", sessionId)
      .eq("customer_id", customer.id)
      .neq("success_email_status", "SENT");
    throw error;
  }
}
