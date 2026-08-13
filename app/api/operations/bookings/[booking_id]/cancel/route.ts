import { NextResponse } from "next/server";
import { z } from "zod";
import { BookingCancellationInput } from "@/lib/api-contracts";
import { requireOperationsStaff } from "@/lib/auth/operations";
import { supabase as serviceSupabase } from "@/lib/services/supabase";
import { bad, failure } from "@/lib/api-utils";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ booking_id: string }> },
) {
  try {
    const input = BookingCancellationInput.parse(await request.json());
    const { user } = await requireOperationsStaff();
    const { booking_id } = await params;

    const { data, error } = await serviceSupabase.admin
      .from("bookings")
      .update({ status: "CANCELLATION_PENDING" })
      .eq("id", booking_id)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "Booking not found" }, { status: 404 });

    await serviceSupabase.admin.from("operation_audit_events").insert({
      staff_user_id: user.id,
      action: "booking.cancel_requested",
      target_type: "booking",
      target_id: booking_id,
      payload: { reason: input.reason },
    });

    return NextResponse.json({ ...data, cancellation_reason: input.reason });
  } catch (error) {
    return error instanceof z.ZodError ? bad(error) : failure(error);
  }
}
