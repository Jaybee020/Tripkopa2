import { NextResponse } from "next/server";
import { requireAgentCustomer } from "@/lib/auth/agent";
import { failure } from "@/lib/api-utils";
export async function GET(request: Request) {
  try {
    const { customer, supabase } = await requireAgentCustomer(request);
    const { data, error } = await supabase
      .from("ledger_entries")
      .select("*")
      .eq("customer_id", customer.id)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return NextResponse.json({ entries: data, total: data?.length || 0 });
  } catch (e) {
    return failure(e);
  }
}
