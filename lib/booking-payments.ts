import { supabase } from "@/lib/services/supabase";
import { taketrips } from "@/lib/services/taketrips";

type PaymentRow = {
  id: string;
  customer_id: string;
  booking_id?: string | null;
  amount: number | string;
  currency: string;
  status: string;
  metadata?: Record<string, unknown> | null;
  provider_reference?: string | null;
};

type BookingRow = {
  id: string;
  customer_id: string;
  booking_type: "full" | "flexible";
  status: string;
  currency: string;
  total_amount: number | string;
  deposit_amount?: number | string | null;
  amount_paid: number | string;
  balance_amount: number | string;
  passengers: unknown[];
  flight_details: unknown;
  provider_reference?: string | null;
};

type InstallmentRow = {
  id: string;
  amount: number | string;
  paid_amount: number | string;
  status: string;
};

function money(value: number | string | null | undefined) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

async function orderFlight(booking: BookingRow, paymentReference: string | null) {
  if (process.env.TAKETRIPS_MOCK_ORDER_SUCCESS === "true") {
    return {
      provider_reference: `mock-ticket-${booking.id}`,
      ticket_reference: `MOCK-${booking.id.slice(0, 8).toUpperCase()}`,
      raw: { status: "mocked" },
    };
  }

  const result = await taketrips.order(
    booking.flight_details,
    booking.passengers,
    paymentReference || undefined,
  );
  const record = result as Record<string, unknown>;
  const providerReference =
    typeof record.bookingReference === "string"
      ? record.bookingReference
      : typeof record.reference === "string"
        ? record.reference
        : typeof record.id === "string"
          ? record.id
          : null;
  const ticketReference =
    typeof record.ticketReference === "string"
      ? record.ticketReference
      : typeof record.ticket_number === "string"
        ? record.ticket_number
        : providerReference;

  return {
    provider_reference: providerReference,
    ticket_reference: ticketReference,
    raw: result,
  };
}

