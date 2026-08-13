import { NextResponse } from "next/server";
import { z } from "zod";
import { QuoteCreateInput } from "@/lib/api-contracts";
import { requireAgentCustomer } from "@/lib/auth/agent";
import { bad, failure } from "@/lib/api-utils";
import {
  extractOfferAmount,
  extractOfferCurrency,
  priceQuote,
  selectOffer,
} from "@/lib/flexible-payments";

function resultShape(value: unknown) {
  if (Array.isArray(value)) return { type: "array", length: value.length };
  if (!value || typeof value !== "object") return { type: typeof value };
  const object = value as Record<string, unknown>;
  const keys = Object.keys(object).slice(0, 12);
  return {
    type: "object",
    keys,
    nested: Object.fromEntries(
      keys
        .filter((key) => object[key] && typeof object[key] === "object")
        .slice(0, 5)
        .map((key) => [
          key,
          Array.isArray(object[key])
            ? { type: "array", length: (object[key] as unknown[]).length }
            : { type: "object", keys: Object.keys(object[key] as Record<string, unknown>).slice(0, 8) },
        ]),
    ),
  };
}

export async function POST(request: Request) {
  try {
    const input = QuoteCreateInput.parse(await request.json());
    const { customer, supabase } = await requireAgentCustomer(request);

    const { data: search, error: searchError } = await supabase
      .from("flight_searches")
      .select("*")
      .eq("id", input.search_id)
      .eq("customer_id", customer.id)
      .single();
    if (searchError) throw searchError;

    if (input.booking_type === "flexible") {
      const { data: kyc, error: kycError } = await supabase
        .from("kyc_sessions")
        .select("status")
        .eq("customer_id", customer.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (kycError) throw kycError;
      if (kyc?.status !== "VERIFIED") {
        return NextResponse.json(
          { error: "KYC verification is required for flexible payment" },
          { status: 409 },
        );
      }
    }

    const offer = selectOffer(search.results, input.offer_index, input.offer);
    if (!offer) {
      console.warn("[quotes.create]", {
        stage: "offer_not_found",
        search_id: search.id,
        customer_id: customer.id,
        offer_index: input.offer_index ?? 0,
        result_shape: resultShape(search.results),
      });
      return NextResponse.json(
        {
          error: "Selected flight offer was not found",
          result_shape: resultShape(search.results),
        },
        { status: 404 },
      );
    }

    const baseAmount =
      input.base_amount ??
      extractOfferAmount(offer) ??
      extractOfferAmount(search.results);
    if (!baseAmount) {
      console.warn("[quotes.create]", {
        stage: "price_not_found",
        search_id: search.id,
        customer_id: customer.id,
        offer_index: input.offer_index ?? 0,
        offer_shape: resultShape(offer),
        result_shape: resultShape(search.results),
      });
      return NextResponse.json(
        {
          error: "Unable to determine offer price; pass base_amount",
          offer_shape: resultShape(offer),
          result_shape: resultShape(search.results),
        },
        { status: 400 },
      );
    }

    const currency = extractOfferCurrency(offer, input.currency);
    const pricing = priceQuote({
      origin: search.origin,
      destination: search.destination,
      departureDate: search.departure_date,
      baseAmount,
      currency,
      bookingType: input.booking_type,
      installmentCount: input.installment_count,
    });
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from("quotes")
      .insert({
        customer_id: customer.id,
        search_id: search.id,
        provider: "taketrips",
        provider_reference: crypto.randomUUID(),
        currency,
        base_amount: pricing.base_amount,
        total_amount: pricing.total_amount,
        deposit_amount: pricing.deposit_amount,
        installment_amount: pricing.installment_amount,
        rule_version: pricing.rule_version,
        version: 1,
        status: "ACTIVE",
        expires_at: expiresAt,
        details: {
          offer,
          search: {
            origin: search.origin,
            destination: search.destination,
            departure_date: search.departure_date,
            return_date: search.return_date,
            trip_type: search.trip_type,
            passenger_count: search.passenger_count,
            cabin_class: search.cabin_class,
          },
          booking_type: input.booking_type,
          pricing,
        },
      })
      .select("*")
      .single();
    if (error) throw error;

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    return error instanceof z.ZodError ? bad(error) : failure(error);
  }
}
