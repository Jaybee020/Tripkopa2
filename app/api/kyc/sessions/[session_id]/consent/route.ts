import { NextResponse } from "next/server";
import { z } from "zod";
import { requireKycSessionAccess } from "@/lib/auth/kyc";
import { bad, failure } from "@/lib/api-utils";

const ConsentInput = z.object({
  consent: z.literal(true),
  privacy_notice_version: z.literal("1.0"),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ session_id: string }> },
) {
  try {
    const input = ConsentInput.parse(await request.json());
    const { session_id } = await params;
    const { session, customer, supabase } = await requireKycSessionAccess(request, session_id);
    if (new Date(session.expires_at).getTime() <= Date.now()) {
      return NextResponse.json({ error: "KYC session has expired" }, { status: 409 });
    }
    if (!["PENDING", "CONSENTED"].includes(session.status)) {
      return NextResponse.json({ error: "KYC session cannot accept consent" }, { status: 409 });
    }

    const consentedAt = new Date().toISOString();
    const { data: updated, error: updateError } = await supabase
      .from("kyc_sessions")
      .update({ status: "CONSENTED", consented_at: consentedAt, privacy_notice_version: input.privacy_notice_version })
      .eq("id", session_id)
      .eq("customer_id", customer.id)
      .in("status", ["PENDING", "CONSENTED"])
      .select("id,status,provider")
      .single();
    if (updateError) throw updateError;

    const configuredUrl = process.env.KYC_PROVIDER_URL || process.env.QOREID_LAUNCH_URL || null;
    const providerUrl = configuredUrl ? `${configuredUrl}${configuredUrl.includes("?") ? "&" : "?"}session_id=${encodeURIComponent(updated.id)}` : null;
    return NextResponse.json({ session_id: updated.id, status: updated.status, provider_url: providerUrl });
  } catch (error) {
    return error instanceof z.ZodError ? bad(error) : failure(error);
  }
}
