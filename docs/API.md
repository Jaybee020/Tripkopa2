# Tripkopa API guide

This guide documents the API currently implemented by the Next.js route handlers in `app/api`.

## Base URL and format

Use the URL of the running Next.js application:

```text
Local:      http://localhost:3000
Production: https://<your-tripkopa-domain>
```

All request and response bodies are JSON unless stated otherwise. For requests with a body, send:

```http
Content-Type: application/json
```

The examples below use:

```bash
export TRIPKOPA_URL="http://localhost:3000"
export TRIPKOPA_API_KEY="your-WHATSAPP_AGENT_API_SECRET"
export CUSTOMER_WHATSAPP="+2348012345678"
```

`TRIPKOPA_API_KEY` is a server secret. Never put it in browser code, a mobile app, or a public WhatsApp workflow payload.

## Authentication modes

### Customer/agent authentication

Most customer endpoints are intended to be called by the trusted SupaOS/WhatsApp backend. Send both headers on every request:

```http
X-API-Key: <WHATSAPP_AGENT_API_SECRET>
X-WhatsApp-Number: +2348012345678
```

The WhatsApp number must be an international E.164 number: a leading `+`, country code, and 8–15 digits. On the first authenticated request for a number, the API automatically creates an active customer and an NGN wallet.

Reusable curl arguments:

```bash
curl "$TRIPKOPA_URL/api/me" \
  -H "X-API-Key: $TRIPKOPA_API_KEY" \
  -H "X-WhatsApp-Number: $CUSTOMER_WHATSAPP"
```

### Staff authentication

Authentication and operations routes use a Supabase session stored in HTTP cookies. A browser should retain the `Set-Cookie` headers returned by login. A script can use a cookie jar:

```bash
curl -c tripkopa-cookies.txt -b tripkopa-cookies.txt \
  -X POST "$TRIPKOPA_URL/api/auth/login" \
  -H 'Content-Type: application/json' \
  --data '{"email":"operator@example.com","password":"your-password"}'
```

Use `-c tripkopa-cookies.txt -b tripkopa-cookies.txt` on later operations calls. The resolve endpoint also requires a `staff_profiles.role` of `operations`, `operations_staff`, or `admin`. The current list, reconciliation, and cancellation handlers require a valid session but do not perform that extra role check.

### KYC browser authentication

A KYC link contains a one-time token. `POST /api/kyc/sessions/exchange` exchanges it for an HTTP-only `tripkopa_kyc_session` cookie. Retain that cookie when calling the session, consent, and BVN endpoints from the KYC browser flow. Those three endpoints may alternatively use customer/agent headers.

## Common responses and errors

Successful create operations normally return `201 Created`; reads and updates normally return `200 OK`; logout returns `204 No Content`.

Errors use this shape:

```json
{
  "error": "Human-readable error message"
}
```

Common statuses are:

| Status | Meaning |
|---|---|
| `400` | Invalid JSON, invalid request fields, missing identity header, or missing idempotency key |
| `401` | Invalid API key, missing/invalid session, or bad webhook signature |
| `403` | Suspended/closed customer or insufficient operations role |
| `404` | An explicitly checked resource was not found |
| `409` | Resource state conflict, expired KYC state, duplicate transition, or missing KYC prerequisite |
| `410` | A one-time KYC link is expired, invalid, or already used |
| `422` | Identity/deposit data could not be matched |
| `500` | Provider, database, or configuration failure |

Many records come directly from Postgres. Decimal amount fields may therefore be serialized as either JSON numbers or numeric strings. Clients should accept both.

## Endpoint index

