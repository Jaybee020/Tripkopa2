import { NextResponse } from "next/server";
import { requireAgentCustomer } from "@/lib/auth/agent";
import { failure } from "@/lib/api-utils";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ payment_id: string }> },
) {
  try {
    const { payment_id } = await params;
    const { customer, supabase } = await requireAgentCustomer(request);
    const { data, error } = await supabase
      .from("payments")
      .select("*")
      .eq("id", payment_id)
      .eq("customer_id", customer.id)
      .single();
    if (error) throw error;
    const { data: allocations, error: allocationsError } = await supabase
      .from("payment_allocations")
      .select("id,booking_id,amount,currency,allocation_type,provider_paid_at,details,created_at")
      .eq("payment_id", payment_id)
      .eq("customer_id", customer.id)
      .order("created_at", { ascending: true });
    if (allocationsError) throw allocationsError;
    return NextResponse.json({ ...data, allocations: allocations || [] });
  } catch (e) {
    return failure(e);
  }
}
