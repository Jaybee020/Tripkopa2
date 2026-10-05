import { NextResponse } from "next/server";
import { requireOperationsStaff } from "@/lib/auth/operations";
import { supabase as serviceSupabase } from "@/lib/services/supabase";
import { failure } from "@/lib/api-utils";
import { loadFinancingRules } from "@/lib/financing-rules";
import { evaluateRepaymentLifecycle, refreshCustomerTrustTier } from "@/lib/trust-financing";
import { summarizeFlight } from "@/lib/operations-flight";

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
    const ids = [...new Set((data || []).map((booking) => booking.customer_id))];
    const { data: customers, error: customersError } = ids.length
      ? await serviceSupabase.admin
          .from("customers")
          .select("id,first_name,last_name,email,whatsapp_number")
          .in("id", ids)
      : { data: [], error: null };
    if (customersError) throw customersError;
    const customerById = new Map(
      (customers || []).map((customer) => [customer.id, customer]),
    );
    const enriched = (data || []).map((booking) => ({
      ...booking,
      customer: customerById.get(booking.customer_id) || null,
      flight: summarizeFlight(booking.flight_details),
    }));
    return NextResponse.json({ bookings: enriched, total: enriched.length });
  } catch (error) {
    return failure(error);
  }
}
