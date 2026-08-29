import { z } from "zod";
const Id = z.string().min(1);
const Any = z.unknown();
export const SignupInput = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  whatsapp_number: z.string().optional(),
  role: z.string().optional(),
});
export type SignupInput = z.infer<typeof SignupInput>;
export const SigninInput = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type SigninInput = z.infer<typeof SigninInput>;
export const RefreshTokenInput = z.object({ refresh_token: z.string().min(1) });
export type RefreshTokenInput = z.infer<typeof RefreshTokenInput>;
export const PasswordResetRequest = z.object({ email: z.string().email() });
export type PasswordResetRequest = z.infer<typeof PasswordResetRequest>;
export const PasswordResetConfirmation = z.object({
  access_token: Id,
  refresh_token: Id,
  password: z.string().min(8),
});
export type PasswordResetConfirmation = z.infer<
  typeof PasswordResetConfirmation
>;
export const AuthSession = z.object({
  user: Any.nullable(),
  session: Any.nullable(),
});
export type AuthSession = z.infer<typeof AuthSession>;
export const CurrentUser = z.object({ user: Any, customer: Any.nullable() });
export type CurrentUser = z.infer<typeof CurrentUser>;
export const CustomerProfileUpdate = z
  .object({
    title: z.preprocess(
      (value) => (typeof value === "string" ? value.toUpperCase() : value),
      z.enum(["MR", "MRS", "MISS", "MS", "DR"]).optional(),
    ),
    first_name: z.string().trim().min(1).max(100).optional(),
    middle_name: z.string().trim().min(1).max(100).nullable().optional(),
    last_name: z.string().trim().min(1).max(100).optional(),
    email: z.string().email().nullable().optional(),
    date_of_birth: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .optional(),
    gender: z.preprocess(
      (value) => (typeof value === "string" ? value.toUpperCase() : value),
      z.enum(["MALE", "FEMALE", "OTHER"]).nullable().optional(),
    ),
    preferred_currency: z
      .string()
      .length(3)
      .transform((value) => value.toUpperCase())
      .optional(),
  })
  .strict();
export type CustomerProfileUpdate = z.infer<typeof CustomerProfileUpdate>;
export const CustomerProfile = z
  .object({
    id: Id,
    whatsapp_number: z.string(),
    status: z.string(),
    title: z.string().nullable().optional(),
    first_name: z.string().nullable().optional(),
    middle_name: z.string().nullable().optional(),
    last_name: z.string().nullable().optional(),
    email: z.string().nullable().optional(),
    date_of_birth: z.string().nullable().optional(),
    gender: z.string().nullable().optional(),
    preferred_currency: z.string().optional(),
    profile_completed_at: z.string().nullable().optional(),
  })
  .passthrough();
export type CustomerProfile = z.infer<typeof CustomerProfile>;
export const KycSessionCreateInput = z.object({
  provider: z.string().default("qoreid"),
  purpose: z.string().default("identity_verification"),
});
export type KycSessionCreateInput = z.infer<typeof KycSessionCreateInput>;
export const KycTokenExchangeInput = z.object({ token: z.string().min(20) });
export type KycTokenExchangeInput = z.infer<typeof KycTokenExchangeInput>;
export const KycSession = z
  .object({
    id: Id,
    customer_id: Id,
    provider: z.string(),
    status: z.string(),
    expires_at: z.string(),
    url: z.string().optional(),
  })
  .passthrough();
export type KycSession = z.infer<typeof KycSession>;
export const KycBrowserSession = z
  .object({ session_id: Id, status: z.string(), expires_at: z.string() })
  .passthrough();
export type KycBrowserSession = z.infer<typeof KycBrowserSession>;
export const KycStatus = z.object({
  status: z.string(),
  session: Any.nullable(),
});
export type KycStatus = z.infer<typeof KycStatus>;
export const BvnVerificationInput = z.object({
  bvn: z.string().regex(/^\d{11}$/),
});
export type BvnVerificationInput = z.infer<typeof BvnVerificationInput>;
export const VirtualAccount = z
  .object({
    id: Id.optional(),
    account_number: z.string(),
    account_name: z.string(),
    bank_name: z.string(),
    status: z.string().optional(),
  })
  .passthrough();
