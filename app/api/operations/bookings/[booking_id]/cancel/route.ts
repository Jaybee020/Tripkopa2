import { NextResponse } from "next/server";
import { z } from "zod";
import { BookingCancellationInput } from "@/lib/api-contracts";
import { requireOperationsStaff } from "@/lib/auth/operations";
import { supabase as serviceSupabase } from "@/lib/services/supabase";
import { bad, failure } from "@/lib/api-utils";
import { calculateCancellationPricing } from "@/lib/cancellation-pricing";
import {
  isTrustTier,
  loadFinancingRules,
  type TrustTier,
} from "@/lib/financing-rules";
import type { RouteCategory } from "@/lib/airport-regions";

const ROUTE_CATEGORIES = new Set<RouteCategory>([
  "domestic",
  "regional",
  "international",
]);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ booking_id: string }> },
) {
  try {
    const input = BookingCancellationInput.parse(await request.json());
    const { user } = await requireOperationsStaff();
    const { booking_id } = await params;

    const { data: booking, error: bookingError } = await serviceSupabase.admin
      .from("bookings")
      .select("*")
      .eq("id", booking_id)
      .maybeSingle();
    if (bookingError) throw bookingError;
    if (!booking) return NextResponse.json({ error: "Booking not found" }, { status: 404 });

    const routeCategory = booking.route_category as RouteCategory;
    if (!ROUTE_CATEGORIES.has(routeCategory)) {
      return NextResponse.json(
        { error: "Booking route category must be confirmed before cancellation" },
        { status: 409 },
      );
    }
    const trustTier: TrustTier = isTrustTier(booking.trust_tier_at_booking)
      ? booking.trust_tier_at_booking
      : "OBSERVER";
    const rules = await loadFinancingRules(serviceSupabase.admin);
    const cancellation = calculateCancellationPricing({
      totalAmount: Number(booking.total_amount),
      amountPaid: Number(booking.amount_paid),
      routeCategory,
      trustTier,
      ticketType: booking.ticket_type,
      rules,
    });

    const { data, error } = await serviceSupabase.admin
      .from("bookings")
      .update({
        status: "CANCELLATION_PENDING",
        cancellation_requested_at: new Date().toISOString(),
        cancellation_reason: input.reason,
        cancellation_platform_fee_rate: cancellation.platform_fee_rate,
        cancellation_platform_fee_amount: cancellation.platform_fee_amount,
        cancellation_airline_penalty_amount: null,
        cancellation_estimated_refund: cancellation.estimated_refund_before_airline_penalties,
      })
      .eq("id", booking_id)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "Booking not found" }, { status: 404 });

    await serviceSupabase.admin.from("operation_audit_events").insert({
      staff_user_id: user.id,
      action: "booking.cancel_requested",
      target_type: "booking",
      target_id: booking_id,
      payload: { reason: input.reason, cancellation, rule_version: rules.rule_version },
    });

    return NextResponse.json({ ...data, cancellation });
  } catch (error) {
    return error instanceof z.ZodError ? bad(error) : failure(error);
  }
}
