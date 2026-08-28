# Tripkopa backend

Tripkopa is an API-first travel and payment backend primarily consumed by the
SupaOS WhatsApp agent.

See [docs/API.md](docs/API.md) for the complete endpoint reference, authentication modes, request schemas, workflows, and curl/TypeScript examples.

## Customer authentication

Customer-facing API routes do not use customer OAuth or Supabase sessions.
SupaOS authenticates with a server-side API secret and asserts the WhatsApp
sender in a separate header:

```http
X-API-Key: <WHATSAPP_AGENT_API_SECRET>
X-WhatsApp-Number: +2348012345678
```

The number must be international/E.164. It is normalized before lookup. On the
first valid request, Tripkopa automatically creates an `ACTIVE` customer and an
NGN wallet. Concurrent first-contact requests are protected by database unique
constraints.

Required server environment variables:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
TRIPKOPA_ADMIN_EMAIL=admin@example.com
TRIPKOPA_ADMIN_PASSWORD=use-a-long-unique-password
WHATSAPP_AGENT_API_SECRET=use-a-long-random-secret
WHATSAPP_ACCESS_TOKEN=meta-cloud-api-access-token
WHATSAPP_PHONE_NUMBER_ID=meta-business-phone-number-id
# Public business number used for the post-KYC return-to-chat link.
NEXT_PUBLIC_WHATSAPP_BUSINESS_NUMBER=2348012345678
# Optional; defaults to v24.0.
WHATSAPP_API_VERSION=v24.0
# Optional fallback recipient for one-off service tests; production calls pass `to` dynamically.
WHATSAPP_RECIPIENT=2348012345678
# Notification routing. Each value is a comma-separated channel list.
# Per-type settings override the global fallback; defaults to WHATSAPP.
NOTIFICATION_CHANNELS=WHATSAPP
KYC_SUCCESS_NOTIFICATION_CHANNELS=WHATSAPP,EMAIL
REPAYMENT_REMINDER_NOTIFICATION_CHANNELS=WHATSAPP
# Required whenever EMAIL appears in a configured channel list.
RESEND_API_KEY=re_xxx
RESEND_FROM_EMAIL="Tripkopa <noreply@example.com>"
ONECAP_PARTNER_BASE_URL=https://onecap.example.com
ONECAP_PARTNER_API_KEY=partner-key-issued-to-tripkopa
ONECAP_PARTNER_WEBHOOK_SECRET=independent-hmac-webhook-secret
# Development/test only: bypass QoreID BVN verification with a synthetic success.
QOREID_MOCK_BVN_SUCCESS=false
# Development/test only: skip the real TakeTrips order call after booking payment.
TAKETRIPS_MOCK_ORDER_SUCCESS=false
```

The service-role key and agent secret must never be exposed in browser code or
WhatsApp workflow payloads.

## Operations administrator

Open `/ops/login` and sign in with `TRIPKOPA_ADMIN_EMAIL` and
`TRIPKOPA_ADMIN_PASSWORD`. On the first successful sign-in, the server creates
or updates the matching confirmed Supabase Auth user and assigns its
`staff_profiles` role to `admin`. The browser then uses a normal secure
Supabase session; the environment password is never returned to the client.

The admin dashboard can manage flexible-plan markup, service fees, repayment
timing, route windows, installment limits, tier deposits, financing caps,
bookings, and reconciliation. Rule edits are versioned and audited. Apply all
Supabase migrations before using the dashboard.

### Resolve or create a customer

```bash
curl http://localhost:3000/api/me \
  -H 'X-API-Key: your-agent-secret' \
  -H 'X-WhatsApp-Number: +2348012345678'
```

### Update the customer profile

```bash
curl -X PATCH http://localhost:3000/api/me \
  -H 'Content-Type: application/json' \
  -H 'X-API-Key: your-agent-secret' \
  -H 'X-WhatsApp-Number: +2348012345678' \
  --data '{
    "title": "MR",
    "first_name": "John",
    "last_name": "Doe",
    "email": "john@example.com",
    "date_of_birth": "1990-01-01",
    "gender": "MALE",
    "preferred_currency": "NGN"
  }'
```

The WhatsApp number and account status cannot be changed through this profile
endpoint. Verified legal identity remains KYC-provider data, in accordance with
the PRD. WhatsApp number recovery is an operations workflow.

KYC browser links use their own short-lived, HTTP-only session after exchanging
the one-time link. Operations routes continue to use staff authentication, and
provider webhooks continue to use provider signature verification.

## OneCap / Providus payments

Tripkopa does not call Providus directly. It uses the OneCap partner middleware,
which proxies requests under OneCap's Providus credentials and identity.

The customer completes BVN verification in the short-lived KYC browser session.
Tripkopa sends the BVN to QoreID and then OneCap within the same server request;
the raw BVN is never written to the database, returned to SupaOS, or placed in a
webhook payload. After successful verification, the Providus account is stored
against the Tripkopa customer and returned by `GET /api/wallet`.

For development or provider outage testing, set `QOREID_MOCK_BVN_SUCCESS=true`
to return a synthetic successful QoreID BVN result. This still requires the
normal KYC browser session, customer name/email, and OneCap virtual-account
provisioning before the KYC session is marked `VERIFIED`.

Payment instructions are created with:

```http
POST /api/payments/intents
X-API-Key: <WHATSAPP_AGENT_API_SECRET>
X-WhatsApp-Number: +2348012345678
Idempotency-Key: <unique-agent-operation-id>
Content-Type: application/json

{
  "amount": 5000,
  "currency": "NGN",
  "payment_type": "wallet_deposit"
}
```

The response contains the customer's dedicated Providus virtual account rather
than a Paystack checkout URL.

Configure the OneCap partner callback URL as:

```text
https://<tripkopa-host>/api/webhooks/payments/onecap
```

Tripkopa validates `X-Partner-Signature` as HMAC-SHA256 over the exact raw JSON
body. A valid `deposit.success` callback is posted atomically: the event is
deduplicated, the payment is recorded, balanced customer/clearing ledger entries
are inserted, the wallet is credited, and a `payment.succeeded` event is queued.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