`Agent` means the two customer/agent headers, `Staff` means a Supabase session cookie, and `KYC` means either a KYC browser cookie or Agent authentication.

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `POST` | `/api/auth/signup` | Public | Create a Supabase user/session |
| `POST` | `/api/auth/login` | Public | Start a Supabase session |
| `POST` | `/api/auth/refresh` | Public | Refresh a session with a refresh token |
| `POST` | `/api/auth/logout` | Staff | End the current session |
| `POST` | `/api/auth/password-reset` | Public | Send a password-reset email |
| `POST` | `/api/auth/password-reset/confirm` | Public | Set a new password using reset tokens |
| `GET` | `/api/auth/me` | Staff | Return the authenticated user and linked customer |
| `GET` | `/api/me` | Agent | Resolve/create and return the customer profile |
| `PATCH` | `/api/me` | Agent | Update the customer profile |
| `GET` | `/api/me/profile` | Agent | Alias for `GET /api/me` |
| `PATCH` | `/api/me/profile` | Agent | Alias for `PATCH /api/me` |
| `GET` | `/api/me/kyc` | Agent | Return the most recent KYC state |
| `GET` | `/api/me/financing` | Agent | Evaluate deadlines and return the customer's public financing profile |
| `POST` | `/api/kyc/sessions` | Agent | Create a 10-minute KYC link |
| `POST` | `/api/kyc/sessions/exchange` | One-time token | Exchange the link token for a KYC cookie |
| `GET` | `/api/kyc/sessions/{session_id}` | KYC | Read a KYC session |
| `POST` | `/api/kyc/sessions/{session_id}/consent` | KYC | Record privacy consent |
| `POST` | `/api/kyc/sessions/{session_id}/verify-bvn` | KYC | Verify BVN and provision a virtual account |
| `POST` | `/api/flights/searches` | Agent | Search for flights and store the result |
| `GET` | `/api/flights/searches/{search_id}` | Agent | Read a stored flight search |
| `POST` | `/api/quotes` | Agent | Create a full or flexible quote from a stored search offer |
| `GET` | `/api/quotes/{quote_id}` | Agent | Read a customer quote |
| `POST` | `/api/quotes/{quote_id}/revalidate` | Agent | Revalidate and version a quote |
| `POST` | `/api/bookings` | Agent | Create a booking from a quote |
| `GET` | `/api/bookings/{booking_id}` | Agent | Read a booking |
| `GET` | `/api/bookings/{booking_id}/itinerary` | Agent | Read an itinerary |
| `GET` | `/api/bookings/{booking_id}/repayment` | Agent | List a booking's installments |
| `GET` | `/api/installments/{installment_id}` | Agent | Read one installment |
| `GET` | `/api/wallet` | Agent | Read wallet and virtual-account details |
| `GET` | `/api/wallet/ledger` | Agent | List wallet ledger entries |
| `POST` | `/api/payments/intents` | Agent | Create idempotent bank-transfer instructions |
| `GET` | `/api/payments/{payment_id}` | Agent | Read a payment |
| `POST` | `/api/payments/{payment_id}/refunds` | Agent | Request a refund |
| `GET` | `/api/events` | Agent | List customer operational events |
| `GET` | `/api/operations/bookings` | Staff | List all bookings |
| `GET` | `/api/operations/bookings/{booking_id}` | Staff + role | Read operations booking detail with payments, installments, ledger, itinerary, and audit events |
| `POST` | `/api/operations/bookings/{booking_id}/cancel` | Staff | Mark a booking cancellation pending |
| `POST` | `/api/operations/bookings/{booking_id}/retry-ticketing` | Staff + role | Retry TakeTrips ticketing for a funded booking |
| `POST` | `/api/operations/bookings/{booking_id}/resolve` | Staff + role | Resolve an operational booking/case |
| `GET` | `/api/operations/rules` | Staff + role | Read MVP flexible-payment rule config |
| `PUT` | `/api/operations/rules` | Admin role | Update MVP flexible-payment rule config |
| `PUT` | `/api/operations/customers/{customer_id}/trust-tier` | Admin role | Set or clear an audited trust-tier override |
| `POST/PATCH` | `/api/operations/customers/{customer_id}/risk-events` | Staff + role | Create or resolve an audited behavioral risk event |
| `GET` | `/api/operations/reconciliation` | Staff | List reconciliation records |
| `POST` | `/api/webhooks/payments/onecap` | OneCap signature | Process a successful virtual-account deposit |
| `POST` | `/api/webhooks/payments/paystack` | Paystack signature | Store a Paystack event |
| `POST` | `/api/webhooks/kyc/qoreid` | QoreID signature | Store a redacted QoreID event |

## Customer profile

### Get or create the current customer

```http
GET /api/me
```

Example:

```bash
curl "$TRIPKOPA_URL/api/me" \
  -H "X-API-Key: $TRIPKOPA_API_KEY" \
  -H "X-WhatsApp-Number: $CUSTOMER_WHATSAPP"
```

Representative response:

```json
{
  "id": "customer-uuid",
  "whatsapp_number": "+2348012345678",
  "status": "ACTIVE",
  "first_name": null,
  "last_name": null,
  "preferred_currency": "NGN",
  "profile_completed_at": null
}
```

### Update the current customer

```http
PATCH /api/me
```

All fields are optional, but unknown fields are rejected. Accepted fields:

| Field | Rules |
|---|---|
| `title` | `MR`, `MRS`, `MISS`, `MS`, or `DR` |
| `first_name`, `last_name` | 1–100 characters |
| `middle_name` | 1–100 characters or `null` |
| `email` | Valid email or `null` |
| `date_of_birth` | `YYYY-MM-DD` or `null` |
| `gender` | `MALE`, `FEMALE`, `OTHER`, or `null` |
| `preferred_currency` | Three letters; normalized to uppercase |

