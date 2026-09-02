import type { RouteCategory } from "./airport-regions";
import type { FinancingRules, TrustTier } from "./financing-rules";

function money(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export type CancellationPricing = {
  platform_fee_rate: number;
  platform_fee_cap_rate: number;
  platform_fee_amount: number;
  airline_penalty_amount: null;
  estimated_refund_before_airline_penalties: number | null;
  refund_eligibility: "REVIEW_REQUIRED" | "TYPICALLY_INELIGIBLE";
};

export function calculateCancellationPricing(input: {
  totalAmount: number;
  amountPaid: number;
  routeCategory: RouteCategory;
  trustTier: TrustTier;
  ticketType: string | null | undefined;
  rules: FinancingRules;
}): CancellationPricing {
  const rate = Math.min(
    input.rules.cancellation_rates[input.trustTier][input.routeCategory],
    input.rules.cancellation_fee_caps[input.routeCategory],
  );
  const platformFee = money(Math.min(input.amountPaid, input.totalAmount * rate));
  const nonrefundable = input.ticketType === "nonrefundable";

  return {
    platform_fee_rate: rate,
    platform_fee_cap_rate: input.rules.cancellation_fee_caps[input.routeCategory],
    platform_fee_amount: platformFee,
    // Provider penalties are unknown until the airline/provider reviews the fare.
    airline_penalty_amount: null,
    estimated_refund_before_airline_penalties: nonrefundable
      ? null
      : money(Math.max(0, input.amountPaid - platformFee)),
    refund_eligibility: nonrefundable
      ? "TYPICALLY_INELIGIBLE"
      : "REVIEW_REQUIRED",
  };
}

