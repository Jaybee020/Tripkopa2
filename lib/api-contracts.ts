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
}));
export type FlightSearchInput = z.infer<typeof FlightSearchInput>;
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
export const QuoteCreateInput = z
  .object({
    search_id: Id,
    booking_type: z.enum(["full", "flexible"]).default("full"),
    offer_index: z.number().int().nonnegative().optional(),
    offer: Any.optional(),
    base_amount: PositiveOptionalNumber,
    currency: z.string().length(3).default("NGN"),
    installment_count: PositiveOptionalInt,
  })
  .strict();
export type QuoteCreateInput = z.infer<typeof QuoteCreateInput>;
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
export const BookingCreateInput = z.object({
  quote_id: Id,
  booking_type: z.enum(["full", "flexible"]),
  passengers: z.array(z.record(z.string(), Any)).min(1),
  terms_accepted: z.boolean().default(false),
  payment_preference: z.string().optional(),
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
  })
  .passthrough();
export type Booking = z.infer<typeof Booking>;
export const Itinerary = z
  .object({ booking_id: Id, release_level: z.string(), segments: Any })
  .passthrough();
export type Itinerary = z.infer<typeof Itinerary>;
export const RepaymentSchedule = z.object({
  booking_id: Id,
  installments: z.array(Any),
});
export type RepaymentSchedule = z.infer<typeof RepaymentSchedule>;
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
  amount: z.number().int().positive(),
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
  installments: z.array(Any),
  ledger_entries: z.array(Any),
  itinerary: Any.nullable().optional(),
  audit_events: z.array(Any),
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
