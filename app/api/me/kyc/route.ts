import { NextResponse } from "next/server";
import { requireAgentCustomer } from "@/lib/auth/agent";
import { failure } from "@/lib/api-utils";
import { sendKycSuccessEmail } from "@/lib/kyc-notifications";
export async function GET(request: Request) {
  try {
    const { customer, supabase } = await requireAgentCustomer(request);
    const { data, error } = await supabase
      .from("kyc_sessions")
      .select("id,status,provider,expires_at,normalized_result,success_email_status,success_email_sent_at")
      .eq("customer_id", customer.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (data?.status === "VERIFIED" && data.success_email_status !== "SENT") {
      try {
        await sendKycSuccessEmail(supabase, data.id, customer);
        data.success_email_status = "SENT";
      } catch (emailError) {
        console.error("[kyc.success-email]", {
          customer_id: customer.id,
          session_id: data.id,
          message: emailError instanceof Error ? emailError.message : String(emailError),
        });
      }
    }
    return NextResponse.json({
      status: data?.status || "NOT_STARTED",
      session: data,
    });
  } catch (e) {
    return failure(e);
  }
}
