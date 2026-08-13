import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOperationsStaff } from "@/lib/auth/operations";
import { supabase as serviceSupabase } from "@/lib/services/supabase";
import { bad, failure } from "@/lib/api-utils";

const RuleInput = z
  .object({
    value: z.record(z.string(), z.unknown()),
    description: z.string().max(500).optional(),
  })
  .strict();

const DEFAULT_RULE = {
  rule_version: "flex_mvp_2026_08",
  full_service_fee_rate: 0.05,
  flex_deposit_rate: 0.3,
  domestic_max_installments: 4,
  regional_international_max_installments: 8,
  final_payment_due_days_before_departure: 10,
  grace_period_days: 3,
};

export async function GET() {
  try {
    await requireOperationsStaff();
    const { data, error } = await serviceSupabase.admin
      .from("admin_rule_configs")
      .select("*")
      .eq("key", "flex_mvp")
      .maybeSingle();
    if (error) throw error;
    return NextResponse.json(
      data || {
        key: "flex_mvp",
        value: DEFAULT_RULE,
        description: "Default MVP flexible payment rules. Run migrations to persist edits.",
      },
    );
  } catch (error) {
    return failure(error);
  }
}

export async function PUT(request: Request) {
  try {
    const input = RuleInput.parse(await request.json());
    const { user, role } = await requireOperationsStaff();
    if (role !== "admin") {
      return NextResponse.json(
        { error: "Admin role required to update rules" },
        { status: 403 },
      );
    }

    const { data, error } = await serviceSupabase.admin
      .from("admin_rule_configs")
      .upsert({
        key: "flex_mvp",
        value: input.value,
        description: input.description || "MVP flexible payment rules.",
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      })
      .select("*")
      .single();
    if (error) throw error;

    await serviceSupabase.admin.from("operation_audit_events").insert({
      staff_user_id: user.id,
      action: "rules.update",
      target_type: "admin_rule_config",
      target_id: "flex_mvp",
      payload: input,
    });

    return NextResponse.json(data);
  } catch (error) {
    return error instanceof z.ZodError ? bad(error) : failure(error);
  }
}
