import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { OneCapDepositWebhookInput } from "@/lib/api-contracts";
import { supabase } from "@/lib/services/supabase";
import { bad, failure } from "@/lib/api-utils";

function validSignature(raw: string, providedHeader: string | null) {
  const secret = process.env.ONECAP_PARTNER_WEBHOOK_SECRET;
  if (!secret) {
    throw Object.assign(new Error("OneCap webhook verification is not configured"), {
      status: 500,
    });
  }
  if (!providedHeader) return false;
  const provided = providedHeader.replace(/^sha256=/i, "").trim();
  const expected = createHmac("sha256", secret).update(raw).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(provided, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  try {
    const raw = await request.text();
    if (!validSignature(raw, request.headers.get("x-partner-signature"))) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const payload = OneCapDepositWebhookInput.parse(JSON.parse(raw));
    const { data: paymentId, error } = await supabase.admin.rpc(
      "process_onecap_deposit",
      {
        p_event_id: payload.data.session_id,
        p_account_number: payload.data.account_number,
        p_reference: payload.data.reference,
        p_amount: payload.data.amount,
        p_currency: payload.data.currency.toUpperCase(),
        p_payload: payload,
      },
    );
    if (error) {
      if (error.message.includes("virtual account not found")) {
        return NextResponse.json(
          { error: "Virtual account not recognized" },
          { status: 422 },
        );
      }
      throw error;
    }
    return NextResponse.json({ received: true, payment_id: paymentId });
  } catch (error) {
    return error instanceof z.ZodError ? bad(error) : failure(error);
  }
}

