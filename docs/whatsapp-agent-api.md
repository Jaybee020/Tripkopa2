# Tripkopa WhatsApp Agent Backend API

This document describes the backend endpoints intended for the WhatsApp client
agent. The agent acts on behalf of one customer at a time by sending the
customer's WhatsApp number with every request.

## Base URL

Production:

```text
https://tripkopa2.vercel.app
```

Local development:

```text
http://localhost:3000
```

## Authentication

All WhatsApp-agent endpoints require these headers:

```http
X-API-Key: <WHATSAPP_AGENT_API_SECRET>
X-WhatsApp-Number: +2348012345678
Content-Type: application/json
```

`X-WhatsApp-Number` must be an international E.164 number. The backend also
accepts provider-style values like `whatsapp:+2348012345678` and normalizes
them.

On first contact, the backend creates an `ACTIVE` customer record and wallet for
the WhatsApp number.

## Common Errors

```json
{ "error": "Invalid API key" }
```

Status codes commonly used:

| Status | Meaning |
| --- | --- |
| 400 | Invalid request body or missing required header |
| 401 | Invalid `X-API-Key` |
| 403 | Customer is suspended or closed |
| 404 | Resource not found for this customer |
| 409 | Business rule conflict, such as missing virtual account |
| 500 | Server or provider integration error |

## Smoke Test

Use this to confirm the deployed Next API server is reachable. It does not
require agent auth.

```http
GET /api/health
```

Example:

```bash
curl https://tripkopa2.vercel.app/api/health
```

## Customer Profile

### Get or Create Customer

Returns the customer profile for the asserted WhatsApp number. Creates the
customer and wallet if this is the first request from that number.

```http
GET /api/me
```

Example:

```bash
curl https://tripkopa2.vercel.app/api/me \
  -H "X-API-Key: $WHATSAPP_AGENT_API_SECRET" \
  -H "X-WhatsApp-Number: +2348012345678"
```

Response:

```json
{
  "id": "customer_id",
  "whatsapp_number": "+2348012345678",
  "status": "ACTIVE",
  "first_name": null,
  "last_name": null,
  "email": null,
  "preferred_currency": "NGN"
}
```

### Update Customer Profile

Updates non-verified customer profile fields.

```http
PATCH /api/me
```

Body:

```json
{
  "title": "MR",
  "first_name": "Ada",
  "middle_name": null,
  "last_name": "Okafor",
  "email": "ada@example.com",
  "date_of_birth": "1995-04-12",
  "gender": "FEMALE",
  "preferred_currency": "NGN"
}
```

Allowed values:

| Field | Values |
| --- | --- |
| `title` | `MR`, `MRS`, `MISS`, `MS`, `DR` |
| `gender` | `MALE`, `FEMALE`, `OTHER` |
| `preferred_currency` | 3-letter currency code |

Example:

```bash
curl -X PATCH https://tripkopa2.vercel.app/api/me \
  -H "X-API-Key: $WHATSAPP_AGENT_API_SECRET" \
  -H "X-WhatsApp-Number: +2348012345678" \
  -H "Content-Type: application/json" \
  -d '{"first_name":"Ada","last_name":"Okafor","email":"ada@example.com"}'
```

## KYC

### Get Financing Profile

After KYC and before negotiating a flexible plan, call:

```http
GET /api/me/financing
```

This returns the customer's public effective tier, successful cycles, route-specific deposit rates and caps, post-travel allowance, and active rule version. Do not expose internal behavioral inputs or risk events.

### Get Latest KYC Status

```http
GET /api/me/kyc
```

Response:

```json
{
  "status": "NOT_STARTED",
  "session": null
}
```

Possible statuses include `NOT_STARTED`, `PENDING`, `CONSENTED`, `VERIFIED`,
and provider-specific failure/review states.

