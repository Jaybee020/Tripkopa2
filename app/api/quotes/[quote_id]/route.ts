import { NextResponse } from "next/server";
import { requireAgentCustomer } from "@/lib/auth/agent";
import { failure } from "@/lib/api-utils";
import { toCustomerQuote } from "@/lib/customer-pricing";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ quote_id: string }> },
) {
  try {
    const { quote_id } = await params;
    const { customer, supabase } = await requireAgentCustomer(request);
    const { data, error } = await supabase
      .from("quotes")
      .select("*")
      .eq("id", quote_id)
      .eq("customer_id", customer.id)
      .single();
    if (error) throw error;
    return NextResponse.json(toCustomerQuote(data));
  } catch (error) {
    return failure(error);
  }
}
