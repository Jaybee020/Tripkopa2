# Tripkopa Agent Financing and Notification Integration

Document version: 1.0  
Last updated: 18 August 2026

## 1. Purpose

This document describes the customer-agent changes required for Tripkopa's trust-based flexible-payment flow. It covers:

- the new financing-profile tool;
- modified flight-search, quote, revalidation, and booking tools;
- generated and customer-proposed repayment plans;
- quote-version handling;
- configurable, multi-channel KYC and repayment notifications;
- endpoints that must not be exposed to the customer agent.

This document supplements the complete [WhatsApp Agent API](./whatsapp-agent-api.md).

## 2. Required Agent Changes

### 2.1 Change summary

| Agent tool | Method and path | Change | Required action |
| --- | --- | --- | --- |
| `tripkopaGetFinancingProfile` | `GET /api/me/financing` | New | Add this tool. Call it before negotiating or creating a flexible plan. |
| `tripkopaSearchFlights` | `POST /api/flights/searches` | Modified | Add optional `ticket_type`. Do not send financing terms to this endpoint. |
| `tripkopaCreateQuote` | `POST /api/quotes` | Modified | Add `repayment_plan_request` for generated or custom plans. |
| `tripkopaRevalidateQuote` | `POST /api/quotes/{quote_id}/revalidate` | Modified | Retain the returned quote `version` and all recalculated terms. |
| `tripkopaCreateBooking` | `POST /api/bookings` | Modified | Send the latest revalidated version as `quote_version`. |
| `tripkopaGetRepaymentSchedule` | `GET /api/bookings/{booking_id}/repayment` | Behaviour updated | Handle `OVERDUE`, `GRACE`, `DEFAULTED`, and booking `CANCELLATION_REVIEW`. |

There is no agent-facing repayment-reminder tool. Reminder timing and delivery are owned by the backend cron.

## 3. Authentication

Every customer-agent request must contain:

```http
X-API-Key: <WHATSAPP_AGENT_API_SECRET>
X-WhatsApp-Number: +2348012345678
Content-Type: application/json
```

`X-WhatsApp-Number` identifies the customer and must use E.164 format. Resource IDs are customer-scoped and must be used exactly as returned.

## 4. New Financing Profile Tool

### 4.1 Request

```http
GET /api/me/financing
```

No request body is required.

### 4.2 Example response

```json
{
  "computed_tier": "EXPLORER",
  "effective_tier": "EXPLORER",
  "successful_cycles": 7,
  "on_time_repayment_rate": 0.95,
  "reminder_dependency_rate": 0.14,
  "kyc_verified": true,
  "deposit_rates": {
    "domestic": 0.30,
    "regional": 0.40,
    "international": 0.50
  },
  "financing_caps": {
    "domestic": 350000,
    "regional": 1200000,
    "international": 1700000
  },
  "post_travel_max_percentage": 0,
  "rule_version": "flex_v2_2026_08"
}
```

### 4.3 Agent rules

- Call this endpoint after KYC and before creating a flexible quote.
- Use `effective_tier`, not `computed_tier`, for customer eligibility.
- Treat the returned deposit rates, caps, post-travel allowance, and rule version as authoritative.
- Do not manually calculate or promise a final deposit. The quote response is the source of truth for the actual amount.
- The public tier may be disclosed when useful.
- Do not disclose repayment-rate metrics, reminder dependency, internal risk events, scoring logic, or rule calculations.

## 5. Flight Search Update

`tripkopaSearchFlights` may now send:

```json
{
  "origin": "LOS",
  "destination": "LHR",
  "departure_date": "2026-12-20",
  "return_date": null,
  "trip_type": "one_way",
  "adult_count": 1,
  "children_count": 0,
  "infant_count": 0,
  "cabin_class": "Economy",
  "direct": false,
  "all_providers": true,
  "ticket_type": "refundable"
}
```

Allowed `ticket_type` values are:

- `refundable`
- `nonrefundable`
- `any`

Ticket type is an inventory filter, not a refund guarantee. Only describe a fare as refundable when the provider result confirms it.

Do not send payment preference, deposit, trust tier, markup, repayment duration, installment count, wallet information, or a repayment plan to flight search.

## 6. Quote Creation

### 6.1 Full payment

```http
POST /api/quotes
```

```json
{
  "search_id": "6ad4adba-6b06-498a-b1c2-8b82e376494f",
  "booking_type": "full",
  "offer_index": 0
}
```

