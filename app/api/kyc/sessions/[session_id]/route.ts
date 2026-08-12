import { NextResponse } from "next/server";
import { requireKycSessionAccess } from "@/lib/auth/kyc";
import { failure } from "@/lib/api-utils";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ session_id: string }> },
) {
  try {
    const { session_id } = await params;
    const { session } = await requireKycSessionAccess(request, session_id);
    return NextResponse.json({
      id: session.id,
      customer_id: session.customer_id,
      provider: session.provider,
      status: session.status,
      provider_reference: session.provider_reference,
      expires_at: session.expires_at,
      used_at: session.used_at,
      normalized_result: session.normalized_result,
    });
  } catch (e) {
    return failure(e);
  }
}
