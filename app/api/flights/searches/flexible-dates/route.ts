import { NextResponse } from "next/server";
import { z } from "zod";
import { FlexibleDateFlightSearchInput } from "@/lib/api-contracts";
import { requireAgentCustomer } from "@/lib/auth/agent";
import {
  buildDateCombinations,
  explainableSearchResponse,
  rankFlexibleOffers,
  travellerSummary,
} from "@/lib/flight-search-scope";
import { bad, failure } from "@/lib/api-utils";
import { taketrips } from "@/lib/services/taketrips";
import { filterSearchResultsByTicketType } from "@/lib/ticket-rules";
import { assertFlightRouteAvailable } from "@/lib/airport-regions";

const SEARCH_CONCURRENCY = 5;
const MAX_SEARCH_REQUESTS = 225;
export const maxDuration = 300;

type SearchTask = {
  origin: string;
  destination: string;
  departure_date: string;
  return_date: string | null;
};

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  operation: (value: T) => Promise<R>,
) {
  const results: PromiseSettledResult<R>[] = new Array(values.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      try {
        results[index] = { status: "fulfilled", value: await operation(values[index]) };
      } catch (reason) {
        results[index] = { status: "rejected", reason };
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, () => worker()),
  );
  return results;
}

export async function POST(request: Request) {
  try {
    const input = FlexibleDateFlightSearchInput.parse(await request.json());
    const { customer, supabase } = await requireAgentCustomer(request);
    for (const origin of input.origin_codes) {
      assertFlightRouteAvailable(origin, input.destination);
    }
    const dateCombinations = buildDateCombinations(input);
    const tasks: SearchTask[] = dateCombinations.flatMap((combination) => (
      input.origin_codes.map((origin) => ({
        origin,
        destination: input.destination,
        ...combination,
      }))
    ));
    if (tasks.length > MAX_SEARCH_REQUESTS) {
      throw Object.assign(
        new Error("Flexible search scope exceeds 225 provider requests; reduce the date window or origin codes"),
        { status: 400, code: "FLEXIBLE_SEARCH_SCOPE_TOO_LARGE" },
      );
    }
    const settled = await mapWithConcurrency(tasks, SEARCH_CONCURRENCY, async (task) => {
      const provider = await taketrips.search({
        from: task.origin,
        to: task.destination,
        departureDate: task.departure_date,
        returnDate: task.return_date ?? undefined,
        direct: input.direct,
        adult: input.adult_count,
        children: input.children_count,
        infant: input.infant_count,
        cabinClass: input.cabin_class,
        allProviders: input.all_providers,
      });
      return {
        ...task,
        direct: input.direct,
        provider_result: filterSearchResultsByTicketType(provider, input.ticket_type),
      };
    });
    const completedSearches = settled.flatMap((result) => (
      result.status === "fulfilled" ? [result.value] : []
    ));
    const completedKeys = new Set(completedSearches.map((search) => (
      `${search.departure_date}|${search.return_date}|${search.origin}`
    )));
    const fullyCompletedCombinations = dateCombinations.filter((combination) => (
      input.origin_codes.every((origin) => completedKeys.has(
        `${combination.departure_date}|${combination.return_date}|${origin}`,
      ))
    ));
    const isComplete = completedSearches.length === tasks.length;
    const ranked = rankFlexibleOffers(completedSearches);
    const requestedScope = {
      origin_codes: input.origin_codes,
      destination: input.destination,
      departure_date: input.departure_date,
      return_date: input.return_date,
      window_days: input.window_days,
      preserve_trip_length: input.preserve_trip_length,
      direct: input.direct,
      adult_count: input.adult_count,
      children_count: input.children_count,
      infant_count: input.infant_count,
      cabin_class: input.cabin_class,
      ticket_type: input.ticket_type,
    };
    const completedScope = {
      origin_codes: input.origin_codes.filter((origin) => (
        completedSearches.some((search) => search.origin === origin)
      )),
      destination: input.destination,
      date_combinations: fullyCompletedCombinations,
      direct: input.direct,
      search_requests_completed: completedSearches.length,
      search_requests_requested: tasks.length,
    };
    const searchMetadata = {
      requested_scope: requestedScope,
      completed_scope: completedScope,
      price_scope: "party_total" as const,
      traveller_summary: travellerSummary(input),
      date_combinations_searched: fullyCompletedCombinations.length,
      is_complete: isComplete,
    };
    const results = {
      status: completedSearches.length > 0,
      search_status: isComplete ? "COMPLETED" : "PARTIAL",
      details: ranked.offers,
      offer_metadata: ranked.offer_metadata,
      search_metadata: searchMetadata,
    };
    const passengerCount = input.adult_count + input.children_count + input.infant_count;
    const { data, error } = await supabase
      .from("flight_searches")
      .insert({
        customer_id: customer.id,
        origin: input.origin_codes[0],
        destination: input.destination,
        departure_date: input.departure_date,
        return_date: input.return_date,
        trip_type: input.return_date ? "return" : "one_way",
        passenger_count: passengerCount,
        adult_count: input.adult_count,
        children_count: input.children_count,
        infant_count: input.infant_count,
        cabin_class: input.cabin_class,
        direct: input.direct,
        all_providers: input.all_providers,
        ticket_type: input.ticket_type,
        status: isComplete ? "COMPLETED" : "PARTIAL",
        results,
      })
      .select("*")
      .single();
    if (error) throw error;
    return NextResponse.json(
      explainableSearchResponse(data as Record<string, unknown>, searchMetadata),
      { status: 201 },
    );
  } catch (error) {
    return error instanceof z.ZodError ? bad(error) : failure(error);
  }
}
