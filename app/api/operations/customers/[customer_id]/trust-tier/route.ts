import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, failure } from "@/lib/api-utils";
import { requireOperationsStaff } from "@/lib/auth/operations";
import { supabase as serviceSupabase } from "@/lib/services/supabase";
import { TRUST_TIERS } from "@/lib/financing-rules";
import { refreshCustomerTrustTier } from "@/lib/trust-financing";

const Input = z.object({
  tier: z.enum(TRUST_TIERS).nullable(),
  reason: z.string().trim().min(10).max(500),
}).strict();

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ customer_id: string }> },
) {
  try {
    const input = Input.parse(await request.json());
    const { customer_id } = await params;
    const { user, role } = await requireOperationsStaff();
    if (role !== "admin") {
      return NextResponse.json({ error: "Admin role required" }, { status: 403 });
    }
    const { error } = await serviceSupabase.admin.from("customers").update({
      trust_tier_override: input.tier,
      trust_tier_override_reason: input.reason,
      trust_tier_overridden_at: input.tier ? new Date().toISOString() : null,
    }).eq("id", customer_id);
    if (error) throw error;
    await serviceSupabase.admin.from("operation_audit_events").insert({
      staff_user_id: user.id,
      action: input.tier ? "trust_tier.override" : "trust_tier.override_cleared",
      target_type: "customer",
      target_id: customer_id,
      payload: input,
    });
    return NextResponse.json(await refreshCustomerTrustTier(serviceSupabase.admin, customer_id));
  } catch (error) {
    return error instanceof z.ZodError ? bad(error) : failure(error);
  }
}
