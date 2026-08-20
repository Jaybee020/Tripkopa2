import { NextResponse } from "next/server";
import { requireAgentCustomer } from "@/lib/auth/agent";
import { failure } from "@/lib/api-utils";
import { loadFinancingRules } from "@/lib/financing-rules";
import { evaluateRepaymentLifecycle, refreshCustomerTrustTier } from "@/lib/trust-financing";

export async function GET(request: Request) {
  try {
    const { customer, supabase } = await requireAgentCustomer(request);
    const rules = await loadFinancingRules(supabase);
    await evaluateRepaymentLifecycle(supabase, customer.id, rules);
    const trust = await refreshCustomerTrustTier(supabase, customer.id);
    const { data: kyc, error } = await supabase
      .from("kyc_sessions")
      .select("status")
      .eq("customer_id", customer.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return NextResponse.json({
      ...trust,
      kyc_verified: kyc?.status === "VERIFIED",
      deposit_rates: rules.deposit_rates[trust.effective_tier],
      financing_caps: rules.financing_caps[trust.effective_tier],
      post_travel_max_percentage: rules.post_travel_rates[trust.effective_tier] * 100,
      schedule_constraints: {
        max_installments: rules.max_installments,
        max_financing_weeks: rules.max_financing_weeks,
        generated_due_days_before_departure: rules.generated_due_days_before_departure,
        repayment_due_days_before_departure: rules.repayment_due_days_before_departure,
        grace_period_days: rules.grace_period_days,
        grace_hard_stop_days_before_departure: rules.grace_hard_stop_days_before_departure,
        post_travel_max_days: rules.post_travel_max_days,
      },
      rule_version: rules.rule_version,
    });
  } catch (error) {
    return failure(error);
  }
}
