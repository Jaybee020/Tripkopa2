import type { SupabaseClient } from "@supabase/supabase-js";
import {
  extractOfferAmount,
  extractOfferCurrency,
  listOffers,
  priceQuote,
  type RepaymentPlanRequest,
} from "@/lib/flexible-payments";
import { loadFinancingRules } from "@/lib/financing-rules";
import { findEquivalentOffer } from "@/lib/itinerary-match";
import { taketrips } from "@/lib/services/taketrips";
import { filterSearchResultsByTicketType, normalizeFareRules } from "@/lib/ticket-rules";
import { refreshCustomerTrustTier } from "@/lib/trust-financing";
import { toCustomerQuote, toStoredQuotePricing } from "@/lib/customer-pricing";

type QuoteRow = Record<string, unknown> & {
  id: string;
  customer_id: string;
  search_id: string;
  provider: string;
  currency: string;
  base_amount: number | string;
  total_amount: number | string;
  deposit_amount: number | string | null;
  version: number;
  details: unknown;
  superseded_by_quote_id?: string | null;
};

type SearchRow = Record<string, unknown> & {
  id: string;
  customer_id: string;
  origin: string;
  destination: string;
  departure_date: string;
  return_date: string | null;
  trip_type: string;
  passenger_count: number;
  cabin_class: string;
  ticket_type?: "refundable" | "nonrefundable" | "any";
  adult_count?: number;
  children_count?: number;
  infant_count?: number;
  direct?: boolean;
  all_providers?: boolean;
};

