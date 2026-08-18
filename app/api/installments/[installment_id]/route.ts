import { NextResponse } from "next/server";
import { requireAgentCustomer } from "@/lib/auth/agent";
import { failure } from "@/lib/api-utils";
import { loadFinancingRules } from "@/lib/financing-rules";
import { evaluateRepaymentLifecycle, refreshCustomerTrustTier } from "@/lib/trust-financing";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ installment_id: string }> },
) {
  try {
    const { installment_id } = await params;
    const { customer, supabase } = await requireAgentCustomer(request);
    const { data: initial, error: initialError } = await supabase
      .from("installments")
      .select("booking_id")
      .eq("id", installment_id)
      .eq("customer_id", customer.id)
      .single();
    if (initialError) throw initialError;
    const rules = await loadFinancingRules(supabase);
    await evaluateRepaymentLifecycle(supabase, customer.id, rules, initial.booking_id);
    await refreshCustomerTrustTier(supabase, customer.id);
    const { data, error } = await supabase
      .from("installments")
      .select("*")
      .eq("id", installment_id)
      .eq("customer_id", customer.id)
      .single();
    if (error) throw error;
    return NextResponse.json(data);
  } catch (error) {
    return failure(error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ installment_id: string }> },
) {
  try {
    const { installment_id } = await params;
    const { customer, supabase } = await requireAgentCustomer(request);
    const idempotencyKey = request.headers.get("idempotency-key")?.trim();
    if (!idempotencyKey || idempotencyKey.length > 200) {
      return NextResponse.json({ error: "A valid Idempotency-Key header is required" }, { status: 400 });
    }
    const { data, error } = await supabase
      .from("installments")
      .select("id,booking_id,reminder_count")
      .eq("id", installment_id)
      .eq("customer_id", customer.id)
      .single();
    if (error) throw error;
    const { error: reminderError } = await supabase.from("installment_reminders").insert({
      customer_id: customer.id,
      booking_id: data.booking_id,
      installment_id: data.id,
      idempotency_key: idempotencyKey,
    });
    if (reminderError && reminderError.code !== "23505") throw reminderError;
    const { count, error: countError } = await supabase
      .from("installment_reminders")
      .select("id", { count: "exact", head: true })
      .eq("installment_id", data.id);
    if (countError) throw countError;
    const { data: updated, error: updateError } = await supabase
      .from("installments")
      .update({ reminder_count: count || 0 })
      .eq("id", data.id)
      .select("*")
      .single();
    if (updateError) throw updateError;
    if (!reminderError) await supabase.from("operational_events").insert({
      customer_id: customer.id,
      booking_id: data.booking_id,
      event_type: "installment.reminder_sent",
      payload: { installment_id: data.id },
    });
    return NextResponse.json(updated);
  } catch (error) {
    return failure(error);
  }
}
