import { NextResponse } from "next/server";
import { z } from "zod";
import { QuoteRevalidationInput } from "@/lib/api-contracts";
import { requireAgentCustomer } from "@/lib/auth/agent";
import { taketrips } from "@/lib/services/taketrips";
import { extractOfferAmount, extractOfferCurrency, priceQuote, type RepaymentPlanRequest } from "@/lib/flexible-payments";
import { loadFinancingRules } from "@/lib/financing-rules";
import { refreshCustomerTrustTier } from "@/lib/trust-financing";
import { normalizeFareRules } from "@/lib/ticket-rules";
import { bad, failure } from "@/lib/api-utils";

type QuoteDetails = {
  offer?: unknown;
  pricing?: {
    repayment_plan?: { request_snapshot?: RepaymentPlanRequest } | null;
  };
  search?: {
    origin?: string;
    destination?: string;
    departure_date?: string;
    return_date?: string | null;
  };
  booking_type?: string;
  revalidation_error?: {
    message: string;
    at: string;
  } | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function payloadMessage(value: unknown): string | null {
  if (!isRecord(value)) return null;
  const message = value.message ?? value.error;
  return typeof message === "string" && message.trim() ? message : null;
}

function providerFailureMessage(error: unknown) {
  if (isRecord(error)) {
    const originalMessage = payloadMessage(error.originalError);
    if (originalMessage) return originalMessage;
  }
  return error instanceof Error ? error.message : "TakeTrips validation failed";
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ quote_id: string }> },
) {
  try {
    const input = QuoteRevalidationInput.parse(await request.json());
    const { quote_id } = await params;
    const { customer, supabase } = await requireAgentCustomer(request);
    const { data: quote, error } = await supabase
      .from("quotes")
      .select("*")
      .eq("id", quote_id)
      .eq("customer_id", customer.id)
      .single();
    if (error) throw error;
    if (input.version && input.version !== quote.version) {
      return NextResponse.json(
        { error: "Quote version is stale", current_version: quote.version },
        { status: 409 },
      );
    }

    const details = (quote.details ?? {}) as QuoteDetails;
    let provider: Record<string, unknown>;
    try {
      provider = await taketrips.validate(details.offer ?? quote.details);
    } catch (providerError) {
      const message = providerFailureMessage(providerError);
      const nextDetails = {
        ...details,
        revalidation_error: {
          message,
          at: new Date().toISOString(),
        },
      };
      const { error: updateError } = await supabase
        .from("quotes")
        .update({
          details: nextDetails,
          status: "REPRICE_REQUIRED",
        })
        .eq("id", quote_id)
        .eq("customer_id", customer.id);
      if (updateError) throw updateError;

      return NextResponse.json(
        {
          error: "Quote could not be revalidated",
          status: "REPRICE_REQUIRED",
          provider_error: message,
        },
        { status: 409 },
      );
    }

    const baseAmount = extractOfferAmount(provider) ?? Number(quote.base_amount);
    const search = details.search;
    if (!search?.origin || !search.destination || !search.departure_date) {
      return NextResponse.json({ error: "Quote search details are incomplete" }, { status: 409 });
    }
    const bookingType = details.booking_type === "flexible" ? "flexible" : "full";
    const rules = await loadFinancingRules(supabase);
    const trust = bookingType === "flexible"
      ? await refreshCustomerTrustTier(supabase, customer.id)
      : null;
    let pricing;
    try {
      pricing = priceQuote({
        origin: search.origin,
        destination: search.destination,
        departureDate: search.departure_date,
        travelCompletionDate: search.return_date || search.departure_date,
        baseAmount,
        currency: extractOfferCurrency(provider, quote.currency),
        bookingType,
        trustTier: trust?.effective_tier,
        rules,
        repaymentPlanRequest: details.pricing?.repayment_plan?.request_snapshot,
        rescaleCustomPlan: true,
      });
    } catch (pricingError) {
      await supabase.from("quotes").update({ status: "REPRICE_REQUIRED" }).eq("id", quote_id);
      return NextResponse.json(
        { error: pricingError instanceof Error ? pricingError.message : "Repayment plan must be re-created", status: "REPRICE_REQUIRED" },
        { status: 409 },
      );
    }
    const nextDetails = {
      ...details,
      offer: provider,
      pricing,
      fare_rules: normalizeFareRules(provider),
      rules_snapshot: rules,
      revalidation_error: null,
      revalidated_at: new Date().toISOString(),
    };

    const { data, error: updateError } = await supabase
      .from("quotes")
      .update({
        details: nextDetails,
        currency: extractOfferCurrency(provider, quote.currency),
        base_amount: pricing.base_amount,
        total_amount: pricing.total_amount,
        deposit_amount: pricing.deposit_amount,
        installment_amount: pricing.installment_amount,
        rule_version: pricing.rule_version,
        route_category: pricing.route_category,
        trust_tier: pricing.trust_tier,
        repayment_deadline: pricing.repayment_plan?.repayment_deadline || null,
        status: "ACTIVE",
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        version: quote.version + 1,
      })
      .eq("id", quote_id)
      .eq("customer_id", customer.id)
      .select("*")
      .single();
    if (updateError) throw updateError;

    return NextResponse.json(data);
  } catch (error) {
    return error instanceof z.ZodError ? bad(error) : failure(error);
  }
}
