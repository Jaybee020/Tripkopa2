import { extractOfferCurrency, listOffers } from "@/lib/flexible-payments";
import {
  itineraryEndpoints,
  itineraryFingerprint,
  itineraryIsDirect,
} from "@/lib/itinerary-match";

export type DateCombination = {
  departure_date: string;
  return_date: string;
};

export type OfferSearchMetadata = DateCombination & {
  offer_index: number;
  origin: string;
  destination: string;
  searched_origin_code: string;
  searched_destination_code: string;
  searched_departure_date: string;
  searched_return_date: string;
  trip_type: "return";
  direct: boolean;
  ngn_total: number;
  currency: "NGN";
  price_scope: "party_total";
};

type SearchMetadata = {
  requested_scope: Record<string, unknown>;
  completed_scope: Record<string, unknown>;
  price_scope: "party_total";
  traveller_summary: string;
  date_combinations_searched: number;
  is_complete: boolean;
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function atPath(value: unknown, path: string[]) {
  let current = value;
  for (const key of path) {
    const object = record(current);
    if (!object) return undefined;
    current = object[key];
  }
  return current;
}

function positiveNumber(value: unknown) {
  const amount = typeof value === "string" && value.trim()
    ? Number(value.replace(/,/g, ""))
    : Number(value);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function currencyCode(value: unknown) {
  return typeof value === "string" && value.trim().length === 3
    ? value.trim().toUpperCase()
    : null;
}

/**
 * Extract only a complete party fare that can be proved to be NGN from the
 * provider payload. Component prices such as `price.base` are deliberately
 * excluded.
 */
export function extractCompleteNgnFare(offer: unknown): number | null {
  const price = record(atPath(offer, ["price"]))
    ?? record(atPath(offer, ["details", "price"]));
  const offerObject = record(offer);
  if (!price || !offerObject) return null;

  const conversion = record(price.conversion);
  const rates = record(conversion?.rates);
  const sourceCurrency = currencyCode(
    price.currency ?? offerObject.currency ?? extractOfferCurrency(offer, ""),
  );
  const conversionTargetsNgn = currencyCode(conversion?.to) === "NGN"
    || currencyCode(rates?.BASE) === "NGN";

  const flexiTotal = positiveNumber(price.flexiTotal);
  if (flexiTotal && (sourceCurrency === "NGN" || conversionTargetsNgn)) {
    return Number(flexiTotal.toFixed(2));
  }

  const convertedPrice = positiveNumber(conversion?.convertedPrice);
  if (convertedPrice && conversionTargetsNgn) {
    return Number(convertedPrice.toFixed(2));
  }

  const completeSourceAmount = positiveNumber(price.grandTotal)
    ?? positiveNumber(price.total)
    ?? positiveNumber(offerObject.total);
  if (!completeSourceAmount) return null;
  if (sourceCurrency === "NGN") return Number(completeSourceAmount.toFixed(2));

  const conversionRate = sourceCurrency
    ? positiveNumber(rates?.[sourceCurrency])
    : null;
  if (!conversionTargetsNgn || !conversionRate) return null;
  return Number((completeSourceAmount * conversionRate).toFixed(2));
}

function addUtcDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function buildDateCombinations(input: {
  departure_date: string;
  return_date: string;
  window_days: number;
  preserve_trip_length: boolean;
}): DateCombination[] {
  const offsets = Array.from(
    { length: input.window_days * 2 + 1 },
    (_, index) => index - input.window_days,
  );
  if (input.preserve_trip_length) {
    return offsets.map((offset) => ({
      departure_date: addUtcDays(input.departure_date, offset),
      return_date: addUtcDays(input.return_date, offset),
    }));
  }

  return offsets.flatMap((departureOffset) => offsets.map((returnOffset) => ({
    departure_date: addUtcDays(input.departure_date, departureOffset),
    return_date: addUtcDays(input.return_date, returnOffset),
  }))).filter((combination) => combination.return_date > combination.departure_date);
}

export function travellerSummary(input: {
  adult_count: number;
  children_count: number;
  infant_count?: number;
}) {
  const groups = [
    `${input.adult_count} ${input.adult_count === 1 ? "adult" : "adults"}`,
    input.children_count
      ? `${input.children_count} ${input.children_count === 1 ? "child" : "children"}`
      : null,
    input.infant_count
      ? `${input.infant_count} ${input.infant_count === 1 ? "infant" : "infants"}`
      : null,
  ].filter((value): value is string => Boolean(value));
  if (groups.length === 1) return groups[0];
  return `${groups.slice(0, -1).join(", ")} and ${groups.at(-1)}`;
}

function deduplicationKey(
  offer: unknown,
  scope: Omit<OfferSearchMetadata, "offer_index" | "ngn_total" | "currency" | "price_scope">,
) {
  return itineraryFingerprint(offer)
    ?? JSON.stringify({
      id: record(offer)?.id ?? null,
      origin: scope.origin,
      destination: scope.destination,
      departure_date: scope.departure_date,
      return_date: scope.return_date,
    });
}

export function rankFlexibleOffers(searches: Array<{
  origin: string;
  destination: string;
  departure_date: string;
  return_date: string;
  direct: boolean;
  provider_result: Record<string, unknown>;
}>, limit = 5) {
  const cheapestByFlight = new Map<string, {
    offer: unknown;
    ngn_total: number;
    scope: Omit<OfferSearchMetadata, "offer_index" | "ngn_total" | "currency" | "price_scope">;
  }>();

  for (const search of searches) {
    for (const offer of listOffers(search.provider_result)) {
      const ngnTotal = extractCompleteNgnFare(offer);
      if (!ngnTotal) continue;
      const endpoints = itineraryEndpoints(offer);
      const scope = {
        origin: endpoints?.origin ?? search.origin,
        destination: endpoints?.destination ?? search.destination,
        searched_origin_code: search.origin,
        searched_destination_code: search.destination,
        departure_date: endpoints?.departure_date ?? search.departure_date,
        return_date: endpoints?.return_date ?? search.return_date,
        searched_departure_date: search.departure_date,
        searched_return_date: search.return_date,
        trip_type: "return" as const,
        direct: itineraryIsDirect(offer) ?? search.direct,
      };
      const key = deduplicationKey(offer, scope);
      const existing = cheapestByFlight.get(key);
      if (!existing || ngnTotal < existing.ngn_total) {
        cheapestByFlight.set(key, { offer, ngn_total: ngnTotal, scope });
      }
    }
  }

  const ranked = [...cheapestByFlight.values()]
    .sort((left, right) => left.ngn_total - right.ngn_total)
    .slice(0, limit);
  return {
    offers: ranked.map((item) => item.offer),
    offer_metadata: ranked.map((item, offerIndex): OfferSearchMetadata => ({
      offer_index: offerIndex,
      ...item.scope,
      ngn_total: item.ngn_total,
      currency: "NGN",
      price_scope: "party_total",
    })),
  };
}

export function searchMetadataFromResults(results: unknown): SearchMetadata | null {
  const object = record(results);
  const metadata = record(object?.search_metadata);
  if (!metadata) return null;
  if (!record(metadata.requested_scope) || !record(metadata.completed_scope)) return null;
  if (metadata.price_scope !== "party_total") return null;
  if (typeof metadata.traveller_summary !== "string") return null;
  if (typeof metadata.date_combinations_searched !== "number") return null;
  if (typeof metadata.is_complete !== "boolean") return null;
  return metadata as SearchMetadata;
}

export function offerSearchMetadata(results: unknown, offerIndex: number) {
  const object = record(results);
  if (!Array.isArray(object?.offer_metadata)) return null;
  const metadata = record(object.offer_metadata[offerIndex]);
  if (!metadata) return null;
  const origin = typeof metadata.origin === "string" ? metadata.origin : null;
  const destination = typeof metadata.destination === "string"
    ? metadata.destination
    : null;
  const departureDate = typeof metadata.departure_date === "string"
    ? metadata.departure_date
    : null;
  const returnDate = typeof metadata.return_date === "string"
    ? metadata.return_date
    : null;
  const ngnTotal = positiveNumber(metadata.ngn_total);
  if (!origin || !destination || !departureDate || !returnDate) return null;
  return {
    origin,
    destination,
    departure_date: departureDate,
    return_date: returnDate,
    ngn_total: ngnTotal,
  };
}

export function explainableSearchResponse(
  storedSearch: Record<string, unknown>,
  metadata: SearchMetadata | null = searchMetadataFromResults(storedSearch.results),
) {
  return metadata ? { ...storedSearch, ...metadata } : storedSearch;
}
