const NG_AIRPORTS = new Set([
  "ABV",
  "LOS",
  "PHC",
  "KAN",
  "ENU",
  "QOW",
  "CBQ",
  "BNI",
  "ABB",
  "MIU",
  "YOL",
  "SKO",
]);

export type BookingType = "full" | "flexible";

export type QuotePricingInput = {
  origin: string;
  destination: string;
  departureDate: string;
  baseAmount: number;
  currency: string;
  bookingType: BookingType;
  installmentCount?: number;
};

export type RepaymentPlan = {
  deposit_amount: number;
  installments: Array<{
    sequence_number: number;
    due_date: string;
    amount: number;
  }>;
  markup_rate: number;
  minimum_deposit_rate: number;
  repayment_window_weeks: number;
};

export type QuotePricing = {
  base_amount: number;
  total_amount: number;
  deposit_amount: number | null;
  installment_amount: number | null;
  rule_version: string;
  repayment_plan: RepaymentPlan | null;
};

const RULE_VERSION = "flex_mvp_2026_08";
const FULL_SERVICE_FEE_RATE = 0.05;
const FLEX_DEPOSIT_RATE = 0.3;

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function weeksUntil(date: string) {
  const departure = new Date(`${date}T00:00:00.000Z`);
  const now = new Date();
  const diff = departure.getTime() - now.getTime();
  return Math.max(1, Math.ceil(diff / (7 * 24 * 60 * 60 * 1000)));
}

function routeKind(origin: string, destination: string) {
  return NG_AIRPORTS.has(origin.toUpperCase()) &&
    NG_AIRPORTS.has(destination.toUpperCase())
    ? "domestic"
    : "regional_international";
}

function markupRate(kind: string, weeks: number) {
  if (weeks <= 5) return 0.075;
  if (weeks <= 9) return 0.1;
  if (weeks <= 12) return 0.125;
  if (kind === "domestic") return 0.125;
  if (weeks <= 17) return 0.175;
  if (weeks <= 21) return 0.225;
  return 0.275;
}

function maxInstallments(kind: string) {
  return kind === "domestic" ? 4 : 8;
}

export function splitEvenly(total: number, count: number) {
  const cents = Math.round(total * 100);
  const base = Math.floor(cents / count);
  const remainder = cents - base * count;
  return Array.from({ length: count }, (_, index) =>
    roundMoney((base + (index < remainder ? 1 : 0)) / 100),
  );
}

export function priceQuote(input: QuotePricingInput): QuotePricing {
  if (!Number.isFinite(input.baseAmount) || input.baseAmount <= 0) {
    throw Object.assign(new Error("A positive base_amount is required"), {
      status: 400,
    });
  }

  const kind = routeKind(input.origin, input.destination);
  const weeks = weeksUntil(input.departureDate);

  if (input.bookingType === "full") {
    return {
      base_amount: roundMoney(input.baseAmount),
      total_amount: roundMoney(input.baseAmount * (1 + FULL_SERVICE_FEE_RATE)),
      deposit_amount: null,
      installment_amount: null,
      rule_version: RULE_VERSION,
      repayment_plan: null,
    };
  }

  const installmentCount = Math.min(
    Math.max(input.installmentCount || Math.min(4, maxInstallments(kind)), 1),
    maxInstallments(kind),
  );
  const total = roundMoney(input.baseAmount * (1 + markupRate(kind, weeks)));
  const deposit = roundMoney(total * FLEX_DEPOSIT_RATE);
  const remaining = roundMoney(total - deposit);
  const installmentAmounts = splitEvenly(remaining, installmentCount);
  const firstDue = addDays(new Date(), 7);

  return {
    base_amount: roundMoney(input.baseAmount),
    total_amount: total,
    deposit_amount: deposit,
    installment_amount: installmentAmounts[0] ?? null,
    rule_version: RULE_VERSION,
    repayment_plan: {
      deposit_amount: deposit,
      installments: installmentAmounts.map((amount, index) => ({
        sequence_number: index + 1,
        due_date: isoDate(addDays(firstDue, index * 7)),
        amount,
      })),
      markup_rate: markupRate(kind, weeks),
      minimum_deposit_rate: FLEX_DEPOSIT_RATE,
      repayment_window_weeks: weeks,
    },
  };
}

export function extractOfferAmount(offer: unknown): number | null {
  const candidates = [
    ["total_amount"],
    ["totalAmount"],
    ["amount"],
    ["price"],
    ["fare"],
    ["total"],
    ["grandTotal"],
    ["flexiTotal"],
    ["details", "total"],
    ["details", "price", "total"],
    ["details", "price", "grandTotal"],
    ["details", "price", "flexiTotal"],
    ["details", "price", "amount"],
    ["pricing", "total"],
    ["pricing", "total_amount"],
    ["price", "total"],
    ["price", "amount"],
    ["price", "grandTotal"],
    ["price", "flexiTotal"],
  ];

  for (const path of candidates) {
    let value = offer as unknown;
    for (const key of path) {
      value =
        value && typeof value === "object"
          ? (value as Record<string, unknown>)[key]
          : undefined;
    }
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const parsed = Number(value.replace(/[^\d.]/g, ""));
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
  }

  return null;
}

export function extractOfferCurrency(offer: unknown, fallback = "NGN") {
  const candidates = [
    ["currency"],
    ["details", "currency"],
    ["details", "price", "currency"],
    ["price", "currency"],
  ];

  for (const path of candidates) {
    let value = offer as unknown;
    for (const key of path) {
      value =
        value && typeof value === "object"
          ? (value as Record<string, unknown>)[key]
          : undefined;
    }
    if (typeof value === "string" && value.length === 3) {
      return value.toUpperCase();
    }
  }

  return fallback;
}

function isNonEmptyObject(value: unknown): value is Record<string, unknown> {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value as Record<string, unknown>).length > 0
  );
}

export function selectOffer(
  results: unknown,
  offerIndex?: number,
  offer?: unknown,
) {
  if (
    offer &&
    (typeof offer !== "object" ||
      Array.isArray(offer) ||
      Object.keys(offer as Record<string, unknown>).length > 0)
  ) {
    return offer;
  }
  const index = offerIndex ?? 0;
  if (Array.isArray(results)) return results[index];
  if (results && typeof results === "object") {
    const object = results as Record<string, unknown>;
    if (object.status === false) return null;
    const collections = [
      object.offers,
      object.flightOffers,
      object.flight_offers,
      object.flights,
      object.results,
      object.data,
      object.items,
      isNonEmptyObject(object.data) ? (object.data as Record<string, unknown>).offers : undefined,
      isNonEmptyObject(object.data) ? (object.data as Record<string, unknown>).flightOffers : undefined,
      isNonEmptyObject(object.details) ? (object.details as Record<string, unknown>).offers : undefined,
      isNonEmptyObject(object.details) ? (object.details as Record<string, unknown>).flightOffers : undefined,
    ];
    for (const collection of collections) {
      if (Array.isArray(collection)) return collection[index];
    }
    if (index === 0) {
      if (isNonEmptyObject(object.details)) return object.details;
      if (isNonEmptyObject(object.data)) return object.data;
      if (isNonEmptyObject(object)) return object;
    }
  }
  return null;
}