async function maybeTicketBooking(booking: BookingRow, payment: PaymentRow) {
  if (booking.provider_reference) return { ticketed: false, skipped: "already_ticketed" };

  const shouldTicket =
    booking.booking_type === "flexible"
      ? money(booking.amount_paid) >= money(booking.deposit_amount)
      : money(booking.amount_paid) >= money(booking.total_amount);
  if (!shouldTicket) return { ticketed: false, skipped: "payment_threshold_not_met" };

  await supabase.admin
    .from("bookings")
    .update({ status: "BOOKING_IN_PROGRESS" })
    .eq("id", booking.id);

  try {
    const ordered = await orderFlight(booking, payment.provider_reference || payment.id);
    const releaseLevel = booking.booking_type === "flexible" ? "LIMITED" : "FULL";
    const { error: itineraryError } = await supabase.admin
      .from("itineraries")
      .insert({
        customer_id: booking.customer_id,
        booking_id: booking.id,
        release_level: releaseLevel,
        segments: {
          flight: booking.flight_details,
          provider_order: ordered.raw,
        },
        ticket_reference:
          releaseLevel === "FULL" ? ordered.ticket_reference : null,
      });
    if (itineraryError) throw itineraryError;

    const { error: bookingError } = await supabase.admin
      .from("bookings")
      .update({
        status: "TICKETED",
        provider_reference: ordered.provider_reference,
      })
      .eq("id", booking.id);
    if (bookingError) throw bookingError;

    await supabase.admin.from("operational_events").insert({
      customer_id: booking.customer_id,
      booking_id: booking.id,
      event_type: "booking.ticketed",
      payload: {
        release_level: releaseLevel,
        provider_reference: ordered.provider_reference,
      },
    });

    return { ticketed: true, release_level: releaseLevel };
  } catch (error) {
    await supabase.admin
      .from("bookings")
      .update({ status: "MANUAL_REVIEW" })
      .eq("id", booking.id);
    await supabase.admin.from("operational_events").insert({
      customer_id: booking.customer_id,
      booking_id: booking.id,
      event_type: "booking.ticketing_failed",
      payload: {
        payment_id: payment.id,
        error: error instanceof Error ? error.message : String(error),
      },
    });
    return {
      ticketed: false,
      failed: true,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function applyToInstallments(booking: BookingRow, amount: number) {
  let remaining = amount;
  const { data: installments, error } = await supabase.admin
    .from("installments")
    .select("*")
    .eq("booking_id", booking.id)
    .eq("customer_id", booking.customer_id)
    .order("sequence_number", { ascending: true });
  if (error) throw error;

  for (const installment of (installments || []) as InstallmentRow[]) {
    if (remaining <= 0) break;
    const due = roundMoney(money(installment.amount) - money(installment.paid_amount));
    if (due <= 0) continue;
    const applied = Math.min(remaining, due);
    const paidAmount = roundMoney(money(installment.paid_amount) + applied);
    remaining = roundMoney(remaining - applied);
    const status = paidAmount >= money(installment.amount) ? "PAID" : "PARTIALLY_PAID";
    const { error: updateError } = await supabase.admin
      .from("installments")
      .update({ paid_amount: paidAmount, status })
      .eq("id", installment.id);
    if (updateError) throw updateError;
  }
}

export async function applyBookingPayment(paymentId: string) {
  const { data: payment, error: paymentError } = await supabase.admin
    .from("payments")
    .select("*")
    .eq("id", paymentId)
    .single();
  if (paymentError) throw paymentError;

  const typedPayment = payment as PaymentRow;
  if (!typedPayment.booking_id || typedPayment.status !== "SUCCEEDED") {
    return { applied: false, reason: "not_booking_payment" };
  }
  if (typedPayment.metadata?.booking_allocation_applied === true) {
    return { applied: false, reason: "already_applied" };
  }

  const { data: booking, error: bookingError } = await supabase.admin
    .from("bookings")
    .select("*")
    .eq("id", typedPayment.booking_id)
    .eq("customer_id", typedPayment.customer_id)
    .single();
  if (bookingError) throw bookingError;
  const typedBooking = booking as BookingRow;

  const amount = money(typedPayment.amount);
  const { data: wallet, error: walletError } = await supabase.admin
    .from("wallets")
    .select("*")
    .eq("customer_id", typedPayment.customer_id)
    .eq("currency", typedPayment.currency)
    .single();
  if (walletError) throw walletError;

  const walletBalance = money(wallet.balance);
  if (walletBalance < amount) {
    throw Object.assign(new Error("Wallet balance is insufficient for booking allocation"), {
      status: 409,
    });
  }

  const nextAmountPaid = roundMoney(money(typedBooking.amount_paid) + amount);
  const nextBalance = Math.max(
    0,
    roundMoney(money(typedBooking.total_amount) - nextAmountPaid),
  );
  const depositSatisfied =
    typedBooking.booking_type === "flexible" &&
    nextAmountPaid >= money(typedBooking.deposit_amount);
  const fullSatisfied = nextBalance === 0;
  const nextStatus = fullSatisfied
    ? "PAID"
    : depositSatisfied
      ? "PAYMENT_RECEIVED"
      : "PARTIALLY_PAID";

  const { error: walletDebitError } = await supabase.admin
    .from("wallets")
    .update({ balance: roundMoney(walletBalance - amount) })
    .eq("id", wallet.id);
  if (walletDebitError) throw walletDebitError;

  const { error: ledgerError } = await supabase.admin.from("ledger_entries").insert([
    {
      customer_id: typedPayment.customer_id,
      wallet_id: wallet.id,
      payment_id: typedPayment.id,
      booking_id: typedBooking.id,
      entry_type: "BOOKING_PAYMENT",
      amount,
      currency: typedPayment.currency,
      status: "POSTED",
      description: "Wallet applied to booking",
      account_code: "CUSTOMER_AVAILABLE",
      direction: "DEBIT",
      provider_reference: typedPayment.provider_reference,
      idempotency_key: `${typedPayment.id}:booking_allocation`,
    },
    {
      customer_id: typedPayment.customer_id,
      wallet_id: wallet.id,
      payment_id: typedPayment.id,
      booking_id: typedBooking.id,
      entry_type: "BOOKING_PAYMENT",
      amount,
      currency: typedPayment.currency,
      status: "POSTED",
      description: "Booking receivable settled",
      account_code: "BOOKING_RECEIVABLE",
      direction: "CREDIT",
      provider_reference: typedPayment.provider_reference,
      idempotency_key: `${typedPayment.id}:booking_allocation`,
    },
  ]);
  if (ledgerError) throw ledgerError;

  if (typedBooking.booking_type === "flexible" && depositSatisfied) {
    const previousInstallmentAllocation = Math.max(
      0,
      roundMoney(money(typedBooking.amount_paid) - money(typedBooking.deposit_amount)),
    );
    const nextInstallmentAllocation = Math.max(
      0,
      roundMoney(nextAmountPaid - money(typedBooking.deposit_amount)),
    );
    const installmentAllocation = roundMoney(
      nextInstallmentAllocation - previousInstallmentAllocation,
    );
    if (installmentAllocation > 0) {
      await applyToInstallments(typedBooking, installmentAllocation);
    }
  }

  const { data: updatedBooking, error: updateBookingError } = await supabase.admin
    .from("bookings")
    .update({
      amount_paid: nextAmountPaid,
      balance_amount: nextBalance,
      status: nextStatus,
    })
    .eq("id", typedBooking.id)
    .select("*")
    .single();
  if (updateBookingError) throw updateBookingError;

  const nextMetadata = {
    ...(typedPayment.metadata || {}),
    booking_allocation_applied: true,
    booking_allocation_applied_at: new Date().toISOString(),
  };
  const { error: paymentUpdateError } = await supabase.admin
    .from("payments")
    .update({ metadata: nextMetadata })
    .eq("id", typedPayment.id);
  if (paymentUpdateError) throw paymentUpdateError;

  const ticketing = await maybeTicketBooking(
    updatedBooking as BookingRow,
    typedPayment,
  );

  return {
    applied: true,
    booking_id: typedBooking.id,
    status: (updatedBooking as BookingRow).status,
    ticketing,
  };
}

export async function retryBookingTicketing(bookingId: string) {
  const { data: booking, error: bookingError } = await supabase.admin
    .from("bookings")
    .select("*")
    .eq("id", bookingId)
    .single();
  if (bookingError) throw bookingError;

  const { data: payment, error: paymentError } = await supabase.admin
    .from("payments")
    .select("*")
    .eq("booking_id", bookingId)
    .eq("status", "SUCCEEDED")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (paymentError) throw paymentError;
  if (!payment) {
    throw Object.assign(new Error("A succeeded booking payment is required before ticketing"), {
      status: 409,
    });
  }

  return maybeTicketBooking(booking as BookingRow, payment as PaymentRow);
}
