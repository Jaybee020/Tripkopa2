import { NextResponse } from "next/server";
import { z } from "zod";

type ApiError = Record<string, unknown> & { status?: number; message?: string };

export function customerErrorMessage(error: unknown) {
  const value = error as ApiError;
  const maximumInstallments = Number(value?.maximum_installments);
  const minimumDays = Number(value?.minimum_days_before_departure) || 21;
  switch (value?.code) {
    case "FLEXIBLE_PAYMENT_TOO_CLOSE_TO_DEPARTURE":
      return `This trip is too close to departure for a repayment plan. Flexible payment is available for flights departing at least ${minimumDays} days from today. You can pay in full or choose a later flight.`;
    case "INSTALLMENT_COUNT_INFEASIBLE":
      return maximumInstallments > 0
        ? `That repayment schedule will not fit before the required completion date. Up to ${maximumInstallments} repayments fit, with payment completed at least 10 days before departure.`
        : "There is not enough time to complete a repayment schedule before the required date. You can pay in full or choose a later flight.";
    case "INSTALLMENT_LIMIT":
      return maximumInstallments > 0
        ? `This route allows up to ${maximumInstallments} repayments. Please choose that number or fewer.`
        : "The requested number of repayments is not available for this route.";
    case "FINANCING_CAP_EXCEEDED":
      return "This fare is above the amount currently available for a flexible payment plan on this route. You can pay in full or choose a lower-priced flight.";
    case "FINANCING_WINDOW_EXCEEDED":
      return "This departure is outside the available flexible-payment period for this route. You can choose an earlier flight or pay in full.";
    case "POST_TRAVEL_LIMIT":
      return "The full balance must be completed before travel. I can restructure the repayments so the final payment is due at least 10 days before departure.";
    case "SCHEDULE_TOTAL_MISMATCH":
      return "The proposed repayments do not add up to the balance after the initial deposit. I can recalculate an even schedule using the same approved dates.";
    case "REPAYMENT_DEADLINE_EXCEEDED":
      return "All pre-travel repayments must be completed at least 10 days before departure. Please choose an earlier repayment date.";
    case "KYC_REQUIRED":
      return "Identity verification must be completed before a flexible payment plan can be prepared.";
    case "ROUTE_UNMAPPED":
      return "I could not confirm the flexible-payment rules for this route. Please check the departure and destination locations.";
    default:
      return Number(value?.status || 500) >= 500
        ? "I’m having trouble completing that request right now. Please try again shortly."
        : value?.message || "I could not complete that request with the current details.";
  }
}

export function failure(error: unknown) {
  const e = error as ApiError;
  const detailKeys = [
    "code",
    "route_category",
    "maximum_installments",
    "maximum_weeks",
    "maximum_percentage",
    "maximum_amount",
    "financing_cap",
    "total_amount",
    "required_amount",
    "scheduled_amount",
    "requested_installments",
    "days_until_departure",
    "minimum_days_before_departure",
    "earliest_eligible_departure_date",
    "repayment_deadline",
  ];
  const details = Object.fromEntries(
    detailKeys.filter((key) => e?.[key] !== undefined).map((key) => [key, e[key]]),
  );
  return NextResponse.json(
    {
      error: e?.message || "Internal Server Error",
      customer_message: customerErrorMessage(error),
      ...details,
    },
    { status: e?.status || 500 },
  );
}
export function bad(error: z.ZodError) {
  const message = error.issues[0]?.message || "Invalid request";
  return NextResponse.json(
    { error: message, customer_message: message },
    { status: 400 },
  );
}
export async function body<T>(request: Request, schema: z.ZodType<T>): Promise<T> { return schema.parse(await request.json()); }
export function row(data: unknown) { return NextResponse.json(data); }
export function idFrom(value: string) { return value; }
