import { NextResponse } from "next/server";
import { z } from "zod";
import { FlightSearchInput } from "@/lib/api-contracts";
import { requireAgentCustomer } from "@/lib/auth/agent";
import { taketrips } from "@/lib/services/taketrips";
import { filterSearchResultsByTicketType } from "@/lib/ticket-rules";
import {
  explainableSearchResponse,
  travellerSummary,
} from "@/lib/flight-search-scope";
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
    const filteredResults = filterSearchResultsByTicketType(provider, input.ticket_type);
    const requestedScope = {
      origin_codes: [input.origin.toUpperCase()],
      destination: input.destination.toUpperCase(),
      departure_date: input.departure_date,
      return_date: input.return_date,
      window_days: 0,
      preserve_trip_length: true,
      direct: input.direct,
      adult_count: input.adult_count,
      children_count: input.children_count,
      infant_count: input.infant_count,
      cabin_class: input.cabin_class,
      ticket_type: input.ticket_type,
    };
    const searchMetadata = {
      requested_scope: requestedScope,
      completed_scope: {
        ...requestedScope,
        date_combinations: [{
          departure_date: input.departure_date,
          return_date: input.return_date,
        }],
      },
      price_scope: "party_total" as const,
      traveller_summary: travellerSummary(input),
      date_combinations_searched: 1,
      is_complete: true,
    };
    const results = {
      ...filteredResults,
      search_metadata: searchMetadata,
    };
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
        adult_count: input.adult_count,
        children_count: input.children_count,
        infant_count: input.infant_count,
        cabin_class: input.cabin_class,
        direct: input.direct,
        all_providers: input.all_providers,
        ticket_type: input.ticket_type,
        status: "COMPLETED",
        results,
      })
      .select("*")
      .single();
    if (error) throw error;
    return NextResponse.json(
      explainableSearchResponse(data as Record<string, unknown>, searchMetadata),
      { status: 201 },
    );
  } catch (e) {
    return e instanceof z.ZodError ? bad(e) : failure(e);
  }
}
