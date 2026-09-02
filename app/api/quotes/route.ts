import { NextResponse } from "next/server";
import { z } from "zod";
import { QuoteCreateInput } from "@/lib/api-contracts";
import { requireAgentCustomer } from "@/lib/auth/agent";
import { bad, failure } from "@/lib/api-utils";
import { prepareQuote } from "@/lib/quote-preparation";
import { toCustomerQuote, toStoredQuotePricing } from "@/lib/customer-pricing";

export async function POST(request: Request) {
  try {
    const input = QuoteCreateInput.parse(await request.json());
    const { customer, supabase } = await requireAgentCustomer(request);
    const prepared = await prepareQuote({
      supabase,
      customerId: customer.id,
      quote: input,
    });
    const {
      search,
      offer,
      currency,
      selectedOfferId,
      selectedOfferIndex,
      selectedSearchScope,
      pricing,
      fareRules,
    } = prepared;
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from("quotes")
      .insert({
        customer_id: customer.id,
        search_id: search.id,
        provider: "taketrips",
        provider_reference: crypto.randomUUID(),
        currency,
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
        details: {
          offer,
          selected_offer_id: selectedOfferId,
          selected_offer_index: selectedOfferIndex >= 0
            ? selectedOfferIndex
            : input.offer_index ?? 0,
          search: {
            origin: selectedSearchScope.origin,
            destination: selectedSearchScope.destination,
            departure_date: selectedSearchScope.departure_date,
            return_date: selectedSearchScope.return_date,
            trip_type: search.trip_type,
            passenger_count: search.passenger_count,
            adult_count: search.adult_count,
            children_count: search.children_count,
            infant_count: search.infant_count,
            cabin_class: search.cabin_class,
            direct: search.direct,
            all_providers: search.all_providers,
            ticket_type: search.ticket_type,
          },
          booking_type: input.booking_type,
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
        },
      })
      .select("*")
      .single();
    if (error) throw error;

    return NextResponse.json(toCustomerQuote(data), { status: 201 });
  } catch (error) {
    return error instanceof z.ZodError ? bad(error) : failure(error);
  }
}
