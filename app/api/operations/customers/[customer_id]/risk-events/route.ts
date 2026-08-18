import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, failure } from "@/lib/api-utils";
import { requireOperationsStaff } from "@/lib/auth/operations";
import { supabase as serviceSupabase } from "@/lib/services/supabase";
import { refreshCustomerTrustTier } from "@/lib/trust-financing";

const CreateInput = z.object({
  booking_id: z.string().uuid().nullable().optional(),
  event_type: z.enum(["FRAUD", "OPERATIONAL_VIOLATION", "SEVERE_DEFAULT", "FINAL_DEFAULT"]),
  severity: z.enum(["MINOR", "MAJOR", "SEVERE"]),
  details: z.record(z.string(), z.unknown()).default({}),
}).strict();

const ResolveInput = z.object({
  event_id: z.string().uuid(),
  resolution: z.string().trim().min(10).max(500),
}).strict();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ customer_id: string }> },
) {
  try {
    const input = CreateInput.parse(await request.json());
    const { customer_id } = await params;
    const { user } = await requireOperationsStaff();
    const { data, error } = await serviceSupabase.admin.from("customer_risk_events").insert({
      customer_id,
      ...input,
      status: "OPEN",
    }).select("*").single();
    if (error) throw error;
    await serviceSupabase.admin.from("operation_audit_events").insert({
      staff_user_id: user.id,
      action: "customer_risk_event.created",
      target_type: "customer",
      target_id: customer_id,
      payload: { risk_event_id: data.id, ...input },
    });
    const financing_profile = await refreshCustomerTrustTier(serviceSupabase.admin, customer_id);
    return NextResponse.json({ risk_event: data, financing_profile }, { status: 201 });
  } catch (error) {
    return error instanceof z.ZodError ? bad(error) : failure(error);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ customer_id: string }> },
) {
  try {
    const input = ResolveInput.parse(await request.json());
    const { customer_id } = await params;
    const { user } = await requireOperationsStaff();
    const { data, error } = await serviceSupabase.admin.from("customer_risk_events").update({
      status: "RESOLVED",
      resolved_at: new Date().toISOString(),
      resolution: input.resolution,
    }).eq("id", input.event_id).eq("customer_id", customer_id).select("*").single();
    if (error) throw error;
    await serviceSupabase.admin.from("operation_audit_events").insert({
      staff_user_id: user.id,
      action: "customer_risk_event.resolved",
      target_type: "customer",
      target_id: customer_id,
      payload: input,
    });
    const financing_profile = await refreshCustomerTrustTier(serviceSupabase.admin, customer_id);
    return NextResponse.json({ risk_event: data, financing_profile });
  } catch (error) {
    return error instanceof z.ZodError ? bad(error) : failure(error);
  }
}
