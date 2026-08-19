import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resend } from "@/lib/services/resend";

export type ReminderCustomer = {
  id: string;
  email: string | null;
  first_name?: string | null;
  last_name?: string | null;
};

export type ReminderBooking = {
  id: string;
  customer_id: string;
  status: string;
  currency: string;
};

export type ReminderInstallment = {
  id: string;
  customer_id: string;
  booking_id: string;
  sequence_number: number;
  due_date: string;
  grace_due_date?: string | null;
  amount: number | string;
  paid_amount: number | string;
  status: string;
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

function money(value: number, currency: string) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

function readableDate(value: string) {
  return new Intl.DateTimeFormat("en-NG", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

export async function sendScheduledRepaymentReminder(input: {
  supabase: SupabaseClient;
  customer: ReminderCustomer;
  booking: ReminderBooking;
  installment: ReminderInstallment;
  idempotencyKey: string;
  reminderKind: "UPCOMING" | "DUE_TODAY" | "OVERDUE" | "GRACE";
}) {
  const { supabase, customer, booking, installment, idempotencyKey, reminderKind } = input;
  const email = customer.email?.trim() || "";
  if (!email) throw new Error("Customer email is required for a repayment reminder");
  if (["PAID", "CANCELLED", "WAIVED", "DEFAULTED"].includes(installment.status)) {
    return { sent: false, reason: "INSTALLMENT_NOT_REMINDABLE" };
  }
  if (["CANCELLED", "CANCELLATION_REVIEW"].includes(booking.status)) {
    return { sent: false, reason: "BOOKING_NOT_REMINDABLE" };
  }

  const outstanding = Math.max(0, Number(installment.amount) - Number(installment.paid_amount || 0));
  if (outstanding <= 0) return { sent: false, reason: "NOTHING_DUE" };

  const formattedAmount = money(outstanding, booking.currency || "NGN");
  const formattedDueDate = readableDate(installment.due_date);
  const name = [customer.first_name, customer.last_name].filter(Boolean).join(" ") || "Traveller";
  const isLate = reminderKind === "OVERDUE" || reminderKind === "GRACE";
  const subject = isLate
    ? `Tripkopa repayment overdue: ${formattedAmount}`
    : `Tripkopa repayment reminder: ${formattedAmount} due ${formattedDueDate}`;

  const { data: inserted, error: insertError } = await supabase
    .from("installment_reminders")
    .insert({
      customer_id: customer.id,
      booking_id: booking.id,
      installment_id: installment.id,
      idempotency_key: idempotencyKey,
      delivery_channel: "EMAIL",
      recipient: email,
      subject,
      delivery_status: "PENDING",
      trigger_source: "CRON",
      attempted_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  let reminder = inserted;
  if (insertError?.code === "23505") {
    const { data: existing, error: existingError } = await supabase
      .from("installment_reminders")
      .select("*")
      .eq("customer_id", customer.id)
      .eq("idempotency_key", idempotencyKey)
      .single();
    if (existingError) throw existingError;
    reminder = existing;
  } else if (insertError) {
    throw insertError;
  }
  if (reminder.installment_id !== installment.id) {
    throw new Error("Reminder idempotency key belongs to another installment");
  }
  if (reminder.delivery_status === "SENT") {
    return { sent: true, duplicate: true, sent_at: reminder.sent_at };
  }

  const opening = isLate
    ? `Your Tripkopa repayment of ${formattedAmount} for installment ${installment.sequence_number} was due on ${formattedDueDate}.`
    : `Your Tripkopa repayment of ${formattedAmount} for installment ${installment.sequence_number} is due on ${formattedDueDate}.`;
  const graceLine = installment.grace_due_date
    ? `The current grace deadline is ${readableDate(installment.grace_due_date)}.`
    : "";
  const providerKey = `tripkopa-reminder-${createHash("sha256")
    .update(`${customer.id}:${idempotencyKey}`)
    .digest("hex")}`;

  let delivered: { id: string };
  try {
    delivered = await resend.sendEmail(
      {
        to: email,
        subject,
        text: [
          `Hello ${name},`,
          "",
          opening,
          graceLine,
          "",
          "Please return to your Tripkopa conversation to request secure payment instructions or check your repayment status.",
          "",
          "If you have already paid, please disregard this reminder while your payment is being confirmed.",
          "",
          "Tripkopa",
        ].filter(Boolean).join("\n"),
        html: `
          <div style="font-family:Arial,sans-serif;line-height:1.6;color:#17202a;max-width:600px;margin:0 auto">
            <h2 style="color:#0b6b57">${isLate ? "Repayment overdue" : "Repayment reminder"}</h2>
            <p>Hello ${escapeHtml(name)},</p>
            <p>${escapeHtml(opening)}</p>
            ${graceLine ? `<p><strong>${escapeHtml(graceLine)}</strong></p>` : ""}
            <p>Please return to your Tripkopa conversation to request secure payment instructions or check your repayment status.</p>
            <p style="color:#5f6b76">If you have already paid, please disregard this reminder while your payment is being confirmed.</p>
            <p>Tripkopa</p>
          </div>
        `,
      },
      { idempotencyKey: providerKey },
    );
  } catch (error) {
    await supabase
      .from("installment_reminders")
      .update({
        delivery_status: "FAILED",
        delivery_error: error instanceof Error ? error.message.slice(0, 1000) : "Email delivery failed",
        attempted_at: new Date().toISOString(),
      })
      .eq("id", reminder.id)
      .neq("delivery_status", "SENT");
    throw error;
  }

  const sentAt = new Date().toISOString();
  const { data: markedSent, error: updateError } = await supabase
    .from("installment_reminders")
    .update({
      delivery_status: "SENT",
      provider_message_id: delivered.id,
      delivery_error: null,
      sent_at: sentAt,
    })
    .eq("id", reminder.id)
    .neq("delivery_status", "SENT")
    .select("id,sent_at")
    .maybeSingle();
  if (updateError) throw updateError;

  const { count, error: countError } = await supabase
    .from("installment_reminders")
    .select("id", { count: "exact", head: true })
    .eq("installment_id", installment.id)
    .eq("delivery_status", "SENT");
  if (countError) throw countError;
  const { error: installmentError } = await supabase
    .from("installments")
    .update({ reminder_count: count || 0 })
    .eq("id", installment.id);
  if (installmentError) throw installmentError;

  if (markedSent) {
    await supabase.from("operational_events").insert({
      customer_id: customer.id,
      booking_id: booking.id,
      event_type: "installment.reminder_sent",
      payload: {
        installment_id: installment.id,
        channel: "EMAIL",
        trigger_source: "CRON",
        reminder_kind: reminderKind,
        provider_message_id: delivered.id,
      },
    });
  }
  return { sent: true, sent_at: markedSent?.sent_at || sentAt };
}
