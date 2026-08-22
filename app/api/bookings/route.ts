import { NextResponse } from "next/server";
import { z } from "zod";
import { BookingCreateInput } from "@/lib/api-contracts";
import { requireAgentCustomer } from "@/lib/auth/agent";
import { bad, failure } from "@/lib/api-utils";
import { toCustomerBooking, type CustomerBookingRow } from "@/lib/itinerary-delivery";
import { applyBookingPayment } from "@/lib/booking-payments";

type QuoteDetails = {
  offer?: unknown;
  booking_type?: string;
  fare_rules?: { ticket_type?: string } & Record<string, unknown>;
  search?: {
    departure_date?: string;
    return_date?: string | null;
  };
  pricing?: {
    route_category?: string | null;
    trust_tier?: string | null;
    repayment_plan?: {
      deposit_amount: number;
      repayment_deadline: string;
      grace_deadline: string;
      post_travel_amount: number;
      post_travel_deadline: string | null;
      installments: Array<{
        sequence_number: number;
        due_date: string;
        amount: number;
        phase: "PRE_TRAVEL" | "POST_TRAVEL";
      }>;
    } | null;
  };
};

export async function POST(request: Request) {
  try {
    const input = BookingCreateInput.parse(await request.json());
    const { customer, supabase } = await requireAgentCustomer(request);

    const { data: quote, error: quoteError } = await supabase
      .from("quotes")
      .select("*")
      .eq("id", input.quote_id)
      .eq("customer_id", customer.id)
      .single();
    if (quoteError) throw quoteError;
    if (quote.status !== "ACTIVE") {
      return NextResponse.json(
        { error: "Quote is not active" },
        { status: 409 },
      );
    }
    if (Date.parse(quote.expires_at) <= Date.now()) {
      return NextResponse.json({ error: "Quote has expired" }, { status: 409 });
    }

    const details = quote.details as QuoteDetails;
    if (details.booking_type && details.booking_type !== input.booking_type) {
      return NextResponse.json({ error: "Booking type does not match the quote" }, { status: 409 });
    }
    if ((input.quote_version ?? 1) !== quote.version) {
      return NextResponse.json(
        { error: "Accept the latest quote version before booking", current_version: quote.version },
        { status: 409 },
      );
    }
    const repaymentPlan = details.pricing?.repayment_plan;
    if (input.booking_type === "flexible" && !repaymentPlan) {
      return NextResponse.json(
        { error: "Quote does not include a flexible repayment plan" },
        { status: 409 },
      );
    }

    const initialStatus = input.terms_accepted
      ? input.booking_type === "flexible"
        ? "AWAITING_DEPOSIT"
        : "AWAITING_PAYMENT"
      : "AWAITING_TERMS";

    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .insert({
        customer_id: customer.id,
        quote_id: quote.id,
        booking_type: input.booking_type,
        status: initialStatus,
        currency: quote.currency,
        total_amount: quote.total_amount,
        deposit_amount: input.booking_type === "flexible" ? quote.deposit_amount : null,
        amount_paid: 0,
        balance_amount: quote.total_amount,
        rule_version: quote.rule_version,
        route_category: quote.route_category || details.pricing?.route_category || null,
        trust_tier_at_booking: quote.trust_tier || details.pricing?.trust_tier || null,
        ticket_type: details.fare_rules?.ticket_type || "unconfirmed",
        fare_rules: details.fare_rules || null,
        departure_date: details.search?.departure_date || null,
        travel_completion_date: details.search?.return_date || details.search?.departure_date || null,
        repayment_deadline: repaymentPlan?.repayment_deadline || null,
        grace_deadline: repaymentPlan?.grace_deadline || null,
        post_travel_amount: repaymentPlan?.post_travel_amount || 0,
        post_travel_deadline: repaymentPlan?.post_travel_deadline || null,
        passengers: input.passengers,
        flight_details: details.offer ?? quote.details,
      })
      .select("*")
      .single();
    if (bookingError) throw bookingError;

    if (input.booking_type === "flexible" && repaymentPlan) {
      const { error: installmentsError } = await supabase
        .from("installments")
        .insert(
          repaymentPlan.installments.map((installment) => ({
            customer_id: customer.id,
            booking_id: booking.id,
            sequence_number: installment.sequence_number,
            due_date: installment.due_date,
            amount: installment.amount,
            phase: installment.phase,
            grace_due_date:
              installment.phase === "PRE_TRAVEL" &&
              installment.sequence_number === repaymentPlan.installments.filter((item) => item.phase === "PRE_TRAVEL").at(-1)?.sequence_number
                ? repaymentPlan.grace_deadline
                : null,
            paid_amount: 0,
            status: "PENDING",
          })),
        );
      if (installmentsError) throw installmentsError;
    }

    const { error: quoteUpdateError } = await supabase
      .from("quotes")
      .update({ status: "CONSUMED" })
      .eq("id", quote.id)
      .eq("customer_id", customer.id);
    if (quoteUpdateError) throw quoteUpdateError;

    let walletAllocation: Record<string, unknown> | null = null;
    if (input.terms_accepted) {
      const { data: wallet, error: walletError } = await supabase
        .from("wallets")
        .select("id,balance")
        .eq("customer_id", customer.id)
        .eq("currency", booking.currency)
        .maybeSingle();
      if (walletError) throw walletError;
      const walletAmount = Math.min(
        Number(wallet?.balance || 0),
        Number(booking.balance_amount || 0),
      );
      if (walletAmount > 0) {
        const { data: walletPayment, error: walletPaymentError } = await supabase
          .from("payments")
          .insert({
            customer_id: customer.id,
            booking_id: booking.id,
            provider: "tripkopa_wallet",
            provider_reference: `wallet-${booking.id}`,
            payment_type: "wallet_application",
            amount: walletAmount,
            currency: booking.currency,
            status: "SUCCEEDED",
            idempotency_key: `${booking.id}:initial_wallet_allocation`,
            metadata: { source: "existing_wallet_balance" },
          })
          .select("id")
          .single();
        if (walletPaymentError) throw walletPaymentError;
        walletAllocation = await applyBookingPayment(walletPayment.id) as Record<string, unknown>;
      }
    }

    const { data: currentBooking, error: currentBookingError } = await supabase
      .from("bookings")
      .select("*")
      .eq("id", booking.id)
      .eq("customer_id", customer.id)
      .single();
    if (currentBookingError) throw currentBookingError;

    return NextResponse.json({
      ...toCustomerBooking(currentBooking as CustomerBookingRow),
      wallet_allocation: walletAllocation,
    }, { status: 201 });
  } catch (error) {
    return error instanceof z.ZodError ? bad(error) : failure(error);
  }
}
