import { NextResponse } from "next/server";
import { z } from "zod";
import { QuoteRevalidationInput } from "@/lib/api-contracts";
import { requireAgentCustomer } from "@/lib/auth/agent";
import { taketrips } from "@/lib/services/taketrips";
import { bad, failure } from "@/lib/api-utils";

type QuoteDetails = {
  offer?: unknown;
  pricing?: unknown;
  search?: unknown;
  booking_type?: string;
  revalidation_error?: {
    message: string;
    at: string;
  } | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function payloadMessage(value: unknown): string | null {
  if (!isRecord(value)) return null;
  const message = value.message ?? value.error;
  return typeof message === "string" && message.trim() ? message : null;
}

function providerFailureMessage(error: unknown) {
  if (isRecord(error)) {
    const originalMessage = payloadMessage(error.originalError);
    if (originalMessage) return originalMessage;
  }
  return error instanceof Error ? error.message : "TakeTrips validation failed";
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ quote_id: string }> },
) {
  try {
    const input = QuoteRevalidationInput.parse(await request.json());
    const { quote_id } = await params;
    const { customer, supabase } = await requireAgentCustomer(request);
    const { data: quote, error } = await supabase
      .from("quotes")
      .select("*")
      .eq("id", quote_id)
      .eq("customer_id", customer.id)
      .single();
    if (error) throw error;

    const details = (quote.details ?? {}) as QuoteDetails;
    let provider: Record<string, unknown>;
    try {
      provider = await taketrips.validate(details.offer ?? quote.details);
    } catch (providerError) {
      const message = providerFailureMessage(providerError);
      const nextDetails = {
        ...details,
        revalidation_error: {
          message,
          at: new Date().toISOString(),
        },
      };
      const { error: updateError } = await supabase
        .from("quotes")
        .update({
          details: nextDetails,
          status: "REPRICE_REQUIRED",
        })
        .eq("id", quote_id)
        .eq("customer_id", customer.id);
      if (updateError) throw updateError;

      return NextResponse.json(
        {
          error: "Quote could not be revalidated",
          status: "REPRICE_REQUIRED",
          provider_error: message,
        },
        { status: 409 },
      );
    }

    const nextDetails = {
      ...details,
      offer: provider,
      revalidation_error: null,
      revalidated_at: new Date().toISOString(),
    };

    const { data, error: updateError } = await supabase
      .from("quotes")
      .update({
        details: nextDetails,
        status: "ACTIVE",
        version: (input.version || quote.version) + 1,
      })
      .eq("id", quote_id)
      .eq("customer_id", customer.id)
      .select("*")
      .single();
    if (updateError) throw updateError;

    return NextResponse.json(data);
  } catch (error) {
    return error instanceof z.ZodError ? bad(error) : failure(error);
  }
}
