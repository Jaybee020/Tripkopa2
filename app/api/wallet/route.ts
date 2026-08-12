import { NextResponse } from "next/server";
import { requireAgentCustomer } from "@/lib/auth/agent";
import { failure } from "@/lib/api-utils";
export async function GET(request: Request) {
  try {
    const { customer, supabase } = await requireAgentCustomer(request);
    const { data, error } = await supabase
      .from("wallets")
      .select("*")
      .eq("customer_id", customer.id)
      .single();
    if (error) throw error;
    const { data: virtualAccount, error: accountError } = await supabase
      .from("virtual_accounts")
      .select("id,account_number,account_name,bank_name,status")
      .eq("customer_id", customer.id)
      .eq("provider", "onecap_providus")
      .maybeSingle();
    if (accountError) throw accountError;
    return NextResponse.json({ ...data, virtual_account: virtualAccount });
  } catch (e) {
    return failure(e);
  }
}
