import { classifyRoute, type RouteCategory } from "./airport-regions";
import {
  DEFAULT_FINANCING_RULES,
  type FinancingRules,
  type TrustTier,
} from "./financing-rules";

export type BookingType = "full" | "flexible";

export type QuotePricingInput = {
  origin: string;
  destination: string;
  departureDate: string;
  baseAmount: number;
  currency: string;
  bookingType: BookingType;
  installmentCount?: number;
  trustTier?: TrustTier;
  rules?: FinancingRules;
  repaymentPlanRequest?: RepaymentPlanRequest;
  travelCompletionDate?: string;
  rescaleCustomPlan?: boolean;
};

export type RepaymentFrequency = "weekly" | "monthly";
export type RepaymentPhase = "PRE_TRAVEL" | "POST_TRAVEL";
export type RepaymentPlanRequest =
  | {
      mode: "generated";
      frequency: RepaymentFrequency;
      installment_count: number;
      post_travel?: {
        percentage: number;
        frequency: RepaymentFrequency;
        installment_count: number;
      };
    }
  | {
      mode: "custom";
      installments: Array<{
        amount: number;
        due_date: string;
        phase?: RepaymentPhase;
      }>;
    };

export type RepaymentPlan = {
  deposit_amount: number;
  installments: Array<{
    sequence_number: number;
    due_date: string;
    amount: number;
    phase: RepaymentPhase;
  }>;
  markup_rate: number;
  minimum_deposit_rate: number;
  repayment_window_weeks: number;
  repayment_deadline: string;
  generated_deadline: string;
  grace_deadline: string;
  post_travel_amount: number;
  post_travel_deadline: string | null;
  plan_mode: "generated" | "custom";
  frequency: RepaymentFrequency | null;
  request_snapshot: RepaymentPlanRequest;
};

export type QuotePricing = {
  base_amount: number;
  total_amount: number;
  deposit_amount: number | null;
  installment_amount: number | null;
  rule_version: string;
  route_category: RouteCategory | null;
  trust_tier: TrustTier | null;
  financing_cap: number | null;
  repayment_plan: RepaymentPlan | null;
};

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function numericAmount(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[^\d.]/g, ""));
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return null;
}

export function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function weeksUntil(date: string) {
  const departure = new Date(`${date}T00:00:00.000Z`);
  const now = new Date();
  const diff = departure.getTime() - now.getTime();
  return Math.max(1, Math.ceil(diff / (7 * 24 * 60 * 60 * 1000)));
}

function utcDate(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw Object.assign(new Error("A valid ISO date is required"), { status: 400 });
  }
  return date;
}

function addMonths(date: Date, months: number) {
  const next = new Date(date);
  const day = next.getUTCDate();
  next.setUTCDate(1);
  next.setUTCMonth(next.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
  next.setUTCDate(Math.min(day, lastDay));
  return next;
}

function markupRate(rules: FinancingRules, category: RouteCategory, weeks: number) {
  const bracket = rules.markup[category].find(([maximumWeeks]) => weeks <= maximumWeeks);
  if (!bracket) {
    throw Object.assign(
      new Error(`Flexible payment cannot exceed ${rules.max_financing_weeks[category]} weeks for this route`),
      { status: 422, code: "FINANCING_WINDOW_EXCEEDED", route_category: category },
    );
  }
  return bracket[1];
}

export function splitEvenly(total: number, count: number) {
  const cents = Math.round(total * 100);
  const base = Math.floor(cents / count);
  const remainder = cents - base * count;
  return Array.from({ length: count }, (_, index) =>
    roundMoney((base + (index < remainder ? 1 : 0)) / 100),
  );
}

function splitProportionally(total: number, weights: number[]) {
  const totalCents = Math.round(total * 100);
  const weightTotal = weights.reduce((sum, value) => sum + value, 0);
  const raw = weights.map((weight) => totalCents * weight / weightTotal);
  const cents = raw.map(Math.floor);
  const remainder = totalCents - cents.reduce((sum, value) => sum + value, 0);
  const order = raw.map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction);
  for (let index = 0; index < remainder; index += 1) cents[order[index].index] += 1;
  return cents.map((value) => roundMoney(value / 100));
}