When BVN verification and wallet provisioning complete successfully, the verification response is not blocked by outbound notification delivery. The success page returns the customer to WhatsApp with a prefilled continuation message when `NEXT_PUBLIC_WHATSAPP_BUSINESS_NUMBER` is configured. The backend also sends a KYC confirmation through the configured notification channels. Each channel is idempotent and the message never contains the BVN. A KYC-status read returns `success_notification` and retries only failed channel deliveries.

### Create KYC Session

Creates a short-lived KYC link that the WhatsApp agent can send to the customer.

```http
POST /api/kyc/sessions
```

Body:

```json
{
  "provider": "qoreid",
  "purpose": "identity_verification"
}
```

Response:

```json
{
  "id": "kyc_session_id",
  "customer_id": "customer_id",
  "provider": "qoreid",
  "status": "PENDING",
  "expires_at": "2026-08-12T12:30:00.000Z",
  "url": "https://tripkopa2.vercel.app/verify/s/<one_time_token>"
}
```

Send the `url` to the customer on WhatsApp.

### Get KYC Session

```http
GET /api/kyc/sessions/{session_id}
```

Returns the KYC session if it belongs to the asserted WhatsApp customer.

## Flights

### Search Flights

Calls the TakeTrips provider and stores the search result.

`origin` and `destination` may be specific airport IATA codes (`LHR`) or
metropolitan city IATA codes (`LON`). Use a city code when the customer is open
to any airport serving that city; preserve a specifically confirmed airport.

```http
POST /api/flights/searches
```

Body:

```json
{
  "origin": "LOS",
  "destination": "LON",
  "departure_date": "2026-12-24",
  "return_date": null,
  "trip_type": "one_way",
  "adult_count": 1,
  "children_count": 0,
  "infant_count": 0,
  "cabin_class": "Economy",
  "direct": false,
  "all_providers": true,
  "payment_preference": "flexible",
  "ticket_type": "refundable"
}
```

The API also accepts provider-style aliases:

```json
{
  "from": "LOS",
  "to": "LON",
  "departureDate": "2026-12-24",
  "returnDate": null,
  "direct": false,
  "adult": 1,
  "children": 0,
  "infant": 0,
  "cabinClass": "Economy",
  "allProviders": true
}
```

Allowed values:

| Field | Values |
| --- | --- |
| `trip_type` | `one_way`, `return` |
| `payment_preference` | `full`, `flexible` |
| `ticket_type` | `refundable`, `nonrefundable`, `any` |

Defaults: `adult_count: 1`, `children_count: 0`, `infant_count: 0`,
`cabin_class: "Economy"`, `direct: false`, `all_providers: true`,
`payment_preference: "full"`.

Response includes the stored search row and provider results:

```json
{
  "id": "search_id",
  "customer_id": "customer_id",
  "status": "COMPLETED",
  "origin": "LOS",
  "destination": "ABV",
  "results": {}
}
```

### Search Flexible Dates

Register this endpoint as the `tripkopaSearchFlexibleDates` agent tool. One call
searches the complete date window, deduplicates identical itineraries, ranks by
complete NGN party fare, and stores the best five offers.

```http
POST /api/flights/searches/flexible-dates
```

```json
{
  "origin_codes": ["LON"],
  "destination": "LOS",
  "departure_date": "2026-12-29",
  "return_date": "2027-02-18",
  "window_days": 7,
  "preserve_trip_length": true,
  "direct": true,
  "adult_count": 3,
  "children_count": 2,
  "cabin_class": "Economy"
}
```

`origin_codes` and `destination` accept either specific airport IATA codes such
as `LHR` or metropolitan city IATA codes such as `LON`. The legacy
`origin_airports` field is also accepted. Ranked `offer_metadata` always reports
the actual operating airports returned by the itinerary as well as the searched
codes, dates, trip type, and whether the itinerary is direct. `return_date` may
be omitted, `null`, or an empty string for a one-way search; a supplied value
must use `YYYY-MM-DD` and be after `departure_date`.

With `preserve_trip_length: true`, a seven-day window searches 15 date pairs,
from seven days before through seven days after the requested dates. With it
set to `false`, departure and return dates vary independently. The backend
limits execution concurrency; the agent must not call the exact-date tool for
the individual combinations. The combined scope is capped at 225 provider
searches across all origin airports.

