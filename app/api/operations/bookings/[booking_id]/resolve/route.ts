import { NextResponse } from "next/server";
import { z } from "zod";
import { Booking } from "@/lib/api-contracts";
import { requireOperationsStaff } from "@/lib/auth/operations";
import { supabase as serviceSupabase } from "@/lib/services/supabase";
import { bad, failure } from "@/lib/api-utils";

const ResolveInput = z.object({ reason: z.string().min(1).max(500) });

export async function POST(
  request: Request,
  { params }: { params: Promise<{ booking_id: string }> },
) {
  try {
    const input = ResolveInput.parse(await request.json());
    const { user } = await requireOperationsStaff();
    const { booking_id } = await params;

    const { data: current, error: currentError } = await serviceSupabase.admin
      .from("bookings")
      .select("*")
      .eq("id", booking_id)
      .maybeSingle();
    if (currentError) throw currentError;
    if (!current) return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    if (current.status === "RESOLVED") {
      return NextResponse.json({ error: "Booking was already updated" }, { status: 409 });
    }

    const { data: updated, error: updateError } = await serviceSupabase.admin
      .from("bookings")
      .update({ status: "RESOLVED", resolution_reason: input.reason, resolved_by: user.id, resolved_at: new Date().toISOString() })
      .eq("id", booking_id)
      .eq("updated_at", current.updated_at)
      .select("*")
      .maybeSingle();
    if (updateError) throw updateError;
    if (!updated) return NextResponse.json({ error: "Booking was already updated" }, { status: 409 });

    return NextResponse.json(Booking.parse(updated));
  } catch (error) {
    return error instanceof z.ZodError ? bad(error) : failure(error);
  }
}
