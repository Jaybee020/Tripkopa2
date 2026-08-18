import { NextResponse } from "next/server";
import { requireAgentCustomer } from "@/lib/auth/agent";
import { failure } from "@/lib/api-utils";
import { loadFinancingRules } from "@/lib/financing-rules";
import { evaluateRepaymentLifecycle } from "@/lib/trust-financing";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ booking_id: string }> },
) {
  try {
    const { booking_id } = await params;
    const { customer, supabase } = await requireAgentCustomer(request);
    const rules = await loadFinancingRules(supabase);
    await evaluateRepaymentLifecycle(supabase, customer.id, rules, booking_id);
    const { data, error } = await supabase
      .from("itineraries")
      .select("booking_id,release_level,segments,ticket_reference")
      .eq("booking_id", booking_id)
      .eq("customer_id", customer.id)
      .single();
    if (error) throw error;
    const storedSegments = data.segments && typeof data.segments === "object"
      ? data.segments as Record<string, unknown>
      : {};
    return NextResponse.json({
      booking_id: data.booking_id,
      release_level: data.release_level,
      segments: storedSegments.flight ?? storedSegments,
      ticket_reference: data.release_level === "FULL" ? data.ticket_reference : null,
    });
  } catch (error) {
    return failure(error);
  }
}
