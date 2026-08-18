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
      .from("bookings")
      .select("*")
      .eq("id", booking_id)
      .eq("customer_id", customer.id)
      .single();
    if (error) throw error;
    return NextResponse.json(data);
  } catch (error) {
    return failure(error);
  }
}