The backend applies the standard service fee and returns the final NGN amount.

### 6.2 Generated flexible plan

Before this request:

1. confirm latest KYC status is `VERIFIED`;
2. call `tripkopaGetFinancingProfile`;
3. ask whether the customer prefers weekly or monthly repayments;
4. collect the desired repayment count within the route limit.

Weekly example:

```json
{
  "search_id": "6ad4adba-6b06-498a-b1c2-8b82e376494f",
  "booking_type": "flexible",
  "offer_index": 0,
  "repayment_plan_request": {
    "mode": "generated",
    "frequency": "weekly",
    "installment_count": 4
  }
}
```

Monthly example:

```json
{
  "search_id": "6ad4adba-6b06-498a-b1c2-8b82e376494f",
  "booking_type": "flexible",
  "offer_index": 0,
  "repayment_plan_request": {
    "mode": "generated",
    "frequency": "monthly",
    "installment_count": 3
  }
}
```

The backend generates ordinary repayments so the final pre-travel repayment is due 14 days before departure.

### 6.3 Generated plan with post-travel settlement

Only include `post_travel` when `post_travel_max_percentage` is greater than zero and the customer explicitly accepts post-travel settlement.

```json
{
  "search_id": "6ad4adba-6b06-498a-b1c2-8b82e376494f",
  "booking_type": "flexible",
  "offer_index": 0,
  "repayment_plan_request": {
    "mode": "generated",
    "frequency": "monthly",
    "installment_count": 4,
    "post_travel": {
      "percentage": 10,
      "frequency": "monthly",
      "installment_count": 2
    }
  }
}
```

The combined pre-travel and post-travel installment count must remain within the route limit. Post-travel repayments must finish within 90 days after travel completion.

### 6.4 Customer-proposed custom plan

For an equal split across customer-selected dates, omit `amount` from every row. The backend calculates the flexible-payment grand total and tier deposit first, then splits the post-deposit balance exactly:

```json
{
  "search_id": "6ad4adba-6b06-498a-b1c2-8b82e376494f",
  "booking_type": "flexible",
  "offer_index": 0,
  "repayment_plan_request": {
    "mode": "custom",
    "installments": [
      { "due_date": "2026-10-01", "phase": "PRE_TRAVEL" },
      { "due_date": "2026-11-01", "phase": "PRE_TRAVEL" }
    ]
  }
}
```

The customer may propose exact amounts and dates:

```json
{
  "search_id": "6ad4adba-6b06-498a-b1c2-8b82e376494f",
  "booking_type": "flexible",
  "offer_index": 0,
  "repayment_plan_request": {
    "mode": "custom",
    "installments": [
      {
        "amount": 50000,
        "due_date": "2026-10-01",
        "phase": "PRE_TRAVEL"
      },
      {
        "amount": 45000,
        "due_date": "2026-11-01",
        "phase": "PRE_TRAVEL"
      }
    ]
  }
}
```

The backend validates:

- exact outstanding-plan total;
- positive amounts;
- unique ascending future dates;
- route installment limits;
- financing duration;
- completion at least 10 days before departure;
- trust-tier post-travel eligibility;
- the 90-day post-travel deadline.

Custom installment amounts are repayments after the initial deposit. Their sum must therefore equal the backend-priced `total_amount - deposit_amount`, after flexible-payment charges and tier rules have been applied. Do not split the flight-search fare or the final `total_amount` itself.

Custom rows must either all include `amount` (fixed-amount mode) or all omit it (equal-split mode). Mixed rows are invalid.

Because the flight-search fare is not an authoritative flexible-payment quote, the quote API may return `SCHEDULE_TOTAL_MISMATCH` with `required_amount` and `scheduled_amount`. Treat `required_amount` as the exact post-deposit balance. If the customer requested an equal or proportional split, preserve the accepted dates and phases, resplit `required_amount` to exact cents, and retry once. If the customer explicitly chose fixed amounts, obtain their approval before changing those amounts.

If rejected, use the returned `required_amount`, `scheduled_amount`, `maximum_installments`, or `maximum_percentage` to help the customer revise the plan. Do not approve the plan through conversational arithmetic.

### 6.5 Route limits

| Route | Maximum financing window | Maximum repayments after deposit |
| --- | ---: | ---: |
| Domestic | 12 weeks | 4 |
| Regional | 16 weeks | 6 |
| International | 24 weeks | 8 |

### 6.6 Legacy-field rule

Do not send both of these fields:

```text
installment_count
repayment_plan_request
```

