import { NextResponse } from "next/server";
import { requireOperationsStaff } from "@/lib/auth/operations";
import { supabase as serviceSupabase } from "@/lib/services/supabase";
import { failure } from "@/lib/api-utils";

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

    const [
      payments,
      installments,
      ledger,
      itinerary,
      customer,
      audit,
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
        .select("id,whatsapp_number,status,first_name,last_name,email")
        .eq("id", booking.customer_id)
        .maybeSingle(),
      serviceSupabase.admin
        .from("operation_audit_events")
        .select("*")
        .eq("target_type", "booking")
        .eq("target_id", booking_id)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    for (const result of [payments, installments, ledger, itinerary, customer, audit]) {
      if (result.error) throw result.error;
    }

    return NextResponse.json({
      booking,
      customer: customer.data,
      payments: payments.data || [],
      installments: installments.data || [],
      ledger_entries: ledger.data || [],
      itinerary: itinerary.data,
      audit_events: audit.data || [],
    });
  } catch (error) {
    return failure(error);
  }
}