The stored search response includes the ranked raw offers in `results.details`
and their explainable fields in `results.offer_metadata`. Scope fields are also
returned at the response top level:

```json
{
  "requested_scope": {},
  "completed_scope": {},
  "price_scope": "party_total",
  "traveller_summary": "3 adults and 2 children",
  "date_combinations_searched": 15,
  "is_complete": true
}
```

`is_complete` is false when any requested provider search fails. In that case,
`completed_scope` reports the successfully completed date combinations and the
agent must not present the partial ranking as the completed comparison.

### Get Flight Search

```http
GET /api/flights/searches/{search_id}
```

## Quotes

### Preflight Quote

```http
POST /api/quotes/preflight
```

Send the same body intended for `POST /api/quotes`. The endpoint runs the authoritative pricing and financing checks without creating a quote. A business-rule problem returns HTTP `200` with `valid: false`, `status: "ADJUSTMENT_REQUIRED"`, and an `issue` object. Revise the proposal with the customer and preflight again. Create the quote only after receiving `valid: true`.

### Create Quote

```http
POST /api/quotes
```

For generated repayment dates:

```json
{
  "search_id":"search_id",
  "booking_type":"flexible",
  "offer_index":0,
  "repayment_plan_request":{
    "mode":"generated",
    "frequency":"weekly",
    "installment_count":4
  }
}
```

Use `monthly` for calendar-month repayments. For a negotiated plan, send `mode: custom` and an ordered `installments` array containing ISO `due_date`; every row must be `PRE_TRAVEL`. Include a positive `amount` on every row for fixed amounts, or omit it from every row for a service-calculated equal split of the final post-deposit balance. Flexible payment requires departure at least 21 calendar days away. The service validates route caps, exact totals, tier eligibility, the 10-day full-balance completion deadline, and the 3-day grace period ending 7 days before departure. Post-travel settlement is not available.

### Get Quote

```http
GET /api/quotes/{quote_id}
```

Response:

```json
{
  "id": "quote_id",
  "status": "ACTIVE",
  "total_amount": "150000",
  "currency": "NGN"
}
```

### Revalidate Quote

Revalidates the selected provider offer before booking. If the saved provider offer has expired, the backend automatically reconstructs the original flight search and attempts to recover the exact itinerary.

```http
POST /api/quotes/{quote_id}/revalidate
```

Body:

```json
{
  "version": 1
}
```

When the exact itinerary is recovered, the response contains a linked replacement quote:

