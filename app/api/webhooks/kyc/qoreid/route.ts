import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { QoreidWebhookInput } from "@/lib/api-contracts";
import { qoreid } from "@/lib/services/qoreid";
import { supabase } from "@/lib/services/supabase";
import { failure } from "@/lib/api-utils";

const REDACTED_KEYS = new Set([
  "bvn",
  "nin",
  "idnumber",
  "id_number",
  "photo",
  "photobase64",
  "document",
]);

function redactSensitive(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactSensitive);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !REDACTED_KEYS.has(key.toLowerCase()))
      .map(([key, child]) => [key, redactSensitive(child)]),
  );
}

export async function POST(request: Request) {
  try {
    const raw = await request.text();
    const requestHeaders = await headers();
    const signature =
      requestHeaders.get("x-verifyme-signature") ||
      requestHeaders.get("x-qoreid-signature") ||
      requestHeaders.get("x-webhook-signature");
    if (!(await qoreid.verifyWebhookSignature(raw, signature))) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const payload = QoreidWebhookInput.parse(JSON.parse(raw));
    const data =
      payload.data && typeof payload.data === "object"
        ? (payload.data as Record<string, unknown>)
        : null;
    const eventId = String(payload.event_id || data?.id || crypto.randomUUID());
    const { error } = await supabase.admin.from("provider_webhooks").insert({
      provider: "qoreid",
      event_type: String(payload.event_type || payload.event || "verification"),
      provider_event_id: eventId,
      payload: redactSensitive(payload),
      processing_status: "RECEIVED",
    });
    if (error?.code === "23505") {
      return NextResponse.json({ received: true, duplicate: true });
    }
    if (error) throw error;
    return NextResponse.json({ received: true });
  } catch (error) {
    return failure(error);
  }
}
