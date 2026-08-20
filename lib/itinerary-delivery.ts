type JsonRecord = Record<string, unknown>;

export type CustomerBookingRow = JsonRecord & {
  id: string;
  customer_id: string;
  quote_id: string;
  booking_type: string;
  status: string;
  currency: string;
  total_amount: number | string;
  deposit_amount?: number | string | null;
  amount_paid: number | string;
  balance_amount: number | string;
  passengers?: unknown;
  flight_details?: unknown;
  ticket_type?: string | null;
};

function record(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function firstText(...values: unknown[]) {
  for (const value of values) {
    const candidate = text(value);
    if (candidate) return candidate;
  }
  return null;
}

function money(value: unknown) {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : 0;
}

function passengerName(value: unknown) {
  const passenger = record(value);
  if (!passenger) return null;
  const displayName = text(passenger.name ?? passenger.full_name ?? passenger.fullName);
  if (displayName) return displayName;
  const parts = [
    passenger.first_name ?? passenger.firstName,
    passenger.middle_name ?? passenger.middleName,
    passenger.last_name ?? passenger.lastName,
  ].map(text).filter((part): part is string => Boolean(part));
  return parts.length ? parts.join(" ") : null;
}

function findRouteContainer(value: unknown, depth = 0): JsonRecord | null {
  const object = record(value);
  if (!object || depth > 7) return null;
  if (Array.isArray(object.outgoingRoutes) || Array.isArray(object.returnRoutes)) {
    return object;
  }
  for (const [key, child] of Object.entries(object)) {
    if (["price", "pricing", "rules", "fareRules", "fare_rules"].includes(key)) continue;
    const found = findRouteContainer(child, depth + 1);
    if (found) return found;
  }
  return null;
}

function timestamp(value: unknown) {
  const item = record(value);
  return firstText(item?.timestamp, item?.dateTime, item?.date_time, value);
}

function airport(value: unknown) {
  const item = record(value);
  return firstText(item?.iataCode, item?.iata_code, item?.airport, value);
}

function summarizeFlight(flightDetails: unknown) {
  const routes = findRouteContainer(flightDetails);
  const outgoing = Array.isArray(routes?.outgoingRoutes) ? routes.outgoingRoutes : [];
  const returning = Array.isArray(routes?.returnRoutes) ? routes.returnRoutes : [];
  const segments = [...outgoing, ...returning].map(record).filter(
    (segment): segment is JsonRecord => Boolean(segment),
  );
  const primaryJourney = (outgoing.length ? outgoing : segments)
    .map(record)
    .filter((segment): segment is JsonRecord => Boolean(segment));
  const first = primaryJourney[0] ?? record(flightDetails) ?? {};
  const last = primaryJourney.at(-1) ?? first;
  const departure = timestamp(first.departure ?? first.departureTime ?? first.departure_time);
  const arrival = timestamp(last.arrival ?? last.arrivalTime ?? last.arrival_time);
  const airlines = [...new Set(segments.map((segment) => firstText(
    segment.carrierName,
    segment.airlineName,
    segment.airline_name,
    segment.carrier,
    segment.carrierCode,
    segment.operatingCarrierCode,
  )).filter((name): name is string => Boolean(name)))];
  const details = record(flightDetails);

  return {
    airline_name: airlines.join(", ") || firstText(
      details?.airlineName,
      details?.airline_name,
      details?.carrier,
    ),
    route: {
      origin: airport(first.departure ?? first.origin),
      destination: airport(last.arrival ?? last.destination),
    },
    departure_date: departure?.slice(0, 10) ?? null,
    departure_time: departure?.includes("T") ? departure.slice(11) : departure,
    arrival_time: arrival?.includes("T") ? arrival.slice(11) : arrival,
    ticket_class: firstText(
      details?.cabinClass,
      details?.cabin_class,
      details?.ticketClass,
      details?.ticket_class,
    ),
  };
}

const RESTRICTED_ITINERARY_KEYS = new Set([
  "airlineconfirmationcode",
  "bookingreference",
  "confirmationcode",
  "pnr",
  "providerbookingid",
  "providerreference",
  "providerticketreference",
  "ticketnumber",
  "ticketreference",
]);

export function redactRestrictedItineraryFields(value: unknown, depth = 0): unknown {
  if (depth > 8) return null;
  if (Array.isArray(value)) {
    return value.map((item) => redactRestrictedItineraryFields(item, depth + 1));
  }
  const object = record(value);
  if (!object) return value;
  return Object.fromEntries(
    Object.entries(object)
      .filter(([key]) => !RESTRICTED_ITINERARY_KEYS.has(
        key.replace(/[_\-\s]/g, "").toLowerCase(),
      ))
      .map(([key, child]) => [key, redactRestrictedItineraryFields(child, depth + 1)]),
  );
}

export function isFullyRepaid(booking: CustomerBookingRow) {
  const total = money(booking.total_amount);
  return money(booking.balance_amount) === 0 && money(booking.amount_paid) >= total;
}

export function repaymentStatus(booking: CustomerBookingRow) {
  if (isFullyRepaid(booking)) return "PAID";
  if (money(booking.amount_paid) === 0) return "PENDING";
  if (
    booking.booking_type === "flexible" &&
    money(booking.amount_paid) >= money(booking.deposit_amount)
  ) return "ACTIVE";
  return "PARTIALLY_PAID";
}

export function toCustomerBooking(booking: CustomerBookingRow) {
  return {
    id: booking.id,
    customer_id: booking.customer_id,
    quote_id: booking.quote_id,
    booking_type: booking.booking_type,
    status: booking.status,
    currency: booking.currency,
    total_amount: booking.total_amount,
    deposit_amount: booking.deposit_amount ?? null,
    amount_paid: booking.amount_paid,
    balance_amount: booking.balance_amount,
    ticket_type: booking.ticket_type ?? null,
    departure_date: booking.departure_date ?? null,
    travel_completion_date: booking.travel_completion_date ?? null,
    repayment_deadline: booking.repayment_deadline ?? null,
    passenger_names: Array.isArray(booking.passengers)
      ? booking.passengers.map(passengerName).filter((name): name is string => Boolean(name))
      : [],
  };
}

export function buildPartialItinerary(booking: CustomerBookingRow) {
  return {
    booking_id: booking.id,
    release_level: "PARTIAL" as const,
    passenger_names: Array.isArray(booking.passengers)
      ? booking.passengers.map(passengerName).filter((name): name is string => Boolean(name))
      : [],
    ...summarizeFlight(booking.flight_details),
    ticket_type: booking.ticket_type ?? null,
    repayment_status: repaymentStatus(booking),
    total_payable_amount: booking.total_amount,
    initial_deposit: booking.deposit_amount ?? booking.total_amount,
    outstanding_balance: booking.balance_amount,
    currency: booking.currency,
  };
}
