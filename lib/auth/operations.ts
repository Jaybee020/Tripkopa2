import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/server";

const OPERATIONS_ROLES = ["operations", "operations_staff", "admin"];

export async function requireOperationsStaff() {
  const { user, supabase } = await requireAuth();
  const { data: staff, error } = await supabase
    .from("staff_profiles")
    .select("role")
    .eq("user_id", user.id)
    .in("role", OPERATIONS_ROLES)
    .maybeSingle();
  if (error) throw error;
  if (!staff) {
    throw Object.assign(new Error("Operations staff access required"), {
      status: 403,
    });
  }
  return { user, supabase, role: staff.role as string };
}

export function operationsForbidden(error: unknown) {
  const status = (error as { status?: number }).status;
  return status === 403
    ? NextResponse.json({ error: "Operations staff access required" }, { status })
    : null;
}
