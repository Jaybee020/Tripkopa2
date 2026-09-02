import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { OneCapDepositWebhookInput } from "@/lib/api-contracts";
import { supabase } from "@/lib/services/supabase";
import { bad, failure } from "@/lib/api-utils";
import { applyBookingPayment } from "@/lib/booking-payments";

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

async function flagThirdPartyWalletFunding(input: {
  accountNumber: string;
  payerEmail?: string;
  providerEventId: string;
}) {
  if (!input.payerEmail) return;
  const { data: account, error: accountError } = await supabase.admin
    .from("virtual_accounts")
    .select("customer_id")
    .eq("provider", "onecap_providus")
    .eq("account_number", input.accountNumber)
    .maybeSingle();
  if (accountError) throw accountError;
  if (!account) return;
  const { data: customer, error: customerError } = await supabase.admin
    .from("customers")
    .select("email")
    .eq("id", account.customer_id)
    .single();
  if (customerError) throw customerError;
  if (
    !customer.email ||
    customer.email.trim().toLowerCase() === input.payerEmail.trim().toLowerCase()
  ) return;

  const { data: existing, error: existingError } = await supabase.admin
    .from("customer_risk_events")
    .select("id")
    .eq("customer_id", account.customer_id)
    .eq("event_type", "THIRD_PARTY_WALLET_FUNDING")
    .contains("details", { provider_event_id: input.providerEventId })
    .maybeSingle();
  if (existingError) throw existingError;
  if (!existing) {
    const { error } = await supabase.admin.from("customer_risk_events").insert({
      customer_id: account.customer_id,
      event_type: "THIRD_PARTY_WALLET_FUNDING",
      severity: "MAJOR",
      status: "OPEN",
      details: {
        provider_event_id: input.providerEventId,
        reason: "Funding identity differs from the verified wallet identity",
      },
    });
    if (error) throw error;
  }
}

export async function POST(request: Request) {
  try {
    const raw = await request.text();
    if (!validSignature(raw, request.headers.get("x-partner-signature"))) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const payload = OneCapDepositWebhookInput.parse(JSON.parse(raw));
    await flagThirdPartyWalletFunding({
      accountNumber: payload.data.account_number,
      payerEmail: payload.data.user?.email,
      providerEventId: payload.data.session_id,
    });
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
    const allocation = paymentId
      ? await applyBookingPayment(String(paymentId))
      : { applied: false, reason: "no_payment_id" };
    return NextResponse.json({
      received: true,
      payment_id: paymentId,
      allocation,
      booking: allocation,
    });
  } catch (error) {
    return error instanceof z.ZodError ? bad(error) : failure(error);
  }
}