```bash
curl -X PATCH "$TRIPKOPA_URL/api/me" \
  -H 'Content-Type: application/json' \
  -H "X-API-Key: $TRIPKOPA_API_KEY" \
  -H "X-WhatsApp-Number: $CUSTOMER_WHATSAPP" \
  --data '{
    "title":"MR",
    "first_name":"John",
    "last_name":"Doe",
    "email":"john@example.com",
    "date_of_birth":"1990-01-01",
    "gender":"MALE",
    "preferred_currency":"NGN"
  }'
```

`GET /api/me/profile` and `PATCH /api/me/profile` are aliases implemented by the same profile handler.

### Get current KYC status

```http
GET /api/me/kyc
```

Response when no session exists:

```json
{"status":"NOT_STARTED","session":null}
```

Otherwise, `session` contains `status`, `provider`, `expires_at`, and `normalized_result` from the newest session.

## KYC workflow

The expected sequence is create session → open returned link → exchange token → consent → verify BVN. Complete the customer's full legal first, middle, and last names and email before BVN verification. After verification and wallet provisioning succeed, the backend sends an idempotent KYC-success email through Resend. The message never contains the customer's BVN. A later KYC-status read retries the confirmation if its earlier delivery attempt failed.

### 1. Create a KYC session

```http
POST /api/kyc/sessions
```

Body; both fields have defaults and `{}` is valid:

```json
{
  "provider": "qoreid",
  "purpose": "identity_verification"
}
```

Returns `201` with the KYC session and a one-time `url`. The session expires after 10 minutes.

```bash
curl -X POST "$TRIPKOPA_URL/api/kyc/sessions" \
  -H 'Content-Type: application/json' \
  -H "X-API-Key: $TRIPKOPA_API_KEY" \
  -H "X-WhatsApp-Number: $CUSTOMER_WHATSAPP" \
  --data '{}'
```

### 2. Exchange the one-time token

```http
POST /api/kyc/sessions/exchange
```

Extract the token from `/verify/s/{token}`, then retain the response cookie:

```bash
curl -c kyc-cookies.txt -b kyc-cookies.txt \
  -X POST "$TRIPKOPA_URL/api/kyc/sessions/exchange" \
  -H 'Content-Type: application/json' \
  --data '{"token":"the-token-from-the-link"}'
```

Response:

```json
{
  "session_id": "session-uuid",
  "status": "PENDING",
  "expires_at": "2026-08-11T12:10:00.000Z"
}
```

### 3. Inspect the session

```http
GET /api/kyc/sessions/{session_id}
```

Use either the KYC cookie jar or Agent headers. Sensitive raw BVN data is not returned.

### 4. Record consent

```http
POST /api/kyc/sessions/{session_id}/consent
```

```bash
curl -c kyc-cookies.txt -b kyc-cookies.txt \
  -X POST "$TRIPKOPA_URL/api/kyc/sessions/$SESSION_ID/consent" \
  -H 'Content-Type: application/json' \
  --data '{"consent":true,"privacy_notice_version":"1.0"}'
```

Only literal `true` and privacy notice version `1.0` are accepted. The response contains `session_id`, status `CONSENTED`, and the configured `provider_url` or `null`.

### 5. Verify BVN and provision Providus account

```http
POST /api/kyc/sessions/{session_id}/verify-bvn
```

The BVN must be exactly 11 digits. This endpoint is accepted only while the session is `CONSENTED`.

```bash
curl -c kyc-cookies.txt -b kyc-cookies.txt \
  -X POST "$TRIPKOPA_URL/api/kyc/sessions/$SESSION_ID/verify-bvn" \
  -H 'Content-Type: application/json' \
  --data '{"bvn":"12345678901"}'
```

Successful new provisioning returns `201`:

```json
{
  "status": "success",
  "virtual_account": {
    "id": "account-uuid",
    "account_number": "0123456789",
    "account_name": "JOHN DOE",
    "bank_name": "Providus Bank",
    "status": "ACTIVE"
  }
}
```

An already-active account returns the same shape with `200`. The raw BVN is sent to QoreID and OneCap during this request but is not persisted or returned.

## Flight searches and quotes

### Search flights

```http
POST /api/flights/searches
```

