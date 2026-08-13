import { NextResponse } from "next/server";
import { requireOperationsStaff } from "@/lib/auth/operations";
import { supabase as serviceSupabase } from "@/lib/services/supabase";
import { failure } from "@/lib/api-utils";

export async function GET() {
  try {
    await requireOperationsStaff();
    const { data, error } = await serviceSupabase.admin
      .from("bookings")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return NextResponse.json({ bookings: data || [], total: data?.length || 0 });
  } catch (error) {
    return failure(error);
  }
}
