import type { SupabaseClient } from "@supabase/supabase-js";
import type { RouteCategory } from "./airport-regions";

export const TRUST_TIERS = [
  "OBSERVER",
  "EXPLORER",
  "VOYAGER",
  "NAVIGATOR",
  "AMBASSADOR",
] as const;
export type TrustTier = (typeof TRUST_TIERS)[number];

type RouteValues = Record<RouteCategory, number>;
type TierRouteValues = Record<TrustTier, RouteValues>;

export const APPROVED_DISCOUNT_TYPES = [
  "PROMOTIONAL_CAMPAIGN",
  "REFERRAL_CAMPAIGN",
  "STRATEGIC_PARTNERSHIP",
  "LOYALTY_REWARD",
  "SEASONAL_CAMPAIGN",
] as const;

export const APPROVED_PROMOTIONAL_BENEFITS = [
  "REDUCED_SERVICE_FEE",
  "REDUCED_DEPOSIT",
  "REPAYMENT_FLEXIBILITY_BOOST",
] as const;

export type FinancingRules = {
  rule_version: string;
  full_service_fee_rate: number;
  markup: Record<RouteCategory, Array<[number, number]>>;
  max_financing_weeks: RouteValues;
  max_installments: RouteValues;
  minimum_days_before_departure: number;
  repayment_due_days_before_departure: number;
  generated_due_days_before_departure: number;
  grace_period_days: number;
  grace_hard_stop_days_before_departure: number;
  post_travel_max_days: number;
  deposit_rates: TierRouteValues;
  financing_caps: TierRouteValues;
  post_travel_rates: Record<TrustTier, number>;
  cancellation_rates: TierRouteValues;
  cancellation_fee_caps: RouteValues;
  discount_policy: {
    approved_types: string[];
    approved_benefits: string[];
    blanket_discounts_allowed: false;
  };
};

export const DEFAULT_FINANCING_RULES: FinancingRules = {
  rule_version: "pricing_v4_2026_09",
  full_service_fee_rate: 0.05,
  markup: {
    domestic: [[5, 0.05], [9, 0.075], [12, 0.1]],
    regional: [[5, 0.05], [9, 0.075], [13, 0.1], [16, 0.15]],
    international: [[5, 0.05], [9, 0.075], [13, 0.1], [17, 0.15], [21, 0.2], [24, 0.25]],
  },
  max_financing_weeks: { domestic: 12, regional: 16, international: 24 },
  max_installments: { domestic: 4, regional: 6, international: 8 },
  minimum_days_before_departure: 21,
  repayment_due_days_before_departure: 10,
  generated_due_days_before_departure: 10,
  grace_period_days: 3,
  grace_hard_stop_days_before_departure: 7,
  post_travel_max_days: 90,
  deposit_rates: {
    OBSERVER: { domestic: 0.35, regional: 0.45, international: 0.55 },
    EXPLORER: { domestic: 0.3, regional: 0.4, international: 0.5 },
    VOYAGER: { domestic: 0.25, regional: 0.35, international: 0.45 },
    NAVIGATOR: { domestic: 0.25, regional: 0.35, international: 0.45 },
    AMBASSADOR: { domestic: 0.25, regional: 0.35, international: 0.4 },
  },
  financing_caps: {
    OBSERVER: { domestic: 450000, regional: 2500000, international: 4500000 },
    EXPLORER: { domestic: 500000, regional: 3000000, international: 5000000 },
    VOYAGER: { domestic: 600000, regional: 4000000, international: 6000000 },
    NAVIGATOR: { domestic: 700000, regional: 5000000, international: 7000000 },
    AMBASSADOR: { domestic: 800000, regional: 6000000, international: 8000000 },
  },
  post_travel_rates: { OBSERVER: 0, EXPLORER: 0, VOYAGER: 0.1, NAVIGATOR: 0.2, AMBASSADOR: 0.3 },
  cancellation_rates: {
    OBSERVER: { domestic: 0.2, regional: 0.2, international: 0.25 },
    EXPLORER: { domestic: 0.175, regional: 0.175, international: 0.23 },
    VOYAGER: { domestic: 0.15, regional: 0.15, international: 0.2 },
    NAVIGATOR: { domestic: 0.12, regional: 0.12, international: 0.17 },
    AMBASSADOR: { domestic: 0.1, regional: 0.1, international: 0.13 },
  },
  cancellation_fee_caps: { domestic: 0.2, regional: 0.2, international: 0.25 },
  discount_policy: {
    approved_types: [...APPROVED_DISCOUNT_TYPES],
    approved_benefits: [...APPROVED_PROMOTIONAL_BENEFITS],
    blanket_discounts_allowed: false,
  },
};