```bash
curl -X POST "$TRIPKOPA_URL/api/flights/searches" \
  -H 'Content-Type: application/json' \
  -H "X-API-Key: $TRIPKOPA_API_KEY" \
  -H "X-WhatsApp-Number: $CUSTOMER_WHATSAPP" \
  --data '{
    "origin":"LOS",
    "destination":"LON",
    "departure_date":"2026-12-24",
    "return_date":null,
    "trip_type":"one_way",
    "adult_count":1,
    "children_count":0,
    "infant_count":0,
    "cabin_class":"Economy",
    "direct":false,
    "all_providers":true,
    "payment_preference":"flexible",
    "ticket_type":"refundable"
  }'
```

The API also accepts TakeTrips-style aliases from agents: `from`, `to`,
`departureDate`, `returnDate`, `adult`, `children`, `infant`, `cabinClass`, and
`allProviders`.

Rules and defaults:

| Field | Required | Rule/default |
|---|---|---|
| `origin` | Yes | At least 3 characters |
| `destination` | Yes | At least 3 characters |
| `departure_date` | Yes | String passed to the flight provider |
| `return_date` | No | String or `null` |
| `trip_type` | No | `one_way` (default) or `return` |
| `passenger_count` | No | Backward-compatible adult count; default `1` |
| `adult_count` | No | Positive integer; default `1` |
| `children_count` | No | Non-negative integer; default `0` |
| `infant_count` | No | Non-negative integer; default `0` |
| `cabin_class` | No | Default `Economy` |
| `direct` | No | Boolean; default `false` |
| `all_providers` | No | Boolean; default `true` |
| `payment_preference` | No | `full` (default) or `flexible` |
| `ticket_type` | No | `refundable`, `nonrefundable`, or `any` (default); confirmed provider results are filtered when requested |

The backend sends this full TakeTrips query by default:

```text
from=LOS&to=LON&departureDate=2026-12-24&returnDate=&direct=false&adult=1&children=0&infant=0&cabinClass=Economy&allProviders=true
```

Returns `201` with a stored search record whose `results` field contains the provider response. The caller should let the customer choose one offer from this response, then create a quote.

### Create a quote

```http
POST /api/quotes
```

Creates a full-payment or flexible-payment quote from a stored flight search. Flexible quotes require latest KYC status `VERIFIED`.

For TakeTrips responses shaped as a single offer (`{ "status": true, "details": {...} }`), use `offer_index: 0`; the backend selects `details` as the offer. For TakeTrips responses shaped as a list (`{ "status": true, "details": [...] }`), `offer_index` selects from that `details` array.

```bash
curl -X POST "$TRIPKOPA_URL/api/quotes" \
  -H 'Content-Type: application/json' \
  -H "X-API-Key: $TRIPKOPA_API_KEY" \
  -H "X-WhatsApp-Number: $CUSTOMER_WHATSAPP" \
  --data '{
    "search_id":"search-uuid",
    "booking_type":"flexible",
    "offer_index":0,
    "base_amount":120000,
    "currency":"NGN",
    "repayment_plan_request": {
      "mode":"generated",
      "frequency":"weekly",
      "installment_count":4
    }
  }'
```

Fields:

| Field | Required | Rule/default |
|---|---|---|
| `search_id` | Yes | Stored flight search owned by this customer |
| `booking_type` | No | `full` default, or `flexible` |
| `offer_index` | No | Zero-based offer index from the provider response; default `0` |
| `offer` | No | Explicit selected offer object; used instead of `offer_index` when supplied |
| `base_amount` | Sometimes | Positive number; required when the backend cannot infer price from the offer |
| `currency` | No | Three-letter code, default `NGN` |
| `installment_count` | No | Positive integer up to `8`; capped by MVP route rules |
| `repayment_plan_request` | No | Generated weekly/monthly plan, or custom amount/date rows; replaces legacy `installment_count` |

Do not send placeholder values for unknown optional fields. Omit `offer` instead of sending `{}`, omit `base_amount` instead of sending `0`, and omit `installment_count` instead of sending `0`. The backend treats those placeholder values as omitted, then attempts to use the selected stored offer.

If the provider response uses an unsupported price shape, the endpoint returns `400` with `offer_shape` and `result_shape` metadata. In that case, retry with a positive `base_amount` from the selected offer.

Full-payment quotes apply a 5% service fee. Flexible quotes use the customer's trust tier, route category, financing window, marked-up-total cap, and versioned rules. Generated schedules end 14 days before departure; custom schedules must end at least 10 days before departure. The quote stores the complete plan under `details.pricing.repayment_plan`.

