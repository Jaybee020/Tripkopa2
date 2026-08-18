import { NextResponse } from "next/server";
import { requireAgentCustomer } from "@/lib/auth/agent";
import { failure } from "@/lib/api-utils";
import { loadFinancingRules } from "@/lib/financing-rules";
import { evaluateRepaymentLifecycle, refreshCustomerTrustTier } from "@/lib/trust-financing";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ booking_id: string }> },
) {
  try {
    const { booking_id } = await params;
    const { customer, supabase } = await requireAgentCustomer(request);
    const rules = await loadFinancingRules(supabase);
    await evaluateRepaymentLifecycle(supabase, customer.id, rules, booking_id);
    await refreshCustomerTrustTier(supabase, customer.id);
    const { data, error } = await supabase
      .from("installments")
      .select("*")
      .eq("booking_id", booking_id)
      .eq("customer_id", customer.id)
      .order("sequence_number");
    if (error) throw error;
    return NextResponse.json({ booking_id, installments: data });
  } catch (e) {
    return failure(e);
  }
}