For the new flow, prefer `repayment_plan_request`. Omit optional fields instead of sending `0`, `null`, an empty offer, or placeholder values.

### 6.7 Quote response usage

For flexible quotes, present only backend-returned customer-facing information:

- `total_amount`
- `deposit_amount`
- outstanding balance
- installment amounts and due dates from `details.pricing.repayment_plan`
- repayment and grace deadlines
- quote expiry

Do not expose markup percentages, risk pricing, rule snapshots, or behavioral calculations. Quotes expire after 10 minutes.

## 7. Quote Revalidation and Booking

### 7.1 Revalidate immediately before booking or payment

```http
POST /api/quotes/{quote_id}/revalidate
```

Send the current version when known:

```json
{
  "version": 1
}
```

The backend rechecks the provider offer, current fare, current effective tier, and active rules. A successful revalidation returns an updated quote and increments `version`.

If the amount, deposit, repayment schedule, or terms changed materially, obtain customer acceptance again.

### 7.2 Automatic expiry recovery

If provider validation reports that the saved offer is expired or unavailable, the same endpoint automatically:

1. loads the original stored search;
2. repeats the provider search with the saved route, dates, passenger composition, cabin, direct setting, and ticket preference;
3. matches the original itinerary by carrier, flight number, airports, and timestamps;
4. validates the matched fresh offer;
5. recalculates the fare, tier-based deposit, markup, and repayment schedule;
6. creates a linked replacement quote and marks the old quote `SUPERSEDED`.

Handle the result by status:

| Status | Meaning | Agent action |
| --- | --- | --- |
| Normal quote | Original offer remains valid | Use the returned quote and version. |
| `RECOVERED` | Exact itinerary recovered | Replace all old quote state with `quote`. Obtain acceptance when `changes.requires_customer_acceptance` is true. |
| `ALTERNATIVES_REQUIRED` | Original itinerary is unavailable | Present `alternatives` from the returned `search_id`; ask only for a new offer selection. |
| `REPAYMENT_PLAN_REQUIRED` | Flight recovered but old schedule no longer fits | Preserve `search_id` and `matched_offer_index`; collect only the necessary plan revision. |
| `KYC_REQUIRED` | Current KYC prerequisite is missing | Complete KYC, then continue with the preserved search. |
| HTTP `409`, `RECOVERY_FAILED` | Recovery infrastructure/provider call failed | Retry once, then escalate without restarting discovery. |

For `RECOVERED`, never use `previous_quote_id` for booking. Use `quote.id` and `quote.version`.

### 7.3 Create booking with the returned version

```http
POST /api/bookings
```

```json
{
  "quote_id": "ad4cb4cb-667c-4884-a8d4-e280911142ff",
  "booking_type": "flexible",
  "passengers": [
    {
      "first_name": "Ada",
      "middle_name": "Chiamaka",
      "last_name": "Okafor",
      "date_of_birth": "1995-04-12",
      "gender": "FEMALE",
      "email": "ada@example.com"
    }
  ],
  "terms_accepted": true,
  "payment_preference": "flexible",
  "quote_version": 2
}
```

`quote_version` must equal the version returned by the most recent revalidation. Never reuse the previous version or previous pricing after revalidation.

## 8. Recommended Flexible-Payment Call Sequence

```text
sendMessage(short acknowledgement)
  -> tripkopaSearchFlights
  -> customer selects offer
  -> tripkopaGetCustomer
  -> tripkopaGetKycStatus
  -> create KYC session if not verified; stop quote creation until VERIFIED
  -> tripkopaGetFinancingProfile
  -> ask custom plan or generated weekly/monthly plan
  -> tripkopaCreateQuote
  -> present backend-returned deposit and schedule
  -> customer accepts terms
  -> tripkopaRevalidateQuote
  -> obtain acceptance again if terms changed
  -> tripkopaCreateBooking with latest quote_version
  -> create payment instructions for the required deposit
```

The preliminary acknowledgement is a normal `sendMessage` action and does not require a Tripkopa API endpoint.

## 9. Notifications Are Backend-Owned

### 9.1 Successful KYC notification

After BVN verification and virtual-account provisioning succeed, the backend automatically notifies the customer through each configured channel. The notification:

- confirms identity-verification success;
- confirms that the dedicated Tripkopa wallet account is ready;
- never contains the BVN;
- uses provider-level idempotency to avoid duplicates;
- is retried by a later KYC-status read if a prior delivery attempt failed.