```json
{
  "id": "quote-uuid",
  "status": "ACTIVE",
  "currency": "NGN",
  "base_amount": "120000",
  "total_amount": "129000",
  "deposit_amount": "45150",
  "installment_amount": "20962.50",
  "rule_version": "flex_v2_2026_08",
  "expires_at": "2026-08-12T12:10:00.000Z",
  "details": {
    "booking_type": "flexible",
    "pricing": {
      "repayment_plan": {
        "deposit_amount": 45150,
        "plan_mode":"generated",
        "frequency":"weekly",
        "repayment_deadline":"2026-10-10",
        "generated_deadline":"2026-10-06",
        "installments": [
          {"sequence_number":1,"due_date":"2026-09-15","amount":20962.50,"phase":"PRE_TRAVEL"}
        ]
      }
    }
  }
}
```

Quotes expire after 10 minutes.

### Read search or quote

```http
GET /api/flights/searches/{search_id}
GET /api/quotes/{quote_id}
```

Both return only a resource owned by the asserted customer. A quote includes at least `id`, `status`, `total_amount`, and `currency`, plus stored quote details and any repayment plan.

### Revalidate a quote

```http
POST /api/quotes/{quote_id}/revalidate
```

Body is optional in meaning but must be valid JSON; send `{}` or a positive integer version:

```json
{"version":2}
```

The backend rehydrates the offer from the original stored flight search before provider validation. Caller-supplied or previously summarized offer objects are never used as the provider payload, preserving fields such as `gdsType`, complete conversion rates, segment timestamps, passenger IDs, and baggage metadata. When validation succeeds, the API updates the quote to `ACTIVE`, replaces its details, refreshes its ten-minute expiry, and increments its version.

When the provider rejects an expired or unavailable offer, the backend automatically repeats the original stored flight search, preserving route, dates, passenger composition, cabin, direct-flight setting, provider setting, and ticket preference. It then compares strict itinerary fingerprints containing carrier, flight number, airports, and timestamps.

If the exact itinerary is found and validates, the backend creates a new linked quote rather than rewriting the old audit record:

```json
{
  "status": "RECOVERED",
  "recovery_reason": "PROVIDER_QUOTE_EXPIRED",
  "previous_quote_id": "expired-quote-uuid",
  "search_id": "refreshed-search-uuid",
  "quote": {
    "id": "replacement-quote-uuid",
    "status": "ACTIVE",
    "version": 1,
    "total_amount": "180000",
    "expires_at": "2026-08-19T12:10:00Z"
  },
  "changes": {
    "price_changed": true,
    "deposit_changed": true,
    "schedule_changed": true,
    "itinerary_changed": false,
    "ticket_rules_changed": false,
    "requires_customer_acceptance": true
  }
}
```

The expired quote becomes `SUPERSEDED`. Booking must use the replacement `quote.id` and `quote.version`. Concurrent recovery requests reuse the same replacement quote.

If the exact itinerary is unavailable, the endpoint returns `ALTERNATIVES_REQUIRED` with a refreshed `search_id` and provider results under `alternatives`. If the itinerary exists but its saved repayment structure no longer fits, it returns `REPAYMENT_PLAN_REQUIRED` with the refreshed search and matched offer index. `KYC_REQUIRED` preserves the refreshed search while KYC is completed.

Only an infrastructure or provider failure that prevents recovery returns HTTP `409` with `recovery_reason: RECOVERY_FAILED`. The agent should retry safely once and then escalate. It must not ask the customer to repeat the original trip details.

## Bookings and installments

### Create a booking

```http
POST /api/bookings
```

```bash
curl -X POST "$TRIPKOPA_URL/api/bookings" \
  -H 'Content-Type: application/json' \
  -H "X-API-Key: $TRIPKOPA_API_KEY" \
  -H "X-WhatsApp-Number: $CUSTOMER_WHATSAPP" \
  --data '{
    "quote_id":"quote-uuid",
    "booking_type":"flexible",
    "passengers":[{
      "title":"MR",
      "first_name":"John",
      "last_name":"Doe",
      "date_of_birth":"1990-01-01"
    }],
    "terms_accepted":true,
    "payment_preference":"flexible"
  }'
```

`booking_type` must be `full` or `flexible`; `passengers` must contain at least one object. `terms_accepted` defaults to `false`.

When terms are accepted:

| Booking type | Initial status | Side effects |
|---|---|---|
| `full` | `AWAITING_PAYMENT` | Consumes the quote |
| `flexible` | `AWAITING_DEPOSIT` | Consumes the quote and creates installment rows from the quote repayment plan |

When terms are not accepted, the initial status is `AWAITING_TERMS`. A flexible booking requires a flexible quote containing `details.pricing.repayment_plan`. Returns `201`.

### Read booking data

```http
GET /api/bookings/{booking_id}
GET /api/bookings/{booking_id}/itinerary
GET /api/bookings/{booking_id}/repayment
GET /api/installments/{installment_id}
```

