import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOperationsStaff } from "@/lib/auth/operations";
import { supabase as serviceSupabase } from "@/lib/services/supabase";
import { bad, failure } from "@/lib/api-utils";
import { DEFAULT_FINANCING_RULES, parseFinancingRules } from "@/lib/financing-rules";

const RuleInput = z
  .object({
    value: z.record(z.string(), z.unknown()),
    description: z.string().max(500).optional(),
  })
  .strict();

const DEFAULT_RULE = DEFAULT_FINANCING_RULES;

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
    const rules = parseFinancingRules(input.value);
    const { data: existingVersion, error: versionLookupError } = await serviceSupabase.admin
      .from("admin_rule_config_versions")
      .select("id")
      .eq("key", "flex_mvp")
      .eq("version", rules.rule_version)
      .maybeSingle();
    if (versionLookupError) throw versionLookupError;
    if (existingVersion) {
      return NextResponse.json(
        { error: "Rule versions are immutable; provide a new rule_version" },
        { status: 409 },
      );
    }

    const { data, error } = await serviceSupabase.admin
      .from("admin_rule_configs")
      .upsert({
        key: "flex_mvp",
        value: rules,
        description: input.description || "MVP flexible payment rules.",
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      })
      .select("*")
      .single();
    if (error) throw error;

    const { error: versionError } = await serviceSupabase.admin
      .from("admin_rule_config_versions")
      .insert({
        key: "flex_mvp",
        version: rules.rule_version,
        value: rules,
        description: input.description || "Trust-based financing rules.",
        created_by: user.id,
      });
    if (versionError) throw versionError;

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
