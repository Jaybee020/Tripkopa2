import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "tripkopa",
    message: "Tripkopa API is running",
    endpoints: {
      health: "/api/health",
      qoreidWebhook: "/api/webhooks/kyc/qoreid",
    },
    timestamp: new Date().toISOString(),
  });
}
