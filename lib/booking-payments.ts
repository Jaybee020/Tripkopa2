import { supabase } from "@/lib/services/supabase";
import { taketrips } from "@/lib/services/taketrips";
import { refreshCustomerTrustTier } from "@/lib/trust-financing";

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
  post_travel_amount?: number | string | null;
};

function money(value: number | string | null | undefined) {
  return Math.round(Number(value || 0) * 100) / 100;
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
  if ([
    "MANUAL_REVIEW",
    "CANCELLATION_REVIEW",
    "CANCELLATION_PENDING",
    "CANCELLED",
    "REFUNDED",
    "FAILED",
  ].includes(booking.status)) {
    return { ticketed: false, skipped: "booking_status_blocks_ticketing" };
  }

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
        provider_ticket_reference: ordered.ticket_reference,
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

async function maybeReleaseFullItinerary(booking: BookingRow, amountPaid: number) {
  if (booking.booking_type !== "flexible") return;
  if (amountPaid < money(booking.total_amount)) return;
  const { data: itinerary, error } = await supabase.admin
    .from("itineraries")
    .select("id,release_level,provider_ticket_reference")
    .eq("booking_id", booking.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!itinerary || itinerary.release_level === "FULL") return;
  const { error: updateError } = await supabase.admin
    .from("itineraries")
    .update({
      release_level: "FULL",
      ticket_reference: itinerary.provider_ticket_reference,
    })
    .eq("id", itinerary.id);
  if (updateError) throw updateError;
  await supabase.admin.from("operational_events").insert({
    customer_id: booking.customer_id,
    booking_id: booking.id,
    event_type: "itinerary.fully_released",
    payload: { outstanding_balance: 0 },
  });
}

export async function applyBookingPayment(paymentId: string) {
  const { data: payment, error: paymentError } = await supabase.admin
    .from("payments")
    .select("*")
    .eq("id", paymentId)
    .single();
  if (paymentError) throw paymentError;

  const typedPayment = payment as PaymentRow;
  if (typedPayment.status !== "SUCCEEDED") {
    return { applied: false, reason: "payment_not_succeeded" };
  }

  const { data: allocationData, error: allocationError } = await supabase.admin.rpc(
    "allocate_wallet_payment",
    { p_payment_id: typedPayment.id },
  );
  if (allocationError) throw allocationError;

  const summary = allocationData && typeof allocationData === "object"
    ? allocationData as Record<string, unknown>
    : { applied: false, reason: "invalid_allocation_result" };
  const allocations = Array.isArray(summary.allocations)
    ? summary.allocations.filter(
      (item): item is Record<string, unknown> => Boolean(item) && typeof item === "object",
    )
    : [];
  const bookingIds = [...new Set(allocations
    .map((item) => typeof item.booking_id === "string" ? item.booking_id : null)
    .filter((id): id is string => Boolean(id)))];
  const ticketing: Array<Record<string, unknown>> = [];

  for (const bookingId of bookingIds) {
    const { data: booking, error: bookingError } = await supabase.admin
      .from("bookings")
      .select("*")
      .eq("id", bookingId)
      .eq("customer_id", typedPayment.customer_id)
      .single();
    if (bookingError) throw bookingError;
    const typedBooking = booking as BookingRow;
    const result = await maybeTicketBooking(typedBooking, typedPayment);
    ticketing.push({ booking_id: bookingId, ...result });
    await maybeReleaseFullItinerary(typedBooking, money(typedBooking.amount_paid));
  }

  await refreshCustomerTrustTier(supabase.admin, typedPayment.customer_id);

  return {
    ...summary,
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
