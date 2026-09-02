import type { SupabaseClient } from "@supabase/supabase-js";
import type { QuoteCreateInput } from "@/lib/api-contracts";
import {
  extractOfferAmount,
  extractOfferCurrency,
  getOfferId,
  listOffers,
  priceQuote,
  selectOffer,
} from "@/lib/flexible-payments";
import { loadFinancingRules } from "@/lib/financing-rules";
import { refreshCustomerTrustTier } from "@/lib/trust-financing";
import { normalizeFareRules } from "@/lib/ticket-rules";
import { offerSearchMetadata } from "@/lib/flight-search-scope";
import { assertFlightRouteAvailable } from "@/lib/airport-regions";

export function resultShape(value: unknown) {
  if (Array.isArray(value)) return { type: "array", length: value.length };
  if (!value || typeof value !== "object") return { type: typeof value };
  const object = value as Record<string, unknown>;
  const keys = Object.keys(object).slice(0, 12);
  return {
    type: "object",
    keys,
    nested: Object.fromEntries(
      keys
        .filter((key) => object[key] && typeof object[key] === "object")
        .slice(0, 5)
        .map((key) => [
          key,
          Array.isArray(object[key])
            ? { type: "array", length: (object[key] as unknown[]).length }
            : {
                type: "object",
                keys: Object.keys(object[key] as Record<string, unknown>).slice(0, 8),
              },
        ]),
    ),
  };
}

export async function prepareQuote(input: {
  supabase: SupabaseClient;
  customerId: string;
  quote: QuoteCreateInput;
}) {
  const { supabase, customerId, quote } = input;
  const { data: search, error: searchError } = await supabase
    .from("flight_searches")
    .select("*")
    .eq("id", quote.search_id)
    .eq("customer_id", customerId)
    .single();
  if (searchError) throw searchError;

  if (quote.booking_type === "flexible") {
    const { data: kyc, error: kycError } = await supabase
      .from("kyc_sessions")
      .select("status")
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (kycError) throw kycError;
    if (kyc?.status !== "VERIFIED") {
      throw Object.assign(new Error("KYC verification is required for flexible payment"), {
        status: 409,
        code: "KYC_REQUIRED",
      });
    }
  }

  const offer = selectOffer(search.results, quote.offer_index, quote.offer);
  if (!offer) {
    throw Object.assign(new Error("Selected flight offer was not found"), {
      status: 404,
      code: "OFFER_NOT_FOUND",
      result_shape: resultShape(search.results),
    });
  }

  const selectedOfferId = getOfferId(offer);
  const selectedOfferIndex = quote.offer_index !== undefined && quote.offer === undefined
    ? quote.offer_index
    : listOffers(search.results).findIndex(
        (candidate) => getOfferId(candidate) === selectedOfferId,
      );
  const storedOfferIndex = selectedOfferIndex >= 0
    ? selectedOfferIndex
    : quote.offer_index ?? 0;
  const selectedSearchScope = offerSearchMetadata(search.results, storedOfferIndex) ?? {
    origin: search.origin,
    destination: search.destination,
    departure_date: search.departure_date,
    return_date: search.return_date,
    ngn_total: null,
  };
  assertFlightRouteAvailable(
    selectedSearchScope.origin,
    selectedSearchScope.destination,
  );
  const baseAmount =
    quote.base_amount ??
    selectedSearchScope.ngn_total ??
    extractOfferAmount(offer) ??
    extractOfferAmount(search.results);
  if (!baseAmount) {
    throw Object.assign(new Error("Unable to determine offer price; pass base_amount"), {
      status: 400,
      code: "OFFER_PRICE_REQUIRED",
      offer_shape: resultShape(offer),
      result_shape: resultShape(search.results),
    });
  }

  const currency = selectedSearchScope.ngn_total
    ? "NGN"
    : extractOfferCurrency(offer, quote.currency);
  const rules = await loadFinancingRules(supabase);
  // Snapshot the effective tier for both payment types because cancellation
  // deductions are tier-based even when the fare was paid in full.
  const trust = await refreshCustomerTrustTier(supabase, customerId);
  const pricing = priceQuote({
    origin: selectedSearchScope.origin,
    destination: selectedSearchScope.destination,
    departureDate: selectedSearchScope.departure_date,
    baseAmount,
    currency,
    bookingType: quote.booking_type,
    installmentCount: quote.installment_count,
    repaymentPlanRequest: quote.repayment_plan_request,
    travelCompletionDate: selectedSearchScope.return_date || selectedSearchScope.departure_date,
    trustTier: trust.effective_tier,
    rules,
  });

  return {
    search,
    offer,
    currency,
    selectedOfferId,
    selectedOfferIndex,
    selectedSearchScope,
    rules,
    pricing,
    fareRules: normalizeFareRules(offer),
  };
}