```json
{
  "status": "RECOVERED",
  "recovery_reason": "PROVIDER_QUOTE_EXPIRED",
  "previous_quote_id": "expired-quote-id",
  "search_id": "refreshed-search-id",
  "quote": {
    "id": "replacement-quote-id",
    "status": "ACTIVE",
    "version": 1,
    "total_amount": "180000"
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

Use the replacement quote ID and version. Obtain acceptance when `requires_customer_acceptance` is true.

Other handled responses are:

- `ALTERNATIVES_REQUIRED`: present `alternatives` from the returned refreshed `search_id`; do not recollect trip details.
- `REPAYMENT_PLAN_REQUIRED`: retain the returned search and matched offer, then collect only the required plan adjustment.
- `KYC_REQUIRED`: complete KYC and continue from the preserved search.

HTTP `409` with `recovery_reason: RECOVERY_FAILED` means automatic recovery itself could not run. Retry once, then escalate without asking the customer to restart.

## Bookings

### Create Booking

Creates a booking from a quote.

```http
POST /api/bookings
```

Body:

```json
{
  "quote_id": "quote_id",
  "booking_type": "flexible",
  "passengers": [
    {
      "first_name": "Ada",
      "last_name": "Okafor",
      "date_of_birth": "1995-04-12",
      "gender": "FEMALE",
      "passport_number": "A12345678",
      "passport_expiry": "2030-01-01",
      "email": "ada@example.com",
      "phone": "+2348012345678"
    }
  ],
  "terms_accepted": true,
  "payment_preference": "flexible",
  "quote_version": 1
}
```

Allowed `booking_type` values: `full`, `flexible`.

If `terms_accepted` is `true`, the booking status starts as
`AWAITING_PAYMENT`; otherwise it starts as `AWAITING_TERMS`.

### Get Booking

```http
GET /api/bookings/{booking_id}
```

### Get Itinerary

```http
GET /api/bookings/{booking_id}/itinerary
```

Response includes:

```json
{
  "booking_id": "booking_id",
  "release_level": "FULL",
  "segments": [],
  "ticket_reference": "ABC123"
}
```

### Get Repayment Schedule

```http
GET /api/bookings/{booking_id}/repayment
```

Response:

```json
{
  "booking_id": "booking_id",
  "installments": []
}
```

`GET` evaluates overdue and grace state before returning. Repayment reminders are sent automatically through the configured backend channels according to installment due dates. The customer agent does not trigger or record these messages and should not be given a reminder-send tool.

## Wallet

### Get Wallet

```http
GET /api/wallet
```

Response:

```json
{
  "customer_id": "customer_id",
  "currency": "NGN",
  "balance": "0",
  "virtual_account": {
    "id": "virtual_account_id",
    "account_number": "1234567890",
    "account_name": "TRIPKOPA ADA OKAFOR",
    "bank_name": "Providus Bank",
    "status": "ACTIVE"
  }
}
```

### Get Wallet Ledger

```http
GET /api/wallet/ledger
```

Response:

```json
{
  "entries": [],
  "total": 0
}
```

## Payments

### Create Payment Intent

Creates a pending bank-transfer payment against the customer's Providus virtual
account. Requires a verified/active virtual account.

```http
POST /api/payments/intents
```

Required extra header:

```http
Idempotency-Key: <stable_unique_key_for_this_payment_attempt>
```

Body:

```json
{
  "booking_id": "booking_id",
  "amount": 5000000,
  "currency": "NGN",
  "email": "ada@example.com",
  "payment_type": "booking"
}
```

`amount` is an integer in minor units. For NGN, `5000000` kobo means
₦50,000.00. Payment records and the response continue to express `amount` in
major units.

Response:

```json
{
  "id": "payment_id",
  "status": "PENDING",
  "amount": "50000",
  "currency": "NGN",
  "payment_method": "BANK_TRANSFER",
  "virtual_account": {
    "account_number": "1234567890",
    "account_name": "TRIPKOPA ADA OKAFOR",
    "bank_name": "Providus Bank",
    "status": "ACTIVE"
  }
}
```

### Get Payment

```http
GET /api/payments/{payment_id}
```

### Request Refund

```http
POST /api/payments/{payment_id}/refunds
```

Body:

```json
{
  "amount": 50000,
  "reason": "Customer requested cancellation"
}
```

## Installments

### Get Installment

```http
GET /api/installments/{installment_id}
```

## Operational Events

Returns customer-scoped operational events that can be used by the WhatsApp
agent to explain recent state changes.

```http
GET /api/events
```

Response:

```json
{
  "events": [],
  "total": 0
}
```

## Suggested WhatsApp Agent Flow

1. Call `GET /api/me` when a conversation starts.
2. Call `PATCH /api/me` to collect missing profile fields.
3. Call `GET /api/me/kyc`; if incomplete, call `POST /api/kyc/sessions` and send the returned `url`.
4. Call `POST /api/flights/searches` when the customer gives trip details.
5. Present selected quote options, then call `POST /api/quotes/{quote_id}/revalidate`.
6. Call `POST /api/bookings` after passenger details and terms acceptance.
7. Call `GET /api/wallet` or `POST /api/payments/intents` to provide payment instructions.
8. Poll `GET /api/bookings/{booking_id}`, `GET /api/payments/{payment_id}`, or `GET /api/events` for status updates.