The itinerary response contains `booking_id`, `release_level`, `segments`, and possibly `ticket_reference`. The repayment response is:

```json
{
  "booking_id": "booking-uuid",
  "installments": [
    {
      "id": "installment-uuid",
      "sequence_number": 1,
      "due_date": "2026-08-20",
      "amount": "25000.00",
      "paid_amount": "0.00",
      "status": "PENDING",
      "phase": "PRE_TRAVEL",
      "reminder_count": 0
    }
  ]
}
```

Repayment and financing reads evaluate due dates before returning. Installments may transition to `OVERDUE`, `GRACE`, or `DEFAULTED`; a final default moves the booking to `CANCELLATION_REVIEW`.

Repayment reminders are backend-driven. Vercel calls `GET /api/cron/repayment-reminders` every day at 08:00 UTC, authenticated with `CRON_SECRET`. By default, the job emails customers 7, 3, and 1 day before each installment, on the due date, and 1, 2, 3, and 7 days after it becomes overdue. Configure these offsets with `REPAYMENT_REMINDER_DAYS_BEFORE` and `REPAYMENT_OVERDUE_REMINDER_DAYS`. Every scheduled reminder has a deterministic idempotency key, is counted only after Resend accepts it, and produces an operational event. This cron endpoint is internal and must not be exposed as an agent tool.

### Financing profile

```http
GET /api/me/financing
```

Returns the computed and effective public tier, successful cycles, lifetime on-time and reminder rates, KYC state, route-specific deposit rates and caps, the maximum post-travel percentage, and the active rule version. Internal risk events and scoring inputs are not returned.

## Wallet, payments, and events

### Read wallet and ledger

```http
GET /api/wallet
GET /api/wallet/ledger
```

Wallet response:

```json
{
  "customer_id": "customer-uuid",
  "currency": "NGN",
  "balance": "5000.00",
  "virtual_account": {
    "id": "account-uuid",
    "account_number": "0123456789",
    "account_name": "JOHN DOE",
    "bank_name": "Providus Bank",
    "status": "ACTIVE"
  }
}
```

`virtual_account` is `null` before successful KYC/provisioning. The ledger endpoint returns `{ "entries": [...], "total": 0 }`, ordered newest first.

### Create payment instructions

```http
POST /api/payments/intents
Idempotency-Key: <unique key, 1-200 characters>
```

This currently creates Providus bank-transfer instructions and only supports `NGN`. The customer must already have an active virtual account. Use a new idempotency key for each logical payment attempt; retrying the same operation with the same key returns the existing payment instead of creating another.

```bash
curl -X POST "$TRIPKOPA_URL/api/payments/intents" \
  -H 'Content-Type: application/json' \
  -H "X-API-Key: $TRIPKOPA_API_KEY" \
  -H "X-WhatsApp-Number: $CUSTOMER_WHATSAPP" \
  -H 'Idempotency-Key: whatsapp-message-12345-wallet-deposit' \
  --data '{
    "amount":500000,
    "currency":"NGN",
    "payment_type":"wallet_deposit"
  }'
```

Fields:

| Field | Required | Rule/default |
|---|---|---|
| `booking_id` | No | Must belong to this customer if supplied |
| `amount` | Yes | Positive integer in minor units (kobo for NGN); for example, `500000` means ₦5,000.00 |
| `currency` | No | Three characters, default `NGN`; currently only exact `NGN` is accepted |
| `email` | No | Valid email; accepted but not currently used by the handler |
| `payment_type` | No | Default `booking`; use `wallet_deposit`, `booking_deposit`, `installment`, or another agreed internal value |

For booking payments, the amount must not exceed the booking `balance_amount`. For flexible bookings in `AWAITING_DEPOSIT` or `AWAITING_PAYMENT`, the amount must be at least the booking `deposit_amount`.

Flexible deposit example:

```bash
curl -X POST "$TRIPKOPA_URL/api/payments/intents" \
  -H 'Content-Type: application/json' \
  -H "X-API-Key: $TRIPKOPA_API_KEY" \
  -H "X-WhatsApp-Number: $CUSTOMER_WHATSAPP" \
  -H 'Idempotency-Key: booking-uuid-deposit-v1' \
  --data '{
    "booking_id":"booking-uuid",
    "amount":3870000,
    "currency":"NGN",
    "payment_type":"booking_deposit"
  }'
```

Successful creation returns `201` with the payment, `payment_method: "BANK_TRANSFER"`, and `virtual_account`. The new payment status is `PENDING`. The customer pays by bank transfer to the returned virtual account.

### Read a payment

```http
GET /api/payments/{payment_id}
```