export function isTrustTier(value: unknown): value is TrustTier {
  return typeof value === "string" && TRUST_TIERS.includes(value as TrustTier);
}

function validRules(value: unknown): value is FinancingRules {
  if (!value || typeof value !== "object") return false;
  const rule = value as Partial<FinancingRules>;
  const structurallyValid = Boolean(
    rule.rule_version && typeof rule.full_service_fee_rate === "number" &&
    rule.markup && rule.deposit_rates && rule.financing_caps &&
    rule.max_financing_weeks && rule.max_installments && rule.post_travel_rates &&
    rule.cancellation_rates && rule.cancellation_fee_caps && rule.discount_policy &&
    typeof rule.minimum_days_before_departure === "number" &&
    typeof rule.repayment_due_days_before_departure === "number" &&
    typeof rule.generated_due_days_before_departure === "number" &&
    typeof rule.grace_period_days === "number" &&
    typeof rule.grace_hard_stop_days_before_departure === "number" &&
    typeof rule.post_travel_max_days === "number",
  );
  if (!structurallyValid) return false;
  const typed = rule as FinancingRules;
  const routes: RouteCategory[] = ["domestic", "regional", "international"];
  const positive = (entry: unknown) => typeof entry === "number" && Number.isFinite(entry) && entry > 0;
  if (!positive(typed.full_service_fee_rate) || typed.full_service_fee_rate >= 1) return false;
  if (
    !positive(typed.minimum_days_before_departure) ||
    typed.minimum_days_before_departure < 21 ||
    !positive(typed.repayment_due_days_before_departure) ||
    !positive(typed.generated_due_days_before_departure) ||
    typed.generated_due_days_before_departure !== typed.repayment_due_days_before_departure ||
    !positive(typed.grace_period_days) ||
    !positive(typed.grace_hard_stop_days_before_departure) ||
    typed.grace_hard_stop_days_before_departure !==
      typed.repayment_due_days_before_departure - typed.grace_period_days ||
    !positive(typed.post_travel_max_days)
  ) return false;
  for (const route of routes) {
    const brackets = typed.markup[route];
    if (!Array.isArray(brackets) || brackets.length === 0) return false;
    let prior = 0;
    for (const bracket of brackets) {
      if (!Array.isArray(bracket) || bracket.length !== 2 || !positive(bracket[0]) || !positive(bracket[1]) || bracket[1] >= 1 || bracket[0] <= prior) return false;
      prior = bracket[0];
    }
    if (prior !== typed.max_financing_weeks[route] || !positive(typed.max_installments[route])) return false;
    for (const tier of TRUST_TIERS) {
      const deposit = typed.deposit_rates[tier]?.[route];
      const cap = typed.financing_caps[tier]?.[route];
      const cancellationRate = typed.cancellation_rates[tier]?.[route];
      const cancellationCap = typed.cancellation_fee_caps[route];
      if (
        !positive(deposit) || deposit >= 1 || !positive(cap) ||
        !positive(cancellationRate) || cancellationRate > cancellationCap ||
        !positive(cancellationCap) || cancellationCap >= 1
      ) return false;
    }
  }
  const expectedPostTravelRates: Record<TrustTier, number> = {
    OBSERVER: 0,
    EXPLORER: 0,
    VOYAGER: 0.1,
    NAVIGATOR: 0.2,
    AMBASSADOR: 0.3,
  };
  for (const tier of TRUST_TIERS) {
    const rate = typed.post_travel_rates[tier];
    if (
      typeof rate !== "number" || !Number.isFinite(rate) || rate < 0 ||
      rate > expectedPostTravelRates[tier]
    ) return false;
  }
  if (
    typed.discount_policy.blanket_discounts_allowed !== false ||
    !APPROVED_DISCOUNT_TYPES.every((type) => typed.discount_policy.approved_types.includes(type)) ||
    !APPROVED_PROMOTIONAL_BENEFITS.every((benefit) => typed.discount_policy.approved_benefits.includes(benefit))
  ) return false;
  return true;
}

export function parseFinancingRules(value: unknown): FinancingRules {
  if (!validRules(value)) {
    throw Object.assign(new Error("A complete financing rule configuration is required"), { status: 400 });
  }
  return value;
}

export async function loadFinancingRules(supabase: SupabaseClient): Promise<FinancingRules> {
  const { data, error } = await supabase
    .from("admin_rule_configs")
    .select("value")
    .eq("key", "flex_mvp")
    .maybeSingle();
  if (error) throw error;
  return validRules(data?.value) ? data.value : DEFAULT_FINANCING_RULES;
}
