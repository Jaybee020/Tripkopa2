import { NextResponse } from "next/server";
import { z } from "zod";
import { RefundCreateInput } from "@/lib/api-contracts";
import { requireAgentCustomer } from "@/lib/auth/agent";
import { bad, failure } from "@/lib/api-utils";
import { calculateCancellationPricing } from "@/lib/cancellation-pricing";
import { isTrustTier, loadFinancingRules, type TrustTier } from "@/lib/financing-rules";
import type { RouteCategory } from "@/lib/airport-regions";

const ROUTE_CATEGORIES = new Set<RouteCategory>(["domestic", "regional", "international"]);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ payment_id: string }> },
) {
  try {
    const input = RefundCreateInput.parse(await request.json());
    const { payment_id } = await params;
    const { customer, supabase } = await requireAgentCustomer(request);
    const { data: payment, error } = await supabase
      .from("payments")
      .select("*")
      .eq("id", payment_id)
      .eq("customer_id", customer.id)
      .single();
    if (error) throw error;
    const { data: booking, error: bookingError } = payment.booking_id
      ? await supabase.from("bookings").select("ticket_type,fare_rules,total_amount,amount_paid,route_category,trust_tier_at_booking").eq("id", payment.booking_id).maybeSingle()
      : { data: null, error: null };
    if (bookingError) throw bookingError;
    const routeCategory = booking?.route_category as RouteCategory | undefined;
    const rules = await loadFinancingRules(supabase);
    const cancellation = booking && routeCategory && ROUTE_CATEGORIES.has(routeCategory)
      ? calculateCancellationPricing({
          totalAmount: Number(booking.total_amount),
          amountPaid: Number(booking.amount_paid),
          routeCategory,
          trustTier: (isTrustTier(booking.trust_tier_at_booking)
            ? booking.trust_tier_at_booking
            : "OBSERVER") as TrustTier,
          ticketType: booking.ticket_type,
          rules,
        })
      : null;
    const { data, error: refundError } = await supabase.from("refunds").insert({
      customer_id: customer.id,
      payment_id,
      booking_id: payment.booking_id,
      amount: input.amount,
      currency: payment.currency,
      status: "PENDING",
      reason: input.reason || null,
    }).select("*").single();
    if (refundError) throw refundError;
    return NextResponse.json({
      ...data,
      ticket_type: booking?.ticket_type || "unconfirmed",
      cancellation,
      customer_message:
        booking?.ticket_type === "nonrefundable"
          ? "This request requires review. Nonrefundable tickets typically do not qualify for refunds, though airline changes or credits may apply."
          : "This request requires review. Any refund depends on airline rules, timing, penalties, provider conditions, and operational charges.",
    }, { status: 201 });
  } catch (error) {
    return error instanceof z.ZodError ? bad(error) : failure(error);
  }
}
