import { NextResponse } from "next/server";
import { requireOperationsStaff } from "@/lib/auth/operations";
import { supabase as serviceSupabase } from "@/lib/services/supabase";
import { failure } from "@/lib/api-utils";
import { loadFinancingRules } from "@/lib/financing-rules";
import { evaluateRepaymentLifecycle, refreshCustomerTrustTier } from "@/lib/trust-financing";

export async function GET() {
  try {
    await requireOperationsStaff();
    const rules = await loadFinancingRules(serviceSupabase.admin);
    const { data: customerRows, error: customerError } = await serviceSupabase.admin
      .from("bookings")
      .select("customer_id")
      .eq("booking_type", "flexible");
    if (customerError) throw customerError;
    const customerIds = [...new Set((customerRows || []).map((row) => row.customer_id))];
    for (const customerId of customerIds) {
      await evaluateRepaymentLifecycle(serviceSupabase.admin, customerId, rules);
      await refreshCustomerTrustTier(serviceSupabase.admin, customerId);
    }
    const { data, error } = await serviceSupabase.admin
      .from("bookings")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return NextResponse.json({ bookings: data || [], total: data?.length || 0 });
  } catch (error) {
    return failure(error);
  }
}
