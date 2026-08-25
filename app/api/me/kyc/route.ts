import { NextResponse } from "next/server";
import { requireAgentCustomer } from "@/lib/auth/agent";
import { failure } from "@/lib/api-utils";
import { sendKycSuccessNotifications } from "@/lib/kyc-notifications";
export async function GET(request: Request) {
  try {
    const { customer, supabase } = await requireAgentCustomer(request);
    const { data, error } = await supabase
      .from("kyc_sessions")
      .select("id,status,provider,expires_at,normalized_result")
      .eq("customer_id", customer.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    let successNotification = null;
    if (data?.status === "VERIFIED") {
      try {
        successNotification = await sendKycSuccessNotifications(supabase, data.id, customer);
      } catch (notificationError) {
        console.error("[kyc.success-notification]", {
          customer_id: customer.id,
          session_id: data.id,
          message: notificationError instanceof Error
            ? notificationError.message
            : String(notificationError),
        });
      }
    }
    return NextResponse.json({
      status: data?.status || "NOT_STARTED",
      session: data,
      success_notification: successNotification,
    });
  } catch (e) {
    return failure(e);
  }
}
