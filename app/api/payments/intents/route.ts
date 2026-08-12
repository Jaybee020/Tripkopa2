import { NextResponse } from "next/server";
import { z } from "zod";
import { PaymentIntentCreateInput } from "@/lib/api-contracts";
import { requireAgentCustomer } from "@/lib/auth/agent";
import { bad, failure } from "@/lib/api-utils";

function money(value: number | string | null | undefined) {
  return Math.round(Number(value || 0) * 100) / 100;
}

export async function POST(request: Request) {
  try {
    const input = PaymentIntentCreateInput.parse(await request.json());
    const idempotencyKey = request.headers.get("idempotency-key")?.trim();
    if (!idempotencyKey || idempotencyKey.length > 200) {
      return NextResponse.json(
        { error: "A valid Idempotency-Key header is required" },
        { status: 400 },
      );
    }

    const { customer, supabase } = await requireAgentCustomer(request);
    const { data: existing, error: existingError } = await supabase
      .from("payments")
      .select("*")
      .eq("customer_id", customer.id)
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing) return NextResponse.json(existing);

    const { data: account, error: accountError } = await supabase
      .from("virtual_accounts")
      .select("id,account_number,account_name,bank_name,status")
      .eq("customer_id", customer.id)
      .eq("provider", "onecap_providus")
      .eq("status", "ACTIVE")
      .maybeSingle();
    if (accountError) throw accountError;
    if (!account) {
      return NextResponse.json(
        { error: "A verified Providus virtual account is required" },
        { status: 409 },
      );
    }
    if (input.currency !== "NGN") {
      return NextResponse.json(
        { error: "Providus virtual-account transfers currently support NGN only" },
        { status: 400 },
      );
    }

    let bookingMetadata: Record<string, unknown> = {};
    if (input.booking_id) {
      const { data: booking, error: bookingError } = await supabase
        .from("bookings")
        .select("id,booking_type,status,total_amount,deposit_amount,balance_amount")
        .eq("id", input.booking_id)
        .eq("customer_id", customer.id)
        .maybeSingle();
      if (bookingError) throw bookingError;
      if (!booking) {
        return NextResponse.json({ error: "Booking not found" }, { status: 404 });
      }
      if (["CANCELLED", "REFUNDED", "FAILED"].includes(booking.status)) {
        return NextResponse.json(
          { error: "Booking cannot accept payment" },
          { status: 409 },
        );
      }
      if (input.amount > money(booking.balance_amount)) {
        return NextResponse.json(
          { error: "Payment amount exceeds booking balance" },
          { status: 400 },
        );
      }
      if (
        booking.booking_type === "flexible" &&
        ["AWAITING_DEPOSIT", "AWAITING_PAYMENT"].includes(booking.status) &&
        input.amount < money(booking.deposit_amount)
      ) {
        return NextResponse.json(
          { error: "Payment amount is below the required deposit" },
          { status: 400 },
        );
      }
      bookingMetadata = {
        booking_type: booking.booking_type,
        booking_status_at_creation: booking.status,
      };
    }

    const providerReference = `ocp_${crypto.randomUUID()}`;
    const { data, error } = await supabase
      .from("payments")
      .insert({
        customer_id: customer.id,
        booking_id: input.booking_id || null,
        provider: "onecap_providus",
        provider_reference: providerReference,
        payment_type: input.payment_type,
        amount: input.amount,
        currency: input.currency,
        status: "PENDING",
        idempotency_key: idempotencyKey,
        metadata: { virtual_account_id: account.id, ...bookingMetadata },
      })
      .select("*")
      .single();
    if (error?.code === "23505") {
      const { data: raced, error: racedError } = await supabase
        .from("payments")
        .select("*")
        .eq("customer_id", customer.id)
        .eq("idempotency_key", idempotencyKey)
        .single();
      if (racedError) throw racedError;
      return NextResponse.json(raced);
    }
    if (error) throw error;

    return NextResponse.json(
      {
        ...data,
        payment_method: "BANK_TRANSFER",
        virtual_account: account,
      },
      { status: 201 },
    );
  } catch (error) {
    return error instanceof z.ZodError ? bad(error) : failure(error);
  }
}
