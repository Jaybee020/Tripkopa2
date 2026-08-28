import { NextResponse } from "next/server";
import { z } from "zod";
import { QuoteCreateInput } from "@/lib/api-contracts";
import { requireAgentCustomer } from "@/lib/auth/agent";
import { bad, customerErrorMessage, failure } from "@/lib/api-utils";
import { addDays, isoDate } from "@/lib/flexible-payments";
import { prepareQuote } from "@/lib/quote-preparation";

const BUSINESS_STATUSES = new Set([400, 404, 409, 422]);
const ISSUE_KEYS = [
  "code",
  "route_category",
  "maximum_weeks",
  "maximum_installments",
  "maximum_percentage",
  "maximum_amount",
  "financing_cap",
  "total_amount",
  "required_amount",
  "scheduled_amount",
  "requested_installments",
  "days_until_departure",
  "minimum_days_before_departure",
  "earliest_eligible_departure_date",
  "repayment_deadline",
] as const;

function issueFrom(error: unknown) {
  const value = error as Record<string, unknown> & { message?: string };
  const issue = Object.fromEntries(
    ISSUE_KEYS
      .filter((key) => value?.[key] !== undefined)
      .map((key) => [key, value[key]]),
  );
  if (value?.code === "FINANCING_WINDOW_EXCEEDED") {
    const weeks = Number(value.maximum_weeks);
    if (Number.isFinite(weeks) && weeks > 0) {
      issue.latest_eligible_departure_date = isoDate(addDays(new Date(), weeks * 7));
    }
  }
  return {
    message: customerErrorMessage(error),
    ...issue,
  };
}

export async function POST(request: Request) {
  try {
    const input = QuoteCreateInput.parse(await request.json());
    const { customer, supabase } = await requireAgentCustomer(request);
    const prepared = await prepareQuote({
      supabase,
      customerId: customer.id,
      quote: input,
    });
    return NextResponse.json({
      valid: true,
      status: "READY",
      search_id: prepared.search.id,
      offer_index: prepared.selectedOfferIndex >= 0
        ? prepared.selectedOfferIndex
        : input.offer_index ?? 0,
      route_category: prepared.pricing.route_category,
      departure_date: prepared.selectedSearchScope.departure_date,
      currency: prepared.currency,
      pricing: prepared.pricing,
      rule_version: prepared.rules.rule_version,
    });
  } catch (error) {
    if (error instanceof z.ZodError) return bad(error);
    const status = Number((error as { status?: unknown })?.status || 500);
    if (BUSINESS_STATUSES.has(status)) {
      return NextResponse.json({
        valid: false,
        status: "ADJUSTMENT_REQUIRED",
        issue: issueFrom(error),
      });
    }
    return failure(error);
  }
}
