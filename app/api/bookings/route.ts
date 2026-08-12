import { NextResponse } from "next/server";
import { z } from "zod";
import { BookingCreateInput } from "@/lib/api-contracts";
import { requireAgentCustomer } from "@/lib/auth/agent";
import { bad, failure } from "@/lib/api-utils";

type QuoteDetails = {
  offer?: unknown;
  booking_type?: string;
  pricing?: {
    repayment_plan?: {
      deposit_amount: number;
      installments: Array<{
        sequence_number: number;
        due_date: string;
        amount: number;
      }>;
    } | null;
  };
};

export async function POST(request: Request) {
  try {
    const input = BookingCreateInput.parse(await request.json());
    const { customer, supabase } = await requireAgentCustomer(request);

    const { data: quote, error: quoteError } = await supabase
      .from("quotes")
      .select("*")
      .eq("id", input.quote_id)
      .eq("customer_id", customer.id)
      .single();
    if (quoteError) throw quoteError;
    if (quote.status !== "ACTIVE") {
      return NextResponse.json(
        { error: "Quote is not active" },
        { status: 409 },
      );
    }
    if (Date.parse(quote.expires_at) <= Date.now()) {
      return NextResponse.json({ error: "Quote has expired" }, { status: 409 });
    }

    const details = quote.details as QuoteDetails;
    const repaymentPlan = details.pricing?.repayment_plan;
    if (input.booking_type === "flexible" && !repaymentPlan) {
      return NextResponse.json(
        { error: "Quote does not include a flexible repayment plan" },
        { status: 409 },
      );
    }

    const initialStatus = input.terms_accepted
      ? input.booking_type === "flexible"
        ? "AWAITING_DEPOSIT"
        : "AWAITING_PAYMENT"
      : "AWAITING_TERMS";

    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .insert({
        customer_id: customer.id,
        quote_id: quote.id,
        booking_type: input.booking_type,
        status: initialStatus,
        currency: quote.currency,
        total_amount: quote.total_amount,
        deposit_amount: input.booking_type === "flexible" ? quote.deposit_amount : null,
        amount_paid: 0,
        balance_amount: quote.total_amount,
        rule_version: quote.rule_version,
        passengers: input.passengers,
        flight_details: details.offer ?? quote.details,
      })
      .select("*")
      .single();
    if (bookingError) throw bookingError;

    if (input.booking_type === "flexible" && repaymentPlan) {
      const { error: installmentsError } = await supabase
        .from("installments")
        .insert(
          repaymentPlan.installments.map((installment) => ({
            customer_id: customer.id,
            booking_id: booking.id,
            sequence_number: installment.sequence_number,
            due_date: installment.due_date,
            amount: installment.amount,
            paid_amount: 0,
            status: "PENDING",
          })),
        );
      if (installmentsError) throw installmentsError;
    }

    const { error: quoteUpdateError } = await supabase
      .from("quotes")
      .update({ status: "CONSUMED" })
      .eq("id", quote.id)
      .eq("customer_id", customer.id);
    if (quoteUpdateError) throw quoteUpdateError;

    return NextResponse.json(booking, { status: 201 });
  } catch (error) {
    return error instanceof z.ZodError ? bad(error) : failure(error);
  }
}