export type VirtualAccount = z.infer<typeof VirtualAccount>;
const PositiveInt = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim() ? Number(value) : value,
  z.number().int().positive(),
);
const NonnegativeInt = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim() ? Number(value) : value,
  z.number().int().nonnegative(),
);
const BooleanInput = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  const normalized = value.trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  return value;
}, z.boolean());
export const FlightSearchInput = z.preprocess((value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }
  const input = value as Record<string, unknown>;
  const returnDate = input.return_date ?? input.returnDate ?? null;
  return {
    origin: input.origin ?? input.from,
    destination: input.destination ?? input.to,
    departure_date: input.departure_date ?? input.departureDate,
    return_date: returnDate,
    trip_type:
      input.trip_type ??
      input.tripType ??
      (returnDate ? "return" : "one_way"),
    passenger_count: input.passenger_count ?? input.adult ?? input.adult_count,
    adult_count: input.adult_count ?? input.adult ?? input.passenger_count,
    children_count: input.children_count ?? input.children,
    infant_count: input.infant_count ?? input.infant,
    cabin_class: input.cabin_class ?? input.cabinClass,
    direct: input.direct,
    all_providers: input.all_providers ?? input.allProviders,
    payment_preference: input.payment_preference ?? input.paymentPreference,
    ticket_type: input.ticket_type ?? input.ticketType,
  };
}, z.object({
  origin: z.string().min(3),
  destination: z.string().min(3),
  departure_date: z.string(),
  return_date: z.string().nullable().default(null),
  trip_type: z.enum(["one_way", "return"]).default("one_way"),
  passenger_count: PositiveInt.default(1),
  adult_count: PositiveInt.default(1),
  children_count: NonnegativeInt.default(0),
  infant_count: NonnegativeInt.default(0),
  cabin_class: z.string().default("Economy"),
  direct: BooleanInput.default(false),
  all_providers: BooleanInput.default(true),
  payment_preference: z.enum(["full", "flexible"]).default("full"),
  ticket_type: z.enum(["refundable", "nonrefundable", "any"]).default("any"),
}));
export type FlightSearchInput = z.infer<typeof FlightSearchInput>;

const FlightDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, {
  message: "Dates must use YYYY-MM-DD",
}).refine((value) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, { message: "Date is invalid" });

const LocationCode = z.string().trim().transform((value) => value.toUpperCase())
  .pipe(z.string().regex(/^[A-Z]{3}$/, {
    message: "Airport and city codes must be three-letter IATA codes",
  }));

export const FlexibleDateFlightSearchInput = z.preprocess((value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const input = value as Record<string, unknown>;
  const rawReturnDate = input.return_date ?? input.returnDate;
  return {
    ...input,
    origin_codes: input.origin_codes ?? input.origin_airports,
    destination: input.destination ?? input.destination_code,
    return_date:
      typeof rawReturnDate === "string" && rawReturnDate.trim() === ""
        ? null
        : rawReturnDate ?? null,
  };
}, z.object({
  origin_codes: z.array(LocationCode).min(1).max(5)
    .transform((airports) => [...new Set(airports)]),
  destination: LocationCode,
  departure_date: FlightDate,
  return_date: FlightDate.nullable().default(null),
  window_days: z.coerce.number().int().min(0).max(7).default(7),
  preserve_trip_length: BooleanInput.default(true),
  direct: BooleanInput.default(false),
  adult_count: PositiveInt.default(1),
  children_count: NonnegativeInt.default(0),
  infant_count: NonnegativeInt.default(0),
  cabin_class: z.string().trim().min(1).default("Economy"),
  all_providers: BooleanInput.default(true),
  ticket_type: z.enum(["refundable", "nonrefundable", "any"]).default("any"),
}).superRefine((value, context) => {
  if (value.return_date && value.return_date <= value.departure_date) {
    context.addIssue({
      code: "custom",
      path: ["return_date"],
      message: "Return date must be after departure date",
    });
  }
  if (value.origin_codes.includes(value.destination)) {
    context.addIssue({
      code: "custom",
      path: ["destination"],
      message: "Destination must differ from every origin airport or city code",
    });
  }
}));
export type FlexibleDateFlightSearchInput = z.infer<
  typeof FlexibleDateFlightSearchInput
>;