function generatedDates(
  count: number,
  frequency: RepaymentFrequency,
  finalDate: Date,
  afterDate: Date,
) {
  const dates = Array.from({ length: count }, (_, index) => {
    const offset = count - index - 1;
    return frequency === "weekly"
      ? addDays(finalDate, -7 * offset)
      : addMonths(finalDate, -offset);
  });
  if (dates.some((date) => date.getTime() <= afterDate.getTime())) {
    throw Object.assign(
      new Error("The requested installment count does not fit before the repayment deadline"),
      { status: 422, code: "INSTALLMENT_COUNT_INFEASIBLE" },
    );
  }
  return dates;
}

function assertCount(count: number, maximum: number) {
  if (!Number.isInteger(count) || count < 1 || count > maximum) {
    throw Object.assign(
      new Error(`Choose between 1 and ${maximum} installments for this route`),
      { status: 422, code: "INSTALLMENT_LIMIT", maximum_installments: maximum },
    );
  }
}

export function priceQuote(input: QuotePricingInput): QuotePricing {
  if (!Number.isFinite(input.baseAmount) || input.baseAmount <= 0) {
    throw Object.assign(new Error("A positive base_amount is required"), {
      status: 400,
    });
  }

  const rules = input.rules ?? DEFAULT_FINANCING_RULES;

  if (input.bookingType === "full") {
    return {
      base_amount: roundMoney(input.baseAmount),
      total_amount: roundMoney(input.baseAmount * (1 + rules.full_service_fee_rate)),
      deposit_amount: null,
      installment_amount: null,
      rule_version: rules.rule_version,
      route_category: null,
      trust_tier: null,
      financing_cap: null,
      repayment_plan: null,
    };
  }

  const category = classifyRoute(input.origin, input.destination);
  const tier = input.trustTier ?? "OBSERVER";
  const weeks = weeksUntil(input.departureDate);
  const rate = markupRate(rules, category, weeks);
  const total = roundMoney(input.baseAmount * (1 + rate));
  const financingCap = rules.financing_caps[tier][category];
  if (total > financingCap) {
    throw Object.assign(
      new Error(`This quote exceeds the ${tier.toLowerCase()} financing limit for this route`),
      { status: 422, code: "FINANCING_CAP_EXCEEDED", financing_cap: financingCap, total_amount: total },
    );
  }
  const depositRate = rules.deposit_rates[tier][category];
  const deposit = roundMoney(total * depositRate);
  const remaining = roundMoney(total - deposit);
  const departure = utcDate(input.departureDate);
  const today = utcDate(isoDate(new Date()));
  const repaymentDeadline = addDays(departure, -rules.repayment_due_days_before_departure);
  const generatedDeadline = addDays(departure, -rules.generated_due_days_before_departure);
  const graceHardStop = addDays(departure, -rules.grace_hard_stop_days_before_departure);
  const travelCompletion = utcDate(input.travelCompletionDate || input.departureDate);
  const postTravelDeadline = addDays(travelCompletion, rules.post_travel_max_days);
  const maximum = rules.max_installments[category];
  const request = input.repaymentPlanRequest ?? {
    mode: "generated" as const,
    frequency: "weekly" as const,
    installment_count: input.installmentCount || Math.min(4, maximum),
  };

  let installments: RepaymentPlan["installments"];
  let postTravelAmount = 0;
  let frequency: RepaymentFrequency | null = null;

  if (request.mode === "generated") {
    const postCount = request.post_travel?.installment_count ?? 0;
    assertCount(request.installment_count + postCount, maximum);
    const requestedPostRate = (request.post_travel?.percentage ?? 0) / 100;
    const allowedPostRate = rules.post_travel_rates[tier];
    if (requestedPostRate < 0 || requestedPostRate > allowedPostRate) {
      throw Object.assign(new Error("Requested post-travel balance exceeds this trust tier's allowance"), {
        status: 422,
        code: "POST_TRAVEL_LIMIT",
        maximum_percentage: allowedPostRate * 100,
      });
    }
    postTravelAmount = roundMoney(total * requestedPostRate);
    const preTravelAmount = roundMoney(remaining - postTravelAmount);
    const preDates = generatedDates(request.installment_count, request.frequency, generatedDeadline, today);
    const preAmounts = splitEvenly(preTravelAmount, request.installment_count);
    installments = preAmounts.map((amount, index) => ({
      sequence_number: index + 1,
      due_date: isoDate(preDates[index]),
      amount,
      phase: "PRE_TRAVEL",
    }));
    if (request.post_travel) {
      if (request.post_travel.percentage <= 0) {
        throw Object.assign(new Error("Post-travel percentage must be positive"), { status: 422 });
      }
      const postDates = generatedDates(
        request.post_travel.installment_count,
        request.post_travel.frequency,
        postTravelDeadline,
        travelCompletion,
      );
      const postAmounts = splitEvenly(postTravelAmount, request.post_travel.installment_count);
      installments.push(...postAmounts.map((amount, index) => ({
        sequence_number: installments.length + index + 1,
        due_date: isoDate(postDates[index]),
        amount,
        phase: "POST_TRAVEL" as const,
      })));
    }
    frequency = request.frequency;
  } else {
    assertCount(request.installments.length, maximum);
    const sorted = [...request.installments].sort((a, b) => a.due_date.localeCompare(b.due_date));
    if (sorted.some((item, index) => item !== request.installments[index])) {
      throw Object.assign(new Error("Custom installment dates must be in ascending order"), { status: 422 });
    }
    const totalScheduled = roundMoney(request.installments.reduce((sum, item) => sum + item.amount, 0));
    if (totalScheduled !== remaining) {
      if (!input.rescaleCustomPlan) {
        throw Object.assign(new Error("Custom installment amounts must equal the post-deposit balance"), {
          status: 422,
          code: "SCHEDULE_TOTAL_MISMATCH",
          required_amount: remaining,
          scheduled_amount: totalScheduled,
        });
      }
    }
    const customAmounts = totalScheduled === remaining
      ? request.installments.map((item) => item.amount)
      : splitProportionally(remaining, request.installments.map((item) => item.amount));
    let previous = "";
    installments = request.installments.map((item, index) => {
      if (!Number.isFinite(item.amount) || item.amount <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(item.due_date)) {
        throw Object.assign(new Error("Each custom installment needs a positive amount and ISO due date"), { status: 422 });
      }
      if (item.due_date <= isoDate(today) || item.due_date === previous) {
        throw Object.assign(new Error("Custom installment dates must be unique future dates"), { status: 422 });
      }
      previous = item.due_date;
      const phase = item.phase ?? "PRE_TRAVEL";
      const date = utcDate(item.due_date);
      if (phase === "PRE_TRAVEL" && date > repaymentDeadline) {
        throw Object.assign(new Error("Pre-travel repayments must finish at least 10 days before departure"), { status: 422 });
      }
      if (phase === "POST_TRAVEL" && (date <= travelCompletion || date > postTravelDeadline)) {
        throw Object.assign(new Error("Post-travel repayments must be after travel and within 90 days"), { status: 422 });
      }
      return { sequence_number: index + 1, due_date: item.due_date, amount: customAmounts[index], phase };
    });
    postTravelAmount = roundMoney(installments.filter((item) => item.phase === "POST_TRAVEL").reduce((sum, item) => sum + item.amount, 0));
    const allowedPostAmount = roundMoney(total * rules.post_travel_rates[tier]);
    if (postTravelAmount > allowedPostAmount) {
      throw Object.assign(new Error("Custom post-travel balance exceeds this trust tier's allowance"), {
        status: 422,
        code: "POST_TRAVEL_LIMIT",
        maximum_amount: allowedPostAmount,
      });
    }
  }

  const finalPreTravel = installments.filter((item) => item.phase === "PRE_TRAVEL").at(-1);
  const proposedGrace = finalPreTravel
    ? addDays(utcDate(finalPreTravel.due_date), rules.grace_period_days)
    : repaymentDeadline;
  const graceDeadline = proposedGrace < graceHardStop ? proposedGrace : graceHardStop;

  return {
    base_amount: roundMoney(input.baseAmount),
    total_amount: total,
    deposit_amount: deposit,
    installment_amount: installments[0]?.amount ?? null,
    rule_version: rules.rule_version,
    route_category: category,
    trust_tier: tier,
    financing_cap: financingCap,
    repayment_plan: {
      deposit_amount: deposit,
      installments,
      markup_rate: rate,
      minimum_deposit_rate: depositRate,
      repayment_window_weeks: weeks,
      repayment_deadline: isoDate(repaymentDeadline),
      generated_deadline: isoDate(generatedDeadline),
      grace_deadline: isoDate(graceDeadline),
      post_travel_amount: postTravelAmount,
      post_travel_deadline: postTravelAmount > 0 ? isoDate(postTravelDeadline) : null,
      plan_mode: request.mode,
      frequency,
      request_snapshot: request,
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
    const amount = numericAmount(value);
    if (amount) return amount;
  }

  return findLikelyAmount(offer);
}

function findLikelyAmount(value: unknown, path: string[] = []): number | null {
  if (!value || typeof value !== "object") return null;
  if (path.length > 5) return null;

  const preferredKeys = new Set([
    "total",
    "total_amount",
    "totalamount",
    "totalprice",
    "totalfare",
    "grandtotal",
    "flexitotal",
    "amount",
    "price",
    "fare",
    "payableamount",
    "customerprice",
  ]);
  const ignoredKeys = new Set([
    "id",
    "routeid",
    "carrierid",
    "conversionrate",
    "rate",
    "rates",
    "adult",
    "children",
    "infant",
    "duration",
    "totaltripduration",
    "numberofstops",
    "weight",
    "count",
  ]);

  const entries = Object.entries(value as Record<string, unknown>);
  for (const [key, child] of entries) {
    const normalized = key.replace(/[_\-\s]/g, "").toLowerCase();
    if (ignoredKeys.has(normalized)) continue;
    if (preferredKeys.has(normalized)) {
      const amount = numericAmount(child);
      if (amount) return amount;
    }
  }

  for (const [key, child] of entries) {
    const normalized = key.replace(/[_\-\s]/g, "").toLowerCase();
    if (ignoredKeys.has(normalized)) continue;
    if (Array.isArray(child)) {
      for (const item of child.slice(0, 3)) {
        const amount = findLikelyAmount(item, [...path, key]);
        if (amount) return amount;
      }
    } else if (child && typeof child === "object") {
      const amount = findLikelyAmount(child, [...path, key]);
      if (amount) return amount;
    }
  }

  return null;
}

export function extractOfferCurrency(offer: unknown, fallback = "NGN") {
  const candidates = [
    ["price", "conversion", "rates", "BASE"],
    ["details", "price", "conversion", "rates", "BASE"],
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
    if (typeof value === "string" && value.trim().length === 3) {
      return value.trim().toUpperCase();
    }
  }

  return fallback.trim().toUpperCase();
}

function isNonEmptyObject(value: unknown): value is Record<string, unknown> {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value as Record<string, unknown>).length > 0
  );
}

export function listOffers(results: unknown): unknown[] {
  if (Array.isArray(results)) return results;
  if (!isNonEmptyObject(results) || results.status === false) return [];
  const collections = [
    results.offers,
    results.flightOffers,
    results.flight_offers,
    results.flights,
    results.results,
    results.details,
    results.data,
    results.items,
    isNonEmptyObject(results.data) ? results.data.offers : undefined,
    isNonEmptyObject(results.data) ? results.data.flightOffers : undefined,
    isNonEmptyObject(results.details) ? results.details.offers : undefined,
    isNonEmptyObject(results.details) ? results.details.flightOffers : undefined,
  ];
  for (const collection of collections) {
    if (Array.isArray(collection)) return collection;
  }
  if (isNonEmptyObject(results.details)) return [results.details];
  if (isNonEmptyObject(results.data)) return [results.data];
  return [results];
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
      object.details,
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
