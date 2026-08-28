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
};

export const DEFAULT_FINANCING_RULES: FinancingRules = {
  rule_version: "flex_v3_2026_08",
  full_service_fee_rate: 0.05,
  markup: {
    domestic: [[5, 0.075], [9, 0.1], [12, 0.125]],
    regional: [[5, 0.075], [9, 0.1], [13, 0.125], [16, 0.175]],
    international: [[5, 0.075], [9, 0.1], [13, 0.125], [17, 0.175], [21, 0.225], [24, 0.275]],
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
    OBSERVER: { domestic: 300000, regional: 1000000, international: 1500000 },
    EXPLORER: { domestic: 350000, regional: 1200000, international: 1700000 },
    VOYAGER: { domestic: 400000, regional: 1300000, international: 2000000 },
    NAVIGATOR: { domestic: 450000, regional: 1400000, international: 2500000 },
    AMBASSADOR: { domestic: 500000, regional: 1500000, international: 3000000 },
  },
  post_travel_rates: { OBSERVER: 0, EXPLORER: 0, VOYAGER: 0, NAVIGATOR: 0, AMBASSADOR: 0 },
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
      if (!positive(deposit) || deposit >= 1 || !positive(cap)) return false;
    }
  }
  for (const tier of TRUST_TIERS) {
    const rate = typed.post_travel_rates[tier];
    if (typeof rate !== "number" || rate !== 0) return false;
  }
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
