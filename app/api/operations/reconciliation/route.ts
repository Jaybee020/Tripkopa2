import { NextResponse } from "next/server";
import { requireOperationsStaff } from "@/lib/auth/operations";
import { failure } from "@/lib/api-utils";
import { supabase as serviceSupabase } from "@/lib/services/supabase";

export async function GET() {
  try {
    await requireOperationsStaff();
    const { data, error } = await serviceSupabase.admin
      .from("reconciliation_records")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return NextResponse.json({ records: data || [], total: data?.length || 0 });
  } catch (error) {
    return failure(error);
  }
}
