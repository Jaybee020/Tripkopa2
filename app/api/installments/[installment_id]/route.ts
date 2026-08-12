import { NextResponse } from "next/server";
import { requireAgentCustomer } from "@/lib/auth/agent";
import { failure } from "@/lib/api-utils";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ installment_id: string }> },
) {
  try {
    const { installment_id } = await params;
    const { customer, supabase } = await requireAgentCustomer(request);
    const { data, error } = await supabase
      .from("installments")
      .select("*")
      .eq("id", installment_id)
      .eq("customer_id", customer.id)
      .single();
    if (error) throw error;
    return NextResponse.json(data);
  } catch (e) {
    return failure(e);
  }
}
