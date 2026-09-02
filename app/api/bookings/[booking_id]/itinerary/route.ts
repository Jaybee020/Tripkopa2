import { NextResponse } from "next/server";
import { requireAgentCustomer } from "@/lib/auth/agent";
import { failure } from "@/lib/api-utils";
import { loadFinancingRules } from "@/lib/financing-rules";
import { evaluateRepaymentLifecycle } from "@/lib/trust-financing";
import {
  buildPartialItinerary,
  type CustomerBookingRow,
} from "@/lib/itinerary-delivery";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ booking_id: string }> },
) {
  try {
    const { booking_id } = await params;
    const { customer, supabase } = await requireAgentCustomer(request);
    const rules = await loadFinancingRules(supabase);
    await evaluateRepaymentLifecycle(supabase, customer.id, rules, booking_id);
    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select("id,customer_id,quote_id,booking_type,status,currency,total_amount,deposit_amount,amount_paid,balance_amount,passengers,flight_details,ticket_type,departure_date,travel_completion_date,repayment_deadline")
      .eq("id", booking_id)
      .eq("customer_id", customer.id)
      .single();
    if (bookingError) throw bookingError;

    const typedBooking = booking as CustomerBookingRow;
    const { data: itinerary, error: itineraryError } = await supabase
      .from("itineraries")
      .select("booking_id,release_level,segments,ticket_reference,provider_ticket_reference")
      .eq("booking_id", booking_id)
      .eq("customer_id", customer.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (itineraryError) throw itineraryError;
    if (!itinerary) {
      return NextResponse.json({ error: "Itinerary is not available yet" }, { status: 404 });
    }
    if (itinerary.release_level !== "FULL") {
      return NextResponse.json(buildPartialItinerary(typedBooking));
    }

    const storedSegments = itinerary.segments && typeof itinerary.segments === "object"
      ? itinerary.segments as Record<string, unknown>
      : {};
    return NextResponse.json({
      booking_id: itinerary.booking_id,
      release_level: "FULL",
      segments: storedSegments.flight ?? storedSegments,
      ticket_reference: itinerary.ticket_reference ?? itinerary.provider_ticket_reference,
    });
  } catch (error) {
    return failure(error);
  }
}
