import type { QuotePricing, RepaymentPlan } from "./flexible-payments";

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

/**
 * Pricing fields safe for a customer or customer-facing agent. Internal rates,
 * caps, rule snapshots and behavioral calculations deliberately stay omitted.
 */
export function toCustomerPricing(pricing: QuotePricing) {
  const plan = pricing.repayment_plan;
  if (!plan) return { total_amount: pricing.total_amount };
  return {
    total_amount: pricing.total_amount,
    deposit_amount: pricing.deposit_amount,
    installment_amount: pricing.installment_amount,
    route_category: pricing.route_category,
    trust_tier: pricing.trust_tier,
    repayment_plan: toCustomerRepaymentPlan(plan),
  };
}

/** Persist only what booking creation/revalidation needs in the customer-owned
 * quote document. The authoritative internal rule version stays in columns and
 * the protected admin configuration tables. */
export function toStoredQuotePricing(pricing: QuotePricing) {
  const plan = pricing.repayment_plan;
  return {
    total_amount: pricing.total_amount,
    deposit_amount: pricing.deposit_amount,
    installment_amount: pricing.installment_amount,
    route_category: pricing.route_category,
    trust_tier: pricing.trust_tier,
    repayment_plan: plan ? {
      ...toCustomerRepaymentPlan(plan),
      request_snapshot: plan.request_snapshot,
    } : null,
  };
}

function toCustomerRepaymentPlan(plan: RepaymentPlan) {
  return {
    deposit_amount: plan.deposit_amount,
    installments: plan.installments.map((installment) => ({
      sequence_number: installment.sequence_number,
      due_date: installment.due_date,
      amount: installment.amount,
      phase: installment.phase,
    })),
    repayment_deadline: plan.repayment_deadline,
    grace_deadline: plan.grace_deadline,
    post_travel_amount: plan.post_travel_amount,
    post_travel_deadline: plan.post_travel_deadline,
    plan_mode: plan.plan_mode,
    frequency: plan.frequency,
  };
}

export function toCustomerQuote(quote: JsonRecord) {
  const details = record(quote.details);
  const pricing = record(details?.pricing) as QuotePricing | null;
  const search = record(details?.search);
  const fareRules = record(details?.fare_rules);

  return {
    id: quote.id,
    search_id: quote.search_id,
    status: quote.status,
    currency: quote.currency,
    total_amount: quote.total_amount,
    deposit_amount: quote.deposit_amount ?? null,
    installment_amount: quote.installment_amount ?? null,
    version: quote.version,
    expires_at: quote.expires_at,
    booking_type: details?.booking_type ?? null,
    route_category: quote.route_category ?? pricing?.route_category ?? null,
    trust_tier: quote.trust_tier ?? pricing?.trust_tier ?? null,
    pricing: pricing ? toCustomerPricing(pricing) : null,
    search: search ? {
      origin: search.origin ?? null,
      destination: search.destination ?? null,
      departure_date: search.departure_date ?? null,
      return_date: search.return_date ?? null,
      trip_type: search.trip_type ?? null,
    } : null,
    fare_rules: fareRules ? {
      ticket_type: fareRules.ticket_type ?? "unconfirmed",
      confirmed: fareRules.confirmed ?? false,
      summary: fareRules.summary ?? null,
    } : null,
  };
}