Returns the customer-owned payment record, including `id`, `status`, `amount`, `currency`, provider fields, and metadata.

### Request a refund

```http
POST /api/payments/{payment_id}/refunds
```

```json
{
  "amount": 1000,
  "reason": "Customer requested cancellation"
}
```

`amount` must be positive; `reason` is optional and at most 500 characters. Returns `201` with a `PENDING` refund. The current handler records the request but does not itself call a payment provider or enforce that the refund is no greater than the payment.

### Read customer events

```http
GET /api/events
```

Returns events newest first:

```json
{"events":[...],"total":1}
```

## Authentication API

These routes support the cookie-authenticated staff/operations UI. They are separate from Agent authentication.

### Sign up

```http
POST /api/auth/signup
```

```json
{
  "email": "operator@example.com",
  "password": "at-least-8-characters"
}
```

The schema also accepts optional `whatsapp_number` and `role`, but the current handler does not persist or apply them. Returns `201` with `{ "user": ..., "session": ... }`; `session` may be `null` when Supabase email confirmation is enabled.

### Login, refresh, current user, and logout

```http
POST /api/auth/login
{"email":"operator@example.com","password":"your-password"}

POST /api/auth/refresh
{"refresh_token":"supabase-refresh-token"}

GET /api/auth/me

POST /api/auth/logout
```

Login and refresh return `{ "user": ..., "session": ... }`. Current-user returns `{ "user": ..., "customer": ... }`. Logout returns `204` with no body.

### Password reset

```http
POST /api/auth/password-reset
{"email":"operator@example.com"}
```

Returns `{ "sent": true }` after asking Supabase to send the email.

```http
POST /api/auth/password-reset/confirm
```

```json
{
  "access_token": "token-from-reset-flow",
  "refresh_token": "token-from-reset-flow",
  "password": "new-password-at-least-8-characters"
}
```

Returns `{ "updated": true }`.

## Operations API

Retain the Supabase auth cookies created by login.

### List bookings and reconciliation records

```http
GET /api/operations/bookings
GET /api/operations/reconciliation
```

Responses are `{ "bookings": [...], "total": n }` and `{ "records": [...], "total": n }`, respectively, ordered newest first.

### Read booking operations detail

```http
GET /api/operations/bookings/{booking_id}
```

Requires an operations staff role. Returns:

```json
{
  "booking": {},
  "customer": {},
  "payments": [],
  "installments": [],
  "ledger_entries": [],
  "itinerary": null,
  "audit_events": []
}
```

The dashboard uses this to inspect flexible-payment state, wallet allocation, installment progress, itinerary release level, and previous staff actions.

### Retry ticketing

```http
POST /api/operations/bookings/{booking_id}/retry-ticketing
```

Requires an operations staff role. The booking must have at least one succeeded booking payment and must satisfy the ticketing threshold: full amount for full-payment bookings, or deposit amount for flexible bookings. The route reuses the TakeTrips ordering flow and records an audit event.

### Request booking cancellation

```http
POST /api/operations/bookings/{booking_id}/cancel
```

```json
{"reason":"Flight no longer required"}
```

The reason is required and limited to 500 characters. The handler changes the booking status to `CANCELLATION_PENDING`, echoes the reason in the response, and records an operations audit event. Provider cancellation/refund automation is still a separate workflow.

### Resolve a booking/case

```http
POST /api/operations/bookings/{booking_id}/resolve
```

```json
{"reason":"Manual ticketing issue resolved"}
```

The reason is required and limited to 500 characters. This endpoint checks the operations role, marks the record `RESOLVED`, saves resolution metadata, and uses optimistic locking. A concurrent or repeated resolution returns `409`.

### Read or update flexible-payment rules

```http
GET /api/operations/rules
PUT /api/operations/rules
```

`GET` requires an operations staff role. `PUT` requires the `admin` staff role.

```json
{
  "value": {
    "rule_version": "flex_v2_2026_08",
    "full_service_fee_rate": 0.05,
    "max_financing_weeks": {"domestic":12,"regional":16,"international":24},
    "max_installments": {"domestic":4,"regional":6,"international":8},
    "repayment_due_days_before_departure": 10,
    "generated_due_days_before_departure": 14,
    "grace_period_days": 3,
    "grace_hard_stop_days_before_departure": 7,
    "post_travel_max_days": 90,
    "markup": "route bracket arrays",
    "deposit_rates": "tier-by-route matrix",
    "financing_caps": "tier-by-route matrix",
    "post_travel_rates": "tier matrix"
  },
  "description": "Trust-based financing rules."
}
```

