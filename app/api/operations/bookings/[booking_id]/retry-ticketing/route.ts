import { NextResponse } from "next/server";
import { requireOperationsStaff } from "@/lib/auth/operations";
import { retryBookingTicketing } from "@/lib/booking-payments";
import { supabase as serviceSupabase } from "@/lib/services/supabase";
import { failure } from "@/lib/api-utils";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ booking_id: string }> },
) {
  try {
    const { user } = await requireOperationsStaff();
    const { booking_id } = await params;
    const result = await retryBookingTicketing(booking_id);

    await serviceSupabase.admin.from("operation_audit_events").insert({
      staff_user_id: user.id,
      action: "booking.retry_ticketing",
      target_type: "booking",
      target_id: booking_id,
      payload: result,
    });

    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return failure(error);
  }
}
