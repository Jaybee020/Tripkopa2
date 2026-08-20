import { NextResponse } from "next/server";
import { requireAgentCustomer } from "@/lib/auth/agent";
import { failure } from "@/lib/api-utils";
import { redactRestrictedItineraryFields } from "@/lib/itinerary-delivery";

export async function GET(request: Request) {
  try {
    const { customer, supabase } = await requireAgentCustomer(request);
    const { data, error } = await supabase
      .from("operational_events")
      .select("*")
      .eq("customer_id", customer.id)
      .order("created_at", { ascending: false });
    if (error) throw error;
    const events = (data || []).map((event) => ({
      ...event,
      payload: redactRestrictedItineraryFields(event.payload),
    }));
    return NextResponse.json({ events, total: events.length });
  } catch (error) {
    return failure(error);
  }
}
