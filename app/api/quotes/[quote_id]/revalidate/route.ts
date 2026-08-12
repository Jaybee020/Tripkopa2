import { NextResponse } from "next/server";
import { z } from "zod";
import { QuoteRevalidationInput } from "@/lib/api-contracts";
import { requireAgentCustomer } from "@/lib/auth/agent";
import { taketrips } from "@/lib/services/taketrips";
import { bad, failure } from "@/lib/api-utils";

type QuoteDetails = {
  offer?: unknown;
  pricing?: unknown;
  search?: unknown;
  booking_type?: string;
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ quote_id: string }> },
) {
  try {
    const input = QuoteRevalidationInput.parse(await request.json());
    const { quote_id } = await params;
    const { customer, supabase } = await requireAgentCustomer(request);
    const { data: quote, error } = await supabase
      .from("quotes")
      .select("*")
      .eq("id", quote_id)
      .eq("customer_id", customer.id)
      .single();
    if (error) throw error;

    const details = quote.details as QuoteDetails;
    const provider = await taketrips.validate(details.offer ?? quote.details);
    const nextDetails = {
      ...details,
      offer: provider,
      revalidated_at: new Date().toISOString(),
    };

    const { data, error: updateError } = await supabase
      .from("quotes")
      .update({
        details: nextDetails,
        status: "ACTIVE",
        version: (input.version || quote.version) + 1,
      })
      .eq("id", quote_id)
      .eq("customer_id", customer.id)
      .select("*")
      .single();
    if (updateError) throw updateError;

    return NextResponse.json(data);
  } catch (error) {
    return error instanceof z.ZodError ? bad(error) : failure(error);
  }
}
