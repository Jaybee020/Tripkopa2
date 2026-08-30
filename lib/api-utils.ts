import { NextResponse } from "next/server";
import { z } from "zod";
import { LOCAL_ROUTE_UNAVAILABLE_MESSAGE } from "@/lib/airport-regions";

type ApiError = Record<string, unknown> & { status?: number; message?: string };

function positiveNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function ngn(value: unknown) {
  const amount = positiveNumber(value);
  return amount === null
    ? null
    : `₦${amount.toLocaleString("en-NG", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;
}

function dateDetail(value: unknown) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? value
    : null;
}

export function customerErrorMessage(error: unknown) {
  const value = error as ApiError;
  const maximumInstallments = Number(value?.maximum_installments);
  const minimumDays = Number(value?.minimum_days_before_departure) || 21;
  const earliestDeparture = dateDetail(value?.earliest_eligible_departure_date);
  const latestDeparture = dateDetail(value?.latest_eligible_departure_date);
  const repaymentDeadline = dateDetail(value?.repayment_deadline);
  const maximumWeeks = positiveNumber(value?.maximum_weeks);
  const totalAmount = ngn(value?.total_amount);
  const financingCap = ngn(value?.financing_cap);
  switch (value?.code) {
    case "LOCAL_ROUTES_UNAVAILABLE":
      return LOCAL_ROUTE_UNAVAILABLE_MESSAGE;
    case "FLEXIBLE_PAYMENT_TOO_CLOSE_TO_DEPARTURE":
      return `This trip is too close to departure for a repayment plan. Flexible payment requires departure at least ${minimumDays} days from today${earliestDeparture ? `, so choose ${earliestDeparture} or later` : ""}. You can keep this flight and pay in full, or I can search later dates.`;
    case "INSTALLMENT_COUNT_INFEASIBLE":
      return maximumInstallments > 0
        ? `That repayment schedule will not fit before the required completion date${repaymentDeadline ? ` of ${repaymentDeadline}` : ""}. Up to ${maximumInstallments} repayments fit. I can generate a plan with that count, or you can choose a later flight or pay in full.`
        : "There is not enough time to complete a repayment schedule before the required date. You can pay in full or choose a later flight.";
    case "INSTALLMENT_LIMIT":
      return maximumInstallments > 0
        ? `This route allows up to ${maximumInstallments} repayments. Please choose that number or fewer.`
        : "The requested number of repayments is not available for this route.";
    case "FINANCING_CAP_EXCEEDED":
      return totalAmount && financingCap
        ? `This flight's flexible-payment total is ${totalAmount}, which is above your current available flexible-payment amount of ${financingCap} for this trip. You can keep this flight and pay in full, or I can look for a lower-priced flight that may qualify.`
        : "This fare is above your current available flexible-payment amount for this trip. You can keep this flight and pay in full, or I can look for a lower-priced flight that may qualify.";
    case "FINANCING_WINDOW_EXCEEDED":
      return `This departure is beyond the flexible-payment booking window${maximumWeeks ? ` of ${maximumWeeks} weeks` : ""}${latestDeparture ? `; choose a departure on or before ${latestDeparture}` : ""}. You can choose an earlier flight or keep this flight and pay in full.`;
    case "POST_TRAVEL_LIMIT":
      return "The full balance must be completed before travel. I can restructure the repayments so the final payment is due at least 10 days before departure.";
    case "SCHEDULE_TOTAL_MISMATCH":
      return "The proposed repayments do not add up to the balance after the initial deposit. I can recalculate an even schedule using the same approved dates.";
    case "REPAYMENT_DEADLINE_EXCEEDED":
      return "All pre-travel repayments must be completed at least 10 days before departure. Please choose an earlier repayment date.";
    case "KYC_REQUIRED":
      return "Identity verification must be confirmed before a flexible payment plan can be prepared. If you have just completed verification, I’ll recheck your status and continue without restarting your booking.";
    case "ROUTE_UNMAPPED":
      return "I could not classify the departure or destination for flexible payment. This does not mean the route is unavailable. Please confirm the airport codes so I can check again; full payment remains available.";
    case "OFFER_NOT_FOUND":
      return "The selected fare is no longer present in this search. I can refresh the same trip and show the closest available options without restarting your booking details.";
    case "OFFER_PRICE_REQUIRED":
      return "I could not confirm the complete payable amount for this fare. I’ll retrieve the saved search and verify the price before preparing a payment plan.";
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
    "latest_eligible_departure_date",
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
