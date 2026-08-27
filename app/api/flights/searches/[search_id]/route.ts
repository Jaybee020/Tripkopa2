import { NextResponse } from "next/server";
import { requireAgentCustomer } from "@/lib/auth/agent";
import { failure } from "@/lib/api-utils";
import { explainableSearchResponse } from "@/lib/flight-search-scope";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ search_id: string }> },
) {
  try {
    const { search_id } = await params;
    const { customer, supabase } = await requireAgentCustomer(request);
    const { data, error } = await supabase
      .from("flight_searches")
      .select("*")
      .eq("id", search_id)
      .eq("customer_id", customer.id)
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      return NextResponse.json(
        { error: "Flight search not found" },
        { status: 404 },
      );
    }
    return NextResponse.json(
      explainableSearchResponse(data as Record<string, unknown>),
    );
  } catch (error) {
    return failure(error);
  }
}
