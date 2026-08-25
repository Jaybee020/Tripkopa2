import type { SupabaseClient } from "@supabase/supabase-js";
import { notifications } from "@/lib/notifications/dispatcher";

export type ReminderCustomer = {
  id: string;
  email: string | null;
  whatsapp_number: string | null;
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
  return value.replace(/[&<>'\"]/g, (character) => replacements[character] || character);
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
  const opening = isLate
    ? `Your Tripkopa repayment of ${formattedAmount} for installment ${installment.sequence_number} was due on ${formattedDueDate}.`
    : `Your Tripkopa repayment of ${formattedAmount} for installment ${installment.sequence_number} is due on ${formattedDueDate}.`;
  const graceLine = installment.grace_due_date
    ? `The current grace deadline is ${readableDate(installment.grace_due_date)}.`
    : "";
  const text = [
    `Hello ${name},`,
    "",
    opening,
    graceLine,
    "",
    "Reply to your Tripkopa conversation to request secure payment instructions or check your repayment status.",
    "",
    "If you have already paid, please disregard this reminder while your payment is being confirmed.",
    "",
    "Tripkopa",
  ].filter(Boolean).join("\n");

  const { data: inserted, error: insertError } = await supabase
    .from("installment_reminders")
    .insert({
      customer_id: customer.id,
      booking_id: booking.id,
      installment_id: installment.id,
      idempotency_key: idempotencyKey,
      delivery_channel: "MULTI",
      recipient: null,
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

  const result = await notifications.send({
    supabase,
    customerId: customer.id,
    notificationType: "REPAYMENT_REMINDER",
    entityType: "installment_reminder",
    entityId: reminder.id,
    idempotencyKey: `tripkopa-reminder:${customer.id}:${idempotencyKey}`,
    recipient: customer,
    message: {
      subject,
      text,
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.6;color:#17202a;max-width:600px;margin:0 auto">
          <h2 style="color:#0b6b57">${isLate ? "Repayment overdue" : "Repayment reminder"}</h2>
          <p>Hello ${escapeHtml(name)},</p>
          <p>${escapeHtml(opening)}</p>
          ${graceLine ? `<p><strong>${escapeHtml(graceLine)}</strong></p>` : ""}
          <p>Reply to your Tripkopa conversation to request secure payment instructions or check your repayment status.</p>
          <p style="color:#5f6b76">If you have already paid, please disregard this reminder while your payment is being confirmed.</p>
          <p>Tripkopa</p>
        </div>
      `,
    },
    metadata: {
      booking_id: booking.id,
      installment_id: installment.id,
      reminder_kind: reminderKind,
    },
  });

  const newlySent = result.deliveries.filter(
    (delivery) => delivery.status === "SENT" && !delivery.duplicate,
  );
  const providerMessageId = result.deliveries.find(
    (delivery) => delivery.status === "SENT",
  )?.provider_message_id || null;
  const sentAt = new Date().toISOString();
  const failureSummary = result.deliveries
    .filter((delivery) => delivery.status === "FAILED")
    .map((delivery) => `${delivery.channel}: ${delivery.error}`)
    .join("; ");
  const { error: reminderUpdateError } = await supabase
    .from("installment_reminders")
    .update({
      delivery_channel: result.channels.join(","),
      delivery_status: result.sent ? "SENT" : "FAILED",
      provider_message_id: providerMessageId,
      delivery_error: failureSummary || null,
      attempted_at: sentAt,
      sent_at: result.sent ? sentAt : null,
    })
    .eq("id", reminder.id);
  if (reminderUpdateError) throw reminderUpdateError;

  if (!result.sent) {
    throw new Error(failureSummary || "All configured reminder channels failed");
  }

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

  if (newlySent.length) {
    await supabase.from("operational_events").insert({
      customer_id: customer.id,
      booking_id: booking.id,
      event_type: "installment.reminder_sent",
      payload: {
        installment_id: installment.id,
        channels: newlySent.map((delivery) => delivery.channel),
        deliveries: newlySent,
        trigger_source: "CRON",
        reminder_kind: reminderKind,
      },
    });
  }
  return {
    sent: true,
    duplicate: newlySent.length === 0,
    partial_failure: result.partial_failure,
    deliveries: result.deliveries,
    sent_at: sentAt,
  };
}
