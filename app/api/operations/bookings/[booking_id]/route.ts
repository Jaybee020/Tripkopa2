import { NextResponse } from "next/server";
import { requireOperationsStaff } from "@/lib/auth/operations";
import { supabase as serviceSupabase } from "@/lib/services/supabase";
import { failure } from "@/lib/api-utils";
import { loadFinancingRules } from "@/lib/financing-rules";
import { evaluateRepaymentLifecycle, refreshCustomerTrustTier } from "@/lib/trust-financing";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ booking_id: string }> },
) {
  try {
    await requireOperationsStaff();
    const { booking_id } = await params;

    const { data: booking, error: bookingError } = await serviceSupabase.admin
      .from("bookings")
      .select("*")
      .eq("id", booking_id)
      .maybeSingle();
    if (bookingError) throw bookingError;
    if (!booking) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    }
    const rules = await loadFinancingRules(serviceSupabase.admin);
    await evaluateRepaymentLifecycle(serviceSupabase.admin, booking.customer_id, rules, booking_id);
    const trust = await refreshCustomerTrustTier(serviceSupabase.admin, booking.customer_id);
    const { data: currentBooking, error: currentBookingError } = await serviceSupabase.admin
      .from("bookings")
      .select("*")
      .eq("id", booking_id)
      .single();
    if (currentBookingError) throw currentBookingError;

    const [
      payments,
      installments,
      ledger,
      itinerary,
      customer,
      audit,
      riskEvents,
      tierHistory,
    ] = await Promise.all([
      serviceSupabase.admin
        .from("payments")
        .select("*")
        .eq("booking_id", booking_id)
        .order("created_at", { ascending: false }),
      serviceSupabase.admin
        .from("installments")
        .select("*")
        .eq("booking_id", booking_id)
        .order("sequence_number", { ascending: true }),
      serviceSupabase.admin
        .from("ledger_entries")
        .select("*")
        .eq("booking_id", booking_id)
        .order("created_at", { ascending: false }),
      serviceSupabase.admin
        .from("itineraries")
        .select("*")
        .eq("booking_id", booking_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      serviceSupabase.admin
        .from("customers")
        .select("id,whatsapp_number,status,first_name,last_name,email,trust_tier,trust_tier_override,successful_cycles,on_time_repayment_rate,reminder_dependency_rate")
        .eq("id", booking.customer_id)
        .maybeSingle(),
      serviceSupabase.admin
        .from("operation_audit_events")
        .select("*")
        .eq("target_type", "booking")
        .eq("target_id", booking_id)
        .order("created_at", { ascending: false })
        .limit(20),
      serviceSupabase.admin
        .from("customer_risk_events")
        .select("*")
        .eq("customer_id", booking.customer_id)
        .order("created_at", { ascending: false })
        .limit(20),
      serviceSupabase.admin
        .from("trust_tier_history")
        .select("*")
        .eq("customer_id", booking.customer_id)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    for (const result of [payments, installments, ledger, itinerary, customer, audit, riskEvents, tierHistory]) {
      if (result.error) throw result.error;
    }

    return NextResponse.json({
      booking: currentBooking,
      customer: customer.data,
      payments: payments.data || [],
      installments: installments.data || [],
      ledger_entries: ledger.data || [],
      itinerary: itinerary.data,
      audit_events: audit.data || [],
      risk_events: riskEvents.data || [],
      trust_tier_history: tierHistory.data || [],
      financing_profile: trust,
    });
  } catch (error) {
    return failure(error);
  }
}