export const FlightSearch = z
  .object({
    id: Id,
    customer_id: Id,
    status: z.string(),
    results: Any,
    origin: z.string(),
    destination: z.string(),
  })
  .passthrough();
export type FlightSearch = z.infer<typeof FlightSearch>;
const PositiveOptionalNumber = z.preprocess(
  (value) =>
    value === 0 || value === "" || value === null ? undefined : value,
  z.number().positive().optional(),
);
const PositiveOptionalInt = z.preprocess(
  (value) =>
    value === 0 || value === "" || value === null ? undefined : value,
  z.number().int().positive().max(8).optional(),
);
const RepaymentInstallmentInput = z.object({
  amount: z.number().positive().optional(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  phase: z.enum(["PRE_TRAVEL", "POST_TRAVEL"]).optional(),
});
const GeneratedRepaymentPlanInput = z.object({
  mode: z.literal("generated"),
  frequency: z.enum(["weekly", "monthly"]),
  installment_count: z.number().int().positive().max(8),
  post_travel: z.object({
    percentage: z.number().positive().max(30),
    frequency: z.enum(["weekly", "monthly"]),
    installment_count: z.number().int().positive().max(8),
  }).optional(),
});
const CustomRepaymentPlanInput = z.object({
  mode: z.literal("custom"),
  installments: z.array(RepaymentInstallmentInput).min(1).max(8),
});
export const RepaymentPlanRequestInput = z.discriminatedUnion("mode", [
  GeneratedRepaymentPlanInput,
  CustomRepaymentPlanInput,
]);
export type RepaymentPlanRequestInput = z.infer<typeof RepaymentPlanRequestInput>;
export const QuoteCreateInput = z
  .object({
    search_id: Id,
    booking_type: z.enum(["full", "flexible"]).default("full"),
    offer_index: z.number().int().nonnegative().optional(),
    offer: Any.optional(),
    base_amount: PositiveOptionalNumber,
    currency: z.string().length(3).default("NGN"),
    installment_count: PositiveOptionalInt,
    repayment_plan_request: RepaymentPlanRequestInput.optional(),
  })
  .strict()
  .refine((value) => !(value.installment_count && value.repayment_plan_request), {
    message: "Use either installment_count or repayment_plan_request, not both",
  });
export type QuoteCreateInput = z.infer<typeof QuoteCreateInput>;
export const QuotePreflightResult = z.discriminatedUnion("valid", [
  z.object({
    valid: z.literal(true),
    status: z.literal("READY"),
    search_id: Id,
    offer_index: z.number().int().nonnegative(),
    route_category: z.string().nullable(),
    departure_date: z.string(),
    currency: z.string(),
    pricing: Any,
    rule_version: z.string(),
  }),
  z.object({
    valid: z.literal(false),
    status: z.literal("ADJUSTMENT_REQUIRED"),
    issue: z.object({
      message: z.string(),
      code: z.string().optional(),
    }).passthrough(),
  }),
]);
export type QuotePreflightResult = z.infer<typeof QuotePreflightResult>;
export const Quote = z
  .object({
    id: Id,
    status: z.string(),
    total_amount: z.union([z.string(), z.number()]),
    currency: z.string(),
  })
  .passthrough();
export type Quote = z.infer<typeof Quote>;
export const QuoteRevalidationInput = z.object({
  version: z.number().int().positive().optional(),
});
export type QuoteRevalidationInput = z.infer<typeof QuoteRevalidationInput>;
const QuoteRecoveryChanges = z.object({
  price_changed: z.boolean(),
  deposit_changed: z.boolean(),
  schedule_changed: z.boolean(),
  itinerary_changed: z.boolean(),
  ticket_rules_changed: z.boolean(),
  requires_customer_acceptance: z.boolean(),
});
export const QuoteRevalidationResult = z.union([
  Quote,
  z.object({
    status: z.literal("RECOVERED"),
    recovery_reason: z.string(),
    previous_quote_id: Id,
    search_id: Id,
    quote: Quote,
    changes: QuoteRecoveryChanges,
  }).passthrough(),
  z.object({
    status: z.literal("ALTERNATIVES_REQUIRED"),
    recovery_reason: z.string(),
    previous_quote_id: Id,
    search_id: Id,
    alternatives: Any,
    offer_count: z.number().int().nonnegative(),
  }).passthrough(),
  z.object({
    status: z.literal("REPAYMENT_PLAN_REQUIRED"),
    recovery_reason: z.string(),
    previous_quote_id: Id,
    search_id: Id,
    matched_offer_index: z.number().int().nonnegative(),
    error: z.string(),
  }).passthrough(),
  z.object({
    status: z.literal("KYC_REQUIRED"),
    recovery_reason: z.string(),
    previous_quote_id: Id,
    search_id: Id,
  }).passthrough(),
]);
export type QuoteRevalidationResult = z.infer<typeof QuoteRevalidationResult>;

const BookingPassengersInput = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}, z.array(z.record(z.string(), Any)).min(1));

