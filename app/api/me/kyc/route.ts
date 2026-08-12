import { NextResponse } from "next/server";
import { requireAgentCustomer } from "@/lib/auth/agent";
import { failure } from "@/lib/api-utils";
export async function GET(request: Request) {
  try {
    const { customer, supabase } = await requireAgentCustomer(request);
    const { data, error } = await supabase
      .from("kyc_sessions")
      .select("status,provider,expires_at,normalized_result")
      .eq("customer_id", customer.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return NextResponse.json({
      status: data?.status || "NOT_STARTED",
      session: data,
    });
  } catch (e) {
    return failure(e);
  }
}