The customer agent must not call a separate KYC-message tool.

### 9.2 Repayment-reminder cron

Vercel invokes this internal endpoint daily:

```http
GET /api/cron/repayment-reminders
Authorization: Bearer <CRON_SECRET>
```

Default schedule:

| Timing | Notification action |
| --- | --- |
| 7, 3, and 1 day before an installment | Upcoming reminder |
| Due date | Due-today reminder |
| 1, 2, 3, and 7 days overdue | Overdue or grace reminder |

The cron processes unpaid and partially paid installments, recalculates lifecycle states, fans out through the configured channel adapters, prevents per-channel duplicates with deterministic database idempotency keys, and counts a reminder once when at least one channel succeeds.

This endpoint is backend-only. Do not register it as an agent tool and never give the agent `CRON_SECRET`.

The agent may continue to use repayment read tools to explain amounts, due dates, `OVERDUE`, `GRACE`, `DEFAULTED`, or `CANCELLATION_REVIEW` states.

## 10. Error Handling

| Status | Typical condition | Agent action |
| --- | --- | --- |
| `400` | Invalid fields or offer price could not be inferred | Correct the request. Retrieve the stored offer and send a verified positive NGN `base_amount` only when required. |
| `401` | Invalid agent API key | Stop and escalate configuration. |
| `403` | Suspended or closed customer | Stop the transaction and provide support escalation. |
| `404` | Search, quote, booking, or offer not found | Verify that the exact backend ID and correct customer identity were used. |
| `409` | KYC missing, stale version, or automatic recovery failed | Complete KYC, use the latest version, or retry recovery once and escalate. Do not make the customer restart. |
| `422` | Plan violates totals, dates, duration, tier, cap, or post-travel rules | Explain the returned customer-facing constraint and revise the plan. |
| `500` | Provider or server failure | Apologize, avoid claiming success, and retry safely or escalate. |

Never create a booking from a `SUPERSEDED` or `REPRICE_REQUIRED` quote. Use the replacement under `RECOVERED`, or the preserved search context returned with alternatives or plan-adjustment states.

## 11. Deployment Configuration

Required backend environment variables:

```text
WHATSAPP_AGENT_API_SECRET
WHATSAPP_ACCESS_TOKEN
WHATSAPP_PHONE_NUMBER_ID
WHATSAPP_API_VERSION=v24.0
RESEND_API_KEY
RESEND_FROM_EMAIL
CRON_SECRET
```

The Meta variables are required when any configured list contains `WHATSAPP`. The Resend variables are required when any configured list contains `EMAIL`.

Optional reminder configuration:

```text
REPAYMENT_REMINDER_DAYS_BEFORE=7,3,1,0
REPAYMENT_OVERDUE_REMINDER_DAYS=1,2,3,7
REPAYMENT_REMINDER_BATCH_SIZE=500
NOTIFICATION_CHANNELS=WHATSAPP
KYC_SUCCESS_NOTIFICATION_CHANNELS=WHATSAPP,EMAIL
REPAYMENT_REMINDER_NOTIFICATION_CHANNELS=WHATSAPP
```

Apply these migrations before deployment:

```text
supabase/migrations/0006_financing_engine.sql
supabase/migrations/0007_email_repayment_reminders.sql
supabase/migrations/0008_quote_recovery.sql
supabase/migrations/0011_multichannel_notifications.sql
```

## 12. Implementation Checklist

- [ ] Add `tripkopaGetFinancingProfile`.
- [ ] Keep `tripkopaCreateQuote` registered as `POST /api/quotes`.
- [ ] Add `ticket_type` to the flight-search schema.
- [ ] Add `repayment_plan_request` to quote creation.
- [ ] Support generated weekly and monthly plans.
- [ ] Support exact custom amount/date rows.
- [ ] Read and retain the revalidated quote `version`.
- [ ] Handle `RECOVERED`, `ALTERNATIVES_REQUIRED`, `REPAYMENT_PLAN_REQUIRED`, and `KYC_REQUIRED` revalidation results.
- [ ] Replace the old quote ID with `quote.id` after successful recovery.
- [ ] Send the latest version as `quote_version` during booking.
- [ ] Handle the new repayment lifecycle states.
- [ ] Remove any agent repayment-reminder send/record tool.
- [ ] Do not expose the cron endpoint or staff risk-management endpoints.
- [ ] Send a short acknowledgement before potentially slow operations.
- [ ] Present only backend-returned customer-facing prices and terms.