export const BookingCreateInput = z.object({
  quote_id: Id,
  booking_type: z.enum(["full", "flexible"]),
  passengers: BookingPassengersInput,
  terms_accepted: z.boolean().default(false),
  payment_preference: z.string().optional(),
  quote_version: z.number().int().positive().optional(),
});
export type BookingCreateInput = z.infer<typeof BookingCreateInput>;
export const Booking = z
  .object({
    id: Id,
    customer_id: Id,
    quote_id: Id,
    status: z.string(),
    total_amount: z.union([z.string(), z.number()]),
    currency: z.string(),
    wallet_allocation: Any.nullable().optional(),
  })
  .passthrough();
export type Booking = z.infer<typeof Booking>;
export const Itinerary = z
  .object({
    booking_id: Id,
    release_level: z.enum(["PARTIAL", "FULL"]),
    segments: Any.optional(),
    ticket_reference: z.string().nullable().optional(),
    passenger_names: z.array(z.string()).optional(),
    airline_name: z.string().nullable().optional(),
    route: z.object({
      origin: z.string().nullable(),
      destination: z.string().nullable(),
    }).optional(),
    departure_date: z.string().nullable().optional(),
    departure_time: z.string().nullable().optional(),
    arrival_time: z.string().nullable().optional(),
    ticket_class: z.string().nullable().optional(),
    ticket_type: z.string().nullable().optional(),
    repayment_status: z.string().optional(),
    total_payable_amount: z.union([z.string(), z.number()]).optional(),
    initial_deposit: z.union([z.string(), z.number()]).optional(),
    outstanding_balance: z.union([z.string(), z.number()]).optional(),
    currency: z.string().optional(),
  })
  .passthrough();
export type Itinerary = z.infer<typeof Itinerary>;
export const RepaymentSchedule = z.object({
  booking_id: Id,
  installments: z.array(Any),
  payment_allocations: z.array(Any).optional(),
});
export type RepaymentSchedule = z.infer<typeof RepaymentSchedule>;
export const FinancingProfile = z.object({
  computed_tier: z.enum(["OBSERVER", "EXPLORER", "VOYAGER", "NAVIGATOR", "AMBASSADOR"]),
  effective_tier: z.enum(["OBSERVER", "EXPLORER", "VOYAGER", "NAVIGATOR", "AMBASSADOR"]),
  successful_cycles: z.number(),
  on_time_repayment_rate: z.number(),
  reminder_dependency_rate: z.number(),
  kyc_verified: z.boolean().optional(),
  deposit_rates: Any.optional(),
  financing_caps: Any.optional(),
  post_travel_max_percentage: z.number().optional(),
  schedule_constraints: z.object({
    max_installments: z.record(z.string(), z.number().int().positive()),
    max_financing_weeks: z.record(z.string(), z.number().positive()),
    minimum_days_before_departure: z.number().int().min(21),
    generated_due_days_before_departure: z.number().int().positive(),
    repayment_due_days_before_departure: z.number().int().positive(),
    grace_period_days: z.number().int().nonnegative(),
    grace_hard_stop_days_before_departure: z.number().int().positive(),
    post_travel_max_days: z.number().int().positive(),
  }).optional(),
  rule_version: z.string().optional(),
}).passthrough();
export type FinancingProfile = z.infer<typeof FinancingProfile>;
export const Wallet = z
  .object({
    customer_id: Id,
    currency: z.string(),
    balance: z.union([z.string(), z.number()]),
  })
  .passthrough();