The value must contain the complete rule document; the abbreviated strings above represent the complete matrices returned by `GET`. Quotes read this live configuration and store an immutable snapshot. Every update must use a new `rule_version`; versions are recorded in `admin_rule_config_versions` and cannot be overwritten.

## Provider webhooks

Webhook callers must sign the exact raw request body. Do not parse and reserialize the JSON between generating the signature and sending it.

## Provider diagnostics

Every TakeTrips outbound provider call is logged to `take_trip_logs` by the TakeTrips service wrapper. The table records operation (`search`, `validate`, or `order`), method/path, sanitized request payload, response status, sanitized response payload, errors, duration, success flag, and timestamp. Authorization headers and common identity fields are redacted before insert. Operations staff can read these rows through Supabase after running migration `0005_take_trip_logs.sql`.

### OneCap deposit webhook

```http
POST /api/webhooks/payments/onecap
X-Partner-Signature: <hex HMAC-SHA256 of raw body>
```

The key is `ONECAP_PARTNER_WEBHOOK_SECRET`. The optional `sha256=` prefix is accepted.

Required payload:

```json
{
  "event": "deposit.success",
  "data": {
    "account_number": "0123456789",
    "amount": 5000,
    "reference": "provider-reference",
    "session_id": "provider-event-id",
    "timestamp": "2026-08-11T12:00:00.000Z",
    "currency": "NGN",
    "user": {"email":"customer@example.com"}
  }
}
```

`user` is optional. The callback is processed atomically and deduplicated using `session_id`. It records the provider event, marks or creates a succeeded payment, inserts wallet deposit ledger entries, and credits the customer wallet.

If the matched payment has a `booking_id`, the webhook also applies the payment to that booking:

- debits the wallet into booking receivables;
- updates `bookings.amount_paid`, `bookings.balance_amount`, and booking status;
- marks flexible installments `PARTIALLY_PAID` or `PAID` when installment money is received after the deposit;
- attempts TakeTrips ordering/ticketing once the full-payment amount or flexible deposit threshold is met;
- creates an itinerary with `release_level: "FULL"` for full-payment bookings or `"LIMITED"` for flexible bookings;
- moves failed ticketing attempts to `MANUAL_REVIEW` and emits an operational event.

Success returns:

```json
{
  "received": true,
  "payment_id": "payment-uuid",
  "booking": {
    "applied": true,
    "booking_id": "booking-uuid",
    "status": "PAYMENT_RECEIVED",
    "ticketing": {"ticketed": true, "release_level": "LIMITED"}
  }
}
```

For development/provider testing, set `TAKETRIPS_MOCK_ORDER_SUCCESS=true` to skip the real TakeTrips order call and create a mock ticket reference. An unknown virtual account returns `422`.

### Paystack webhook

```http
POST /api/webhooks/payments/paystack
X-Paystack-Signature: <hex HMAC-SHA512 of raw body>
```

The key is `PAYSTACK_SECRET_KEY`. Any JSON object is accepted and stored as a received provider event. Success returns `{ "received": true }`.

### QoreID webhook

```http
POST /api/webhooks/kyc/qoreid
X-Verifyme-Signature: <provider signature>
```

`X-Qoreid-Signature` and `X-Webhook-Signature` are also accepted. The signature is verified by the configured QoreID service. The API removes common raw identity/document fields before storing the event. Success returns `{ "received": true }`; a duplicate also includes `"duplicate": true`.

## Calling from TypeScript

For calls from another backend service, use an absolute URL and keep the Agent API key on the server:

```ts
const baseUrl = process.env.TRIPKOPA_URL ?? "http://localhost:3000";

const response = await fetch(`${baseUrl}/api/flights/searches`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-API-Key": process.env.WHATSAPP_AGENT_API_SECRET!,
    "X-WhatsApp-Number": "+2348012345678",
  },
  body: JSON.stringify({
    origin: "LOS",
    destination: "LON",
    departure_date: "2026-12-24",
    trip_type: "one_way",
    adult_count: 1,
    children_count: 0,
    infant_count: 0,
    cabin_class: "Economy",
    direct: false,
    all_providers: true,
    payment_preference: "full",
  }),
});

const data = await response.json();
if (!response.ok) {
  throw new Error(data.error ?? `Tripkopa returned ${response.status}`);
}
```

The repository also includes typed wrappers in `lib/api/client.ts`, but they currently use relative URLs. A browser can resolve those URLs, but Agent helpers must not be called there because doing so would expose the API secret. To use the wrappers safely in another server process, update their request helper to prepend the Tripkopa base URL.

No cross-origin CORS headers are currently configured, so direct calls from a different browser origin require additional CORS configuration.
