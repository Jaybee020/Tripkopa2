import { NextResponse } from "next/server";
import { z } from "zod";
import { FlightSearchInput } from "@/lib/api-contracts";
import { requireAgentCustomer } from "@/lib/auth/agent";
import { taketrips } from "@/lib/services/taketrips";
import { filterSearchResultsByTicketType } from "@/lib/ticket-rules";
import { bad, failure } from "@/lib/api-utils";

export async function POST(request: Request) {
  try {
    const input = FlightSearchInput.parse(await request.json());
    const { customer, supabase } = await requireAgentCustomer(request);
    const passengerCount =
      input.adult_count + input.children_count + input.infant_count;
    const provider = await taketrips.search({
      from: input.origin,
      to: input.destination,
      departureDate: input.departure_date,
      returnDate: input.return_date ?? "",
      direct: input.direct,
      adult: input.adult_count,
      children: input.children_count,
      infant: input.infant_count,
      cabinClass: input.cabin_class,
      allProviders: input.all_providers,
    });
    const results = filterSearchResultsByTicketType(provider, input.ticket_type);
    const { data, error } = await supabase
      .from("flight_searches")
      .insert({
        customer_id: customer.id,
        origin: input.origin,
        destination: input.destination,
        departure_date: input.departure_date,
        return_date: input.return_date || null,
        trip_type: input.trip_type,
        passenger_count: passengerCount,
        cabin_class: input.cabin_class,
        ticket_type: input.ticket_type,
        status: "COMPLETED",
        results,
      })
      .select("*")
      .single();
    if (error) throw error;
    return NextResponse.json(data, { status: 201 });
  } catch (e) {
    return e instanceof z.ZodError ? bad(e) : failure(e);
  }
}