export type Wallet = z.infer<typeof Wallet>;
export const LedgerEntryList = z.object({
  entries: z.array(Any),
  total: z.number().int().nonnegative(),
});
export type LedgerEntryList = z.infer<typeof LedgerEntryList>;
export const PaymentIntentCreateInput = z.object({
  booking_id: Id.optional(),
  amount: z.number().positive().refine(Number.isInteger, {
    message: "amount must be an integer in minor units (kobo for NGN)",
  }),
  currency: z.string().length(3).default("NGN"),
  email: z.string().email().optional(),
  payment_type: z.string().default("booking"),
});
export type PaymentIntentCreateInput = z.infer<typeof PaymentIntentCreateInput>;
export const PaymentIntent = z
  .object({
    id: Id,
    status: z.string(),
    amount: z.union([z.string(), z.number()]),
    currency: z.string(),
  })
  .passthrough();
export type PaymentIntent = z.infer<typeof PaymentIntent>;
export const Payment = z
  .object({
    id: Id,
    status: z.string(),
    amount: z.union([z.string(), z.number()]),
    currency: z.string(),
    allocations: z.array(Any).optional(),
  })
  .passthrough();
export type Payment = z.infer<typeof Payment>;
export const RefundCreateInput = z.object({
  amount: z.number().positive(),
  reason: z.string().max(500).optional(),
});
export type RefundCreateInput = z.infer<typeof RefundCreateInput>;
export const Refund = z
  .object({
    id: Id,
    payment_id: Id,
    status: z.string(),
    amount: z.union([z.string(), z.number()]),
  })
  .passthrough();
export type Refund = z.infer<typeof Refund>;
export const Installment = z
  .object({
    id: Id,
    booking_id: Id,
    sequence_number: z.number(),
    due_date: z.string(),
    amount: z.union([z.string(), z.number()]),
    status: z.string(),
  })
  .passthrough();
export type Installment = z.infer<typeof Installment>;
export const PaystackWebhookInput = z.record(z.string(), Any);
export type PaystackWebhookInput = z.infer<typeof PaystackWebhookInput>;
export const QoreidWebhookInput = z.record(z.string(), Any);
export type QoreidWebhookInput = z.infer<typeof QoreidWebhookInput>;
export const OneCapDepositWebhookInput = z.object({
  event: z.literal("deposit.success"),
  data: z.object({
    account_number: z.string().regex(/^\d{10}$/),
    amount: z.coerce.number().positive(),
    reference: z.string().min(1).max(200),
    session_id: z.string().min(1).max(200),
    timestamp: z.string().datetime(),
    currency: z.string().length(3).default("NGN"),
    user: z.object({ email: z.string().email().optional() }).optional(),
  }),
});
export type OneCapDepositWebhookInput = z.infer<
  typeof OneCapDepositWebhookInput
>;
export const BookingCancellationInput = z.object({
  reason: z.string().min(1).max(500),
});
export type BookingCancellationInput = z.infer<typeof BookingCancellationInput>;
export const OperationsBookingList = z.object({
  bookings: z.array(Any),
  total: z.number(),
});
export type OperationsBookingList = z.infer<typeof OperationsBookingList>;
export const OperationsBookingDetail = z.object({
  booking: Any,
  customer: Any.nullable(),
  payments: z.array(Any),
  payment_allocations: z.array(Any).optional(),
  installments: z.array(Any),
  ledger_entries: z.array(Any),
  itinerary: Any.nullable().optional(),
  audit_events: z.array(Any),
  risk_events: z.array(Any).optional(),
  trust_tier_history: z.array(Any).optional(),
  financing_profile: FinancingProfile.optional(),
});
export type OperationsBookingDetail = z.infer<typeof OperationsBookingDetail>;
export const OperationsRuleConfig = z
  .object({
    key: z.string(),
    value: Any,
    description: z.string().nullable().optional(),
    updated_at: z.string().optional(),
  })
  .passthrough();
export type OperationsRuleConfig = z.infer<typeof OperationsRuleConfig>;
export const ReconciliationReport = z.object({
  records: z.array(Any),
  total: z.number(),
});
export type ReconciliationReport = z.infer<typeof ReconciliationReport>;
export const OperationalEventList = z.object({
  events: z.array(Any),
  total: z.number(),
});
export type OperationalEventList = z.infer<typeof OperationalEventList>;