type QuoteDetails = {
  offer?: unknown;
  search?: {
    origin?: string;
    destination?: string;
    departure_date?: string;
    return_date?: string | null;
  };
  booking_type?: "full" | "flexible";
  pricing?: {
    repayment_plan?: {
      request_snapshot?: RepaymentPlanRequest;
      installments?: unknown[];
    } | null;
  };
  fare_rules?: { ticket_type?: string };
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function numeric(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? Number(number.toFixed(2)) : null;
}

function materiallyDifferent(left: unknown, right: unknown) {
  return JSON.stringify(left ?? null) !== JSON.stringify(right ?? null);
}

async function previousReplacement(supabase: SupabaseClient, customerId: string, quoteId: string) {
  const { data, error } = await supabase
    .from("quotes")
    .select("*")
    .eq("customer_id", customerId)
    .eq("supersedes_quote_id", quoteId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

function recoveredResponse(previousQuoteId: string, quote: Record<string, unknown>) {
  const details = record(quote.details);
  const recovery = record(details?.recovery);
  return {
    status: "RECOVERED",
    recovery_reason: "PROVIDER_QUOTE_EXPIRED",
    previous_quote_id: previousQuoteId,
    search_id: quote.search_id,
    quote: toCustomerQuote(quote),
    changes: recovery?.changes ?? {
      price_changed: true,
      deposit_changed: true,
      schedule_changed: true,
      itinerary_changed: false,
      ticket_rules_changed: false,
      requires_customer_acceptance: true,
    },
  };
}

async function markRecoveryAttempt(
  supabase: SupabaseClient,
  quoteId: string,
  customerId: string,
  values: Record<string, unknown>,
) {
  const { error } = await supabase
    .from("quotes")
    .update({ recovery_attempted_at: new Date().toISOString(), ...values })
    .eq("id", quoteId)
    .eq("customer_id", customerId);
  if (error) throw error;
}

export async function recoverProviderQuote(input: {
  supabase: SupabaseClient;
  customerId: string;
  quote: QuoteRow;
  providerError: string;
}) {
  const { supabase, customerId, quote, providerError } = input;
  const existingReplacement = await previousReplacement(supabase, customerId, quote.id);
  if (existingReplacement) return recoveredResponse(quote.id, existingReplacement);

  const { data: storedSearch, error: searchError } = await supabase
    .from("flight_searches")
    .select("*")
    .eq("id", quote.search_id)
    .eq("customer_id", customerId)
    .single();
  if (searchError) throw searchError;
  const search = storedSearch as SearchRow;
  const details = (record(quote.details) || {}) as QuoteDetails;
  const selectedScope = {
    origin: details.search?.origin || search.origin,
    destination: details.search?.destination || search.destination,
    departure_date: details.search?.departure_date || search.departure_date,
    return_date: details.search?.return_date ?? search.return_date,
  };
  const adultCount = search.adult_count || Math.max(search.passenger_count || 1, 1);
  const childrenCount = search.children_count || 0;
  const infantCount = search.infant_count || 0;
  const direct = search.direct || false;
  const allProviders = search.all_providers ?? true;
  const ticketType = search.ticket_type || "any";

  const providerResults = await taketrips.search({
    from: selectedScope.origin,
    to: selectedScope.destination,
    departureDate: selectedScope.departure_date,
    returnDate: selectedScope.return_date ?? "",
    direct,
    adult: adultCount,
    children: childrenCount,
    infant: infantCount,
    cabinClass: search.cabin_class,
    allProviders,
  });
  const refreshedResults = filterSearchResultsByTicketType(providerResults, ticketType);
  const { data: newSearch, error: newSearchError } = await supabase
    .from("flight_searches")
    .insert({
      customer_id: customerId,
      origin: selectedScope.origin,
      destination: selectedScope.destination,
      departure_date: selectedScope.departure_date,
      return_date: selectedScope.return_date,
      trip_type: search.trip_type,
      passenger_count: adultCount + childrenCount + infantCount,
      adult_count: adultCount,
      children_count: childrenCount,
      infant_count: infantCount,
      cabin_class: search.cabin_class,
      direct,
      all_providers: allProviders,
      ticket_type: ticketType,
      status: "COMPLETED",
      results: refreshedResults,
    })
    .select("*")
    .single();
  if (newSearchError) throw newSearchError;

  const match = findEquivalentOffer(details.offer, listOffers(refreshedResults));
  if (!match) {
    await markRecoveryAttempt(supabase, quote.id, customerId, {
      status: "REPRICE_REQUIRED",
      recovery_reason: "ORIGINAL_FLIGHT_UNAVAILABLE",
    });
    await supabase.from("operational_events").insert({
      customer_id: customerId,
      event_type: "quote.recovery_alternatives_required",
      payload: { quote_id: quote.id, search_id: newSearch.id, provider_error: providerError },
    });
    return {
      status: "ALTERNATIVES_REQUIRED",
      recovery_reason: "ORIGINAL_FLIGHT_UNAVAILABLE",
      previous_quote_id: quote.id,
      search_id: newSearch.id,
      alternatives: refreshedResults,
      offer_count: listOffers(refreshedResults).length,
    };
  }

  let validatedOffer: Record<string, unknown>;
  try {
    validatedOffer = await taketrips.validate(match.offer);
  } catch (error) {
    await markRecoveryAttempt(supabase, quote.id, customerId, {
      status: "REPRICE_REQUIRED",
      recovery_reason: "MATCHED_OFFER_VALIDATION_FAILED",
    });
    return {
      status: "ALTERNATIVES_REQUIRED",
      recovery_reason: "MATCHED_OFFER_VALIDATION_FAILED",
      previous_quote_id: quote.id,
      search_id: newSearch.id,
      alternatives: refreshedResults,
      offer_count: listOffers(refreshedResults).length,
      provider_error: error instanceof Error ? error.message : String(error),
    };
  }

  const baseAmount = extractOfferAmount(validatedOffer) ?? extractOfferAmount(match.offer);
  if (!baseAmount) throw Object.assign(new Error("Recovered offer does not contain a valid price"), { status: 502 });
  const bookingType = details.booking_type === "flexible" ? "flexible" : "full";
  if (bookingType === "flexible") {
    const { data: kyc, error: kycError } = await supabase
      .from("kyc_sessions")
      .select("status")
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (kycError) throw kycError;
    if (kyc?.status !== "VERIFIED") {
      await markRecoveryAttempt(supabase, quote.id, customerId, {
        status: "REPRICE_REQUIRED",
        recovery_reason: "KYC_REQUIRED",
      });
      return {
        status: "KYC_REQUIRED",
        recovery_reason: "KYC_REQUIRED",
        previous_quote_id: quote.id,
        search_id: newSearch.id,
      };
    }
  }

  const rules = await loadFinancingRules(supabase);
  const trust = await refreshCustomerTrustTier(supabase, customerId);
  let pricing;
  try {
    pricing = priceQuote({
      origin: selectedScope.origin,
      destination: selectedScope.destination,
      departureDate: selectedScope.departure_date,
      travelCompletionDate: selectedScope.return_date || selectedScope.departure_date,
      baseAmount,
      currency: extractOfferCurrency(validatedOffer, quote.currency),
      bookingType,
      trustTier: trust.effective_tier,
      rules,
      repaymentPlanRequest: details.pricing?.repayment_plan?.request_snapshot,
      rescaleCustomPlan: true,
    });
  } catch (error) {
    await markRecoveryAttempt(supabase, quote.id, customerId, {
      status: "REPRICE_REQUIRED",
      recovery_reason: "REPAYMENT_PLAN_REQUIRED",
    });
    const failure = error as Record<string, unknown> & { message?: string };
    return {
      status: "REPAYMENT_PLAN_REQUIRED",
      recovery_reason: "REPAYMENT_PLAN_REQUIRED",
      previous_quote_id: quote.id,
      search_id: newSearch.id,
      matched_offer_index: match.offer_index,
      error: failure.message || "The repayment plan must be revised",
      code: failure.code,
      maximum_installments: failure.maximum_installments,
      financing_cap: failure.financing_cap,
      required_amount: failure.required_amount,
      scheduled_amount: failure.scheduled_amount,
    };
  }

  const fareRules = normalizeFareRules(validatedOffer);
  const previousInstallments = details.pricing?.repayment_plan?.installments ?? null;
  const nextInstallments = pricing.repayment_plan?.installments ?? null;
  const changes = {
    price_changed: numeric(quote.total_amount) !== numeric(pricing.total_amount),
    deposit_changed: numeric(quote.deposit_amount) !== numeric(pricing.deposit_amount),
    schedule_changed: materiallyDifferent(previousInstallments, nextInstallments),
    itinerary_changed: false,
    ticket_rules_changed: details.fare_rules?.ticket_type !== fareRules.ticket_type,
    requires_customer_acceptance: false,
  };
  changes.requires_customer_acceptance = changes.price_changed || changes.deposit_changed ||
    changes.schedule_changed || changes.ticket_rules_changed;

  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const replacementDetails = {
    offer: validatedOffer,
    search: {
      origin: selectedScope.origin,
      destination: selectedScope.destination,
      departure_date: selectedScope.departure_date,
      return_date: selectedScope.return_date,
      trip_type: search.trip_type,
      passenger_count: adultCount + childrenCount + infantCount,
      adult_count: adultCount,
      children_count: childrenCount,
      infant_count: infantCount,
      cabin_class: search.cabin_class,
      direct,
      all_providers: allProviders,
      ticket_type: ticketType,
    },
    booking_type: bookingType,
    pricing: toStoredQuotePricing(pricing),
    fare_rules: fareRules,
    customer_summary: pricing.repayment_plan
      ? {
          trust_tier: pricing.trust_tier,
          total_payable: pricing.total_amount,
          initial_deposit: pricing.deposit_amount,
          outstanding_balance: Number((pricing.total_amount - (pricing.deposit_amount || 0)).toFixed(2)),
          repayment_deadline: pricing.repayment_plan.repayment_deadline,
          post_travel_amount: pricing.repayment_plan.post_travel_amount,
        }
      : { total_payable: pricing.total_amount },
    recovery: {
      reason: "PROVIDER_QUOTE_EXPIRED",
      previous_quote_id: quote.id,
      original_search_id: search.id,
      refreshed_search_id: newSearch.id,
      match_type: "EXACT_ITINERARY",
      provider_error: providerError,
      changes,
    },
  };
  const { data: replacement, error: replacementError } = await supabase
    .from("quotes")
    .insert({
      customer_id: customerId,
      search_id: newSearch.id,
      provider: quote.provider,
      provider_reference: crypto.randomUUID(),
      currency: extractOfferCurrency(validatedOffer, quote.currency),
      base_amount: pricing.base_amount,
      total_amount: pricing.total_amount,
      deposit_amount: pricing.deposit_amount,
      installment_amount: pricing.installment_amount,
      rule_version: pricing.rule_version,
      route_category: pricing.route_category,
      trust_tier: pricing.trust_tier,
      repayment_deadline: pricing.repayment_plan?.repayment_deadline || null,
      version: 1,
      status: "ACTIVE",
      expires_at: expiresAt,
      details: replacementDetails,
      supersedes_quote_id: quote.id,
      recovery_reason: "PROVIDER_QUOTE_EXPIRED",
      recovery_attempted_at: new Date().toISOString(),
    })
    .select("*")
    .single();
  if (replacementError?.code === "23505") {
    const concurrent = await previousReplacement(supabase, customerId, quote.id);
    if (concurrent) return recoveredResponse(quote.id, concurrent);
  }
  if (replacementError) throw replacementError;

  await markRecoveryAttempt(supabase, quote.id, customerId, {
    status: "SUPERSEDED",
    superseded_by_quote_id: replacement.id,
    recovery_reason: "PROVIDER_QUOTE_EXPIRED",
  });
  await supabase.from("operational_events").insert({
    customer_id: customerId,
    event_type: "quote.recovered",
    payload: {
      previous_quote_id: quote.id,
      replacement_quote_id: replacement.id,
      refreshed_search_id: newSearch.id,
      changes,
    },
  });
  return recoveredResponse(quote.id, replacement);
}
