# Tripkopa Backend Product Requirements Document

**Document status:** Draft for implementation  
**Product:** Tripkopa Backend Platform  
**Primary consumer:** SupaOS WhatsApp agent  
**Backend type:** API-first, deterministic application backend  
**Last updated:** 6 August 2026

## 1. Purpose

Build the node server backend for Tripkopa. The backend will expose structured APIs for:

- customer identification by WhatsApp number;
- KYC session creation and KYC-status tracking;
- flight search, quotation, revalidation and booking;
- full-payment and flexible-payment bookings;
- wallet, payment, installment and refund processing;
- itinerary and repayment data retrieval;
- provider webhook processing;
- operational events consumed by SupaOS.

SupaOS owns the WhatsApp conversation, prompts, intent recognition and customer messaging. The Tripkopa backend owns business state, calculations, authorization, provider calls and financial records.

## 2. Product boundary

### 2.1 In scope

- REST/JSON APIs consumed by SupaOS and the KYC web UI.
- Deterministic flight and payment rules.
- Provider factories and provider-neutral domain models.
- Customer records keyed by normalized WhatsApp number.
- Secure one-time links for KYC completion on a web UI.
- Domestic, regional African and international flights.
- One-way and return trips.
- Standard full-payment bookings.
- Flexible-payment bookings with deposits and installments.
- Configurable pricing, deposit, repayment and cancellation rules.
- Immutable financial ledger and payment reconciliation.
- Partial and full itinerary release rules.
- Signed events/webhooks sent to SupaOS.
- Internal operations endpoints for authorized staff.

### 2.2 Out of scope

- LLMs, prompts, RAG, embeddings or vector databases.
- Natural-language interpretation.
- Conversation memory.
- Direct WhatsApp message ingestion or delivery.
- AI underwriting or behavioural scoring.
- Airline, payment or KYC provider-specific logic outside provider adapters.
- Card-number collection or storage.
- A general-purpose customer mobile application.

### 2.3 Separation of responsibilities

| Responsibility | SupaOS | Tripkopa backend |
|---|---:|---:|
| Receive and send WhatsApp messages | Yes | No |
| Understand natural-language requests | Yes | No |
| Identify the WhatsApp sender | Yes | Validates signed identity assertion |
| Enforce booking and payment rules | No | Yes |
| Calculate prices and installments | No | Yes |
| Call flight/payment/KYC providers | No | Yes |
| Decide whether an operation is authorized | No | Yes |
| Store financial and booking state | No | Yes |
| Generate customer-facing prose | Yes | Returns structured facts only |
| Emit booking/payment/KYC events | Receives | Yes |

## 3. Core design principles

1. **The backend is the source of truth.** The agent must never calculate prices, balances, eligibility, refund amounts or booking state.
2. **WhatsApp number is the customer identifier.** It must arrive in a cryptographically signed SupaOS assertion, not as a caller-controlled request field.
3. **Every external integration uses an abstraction.** Business services must not import provider-specific SDKs directly.
4. **Quotes are temporary.** Every offer must be revalidated before payment commitment or ticket issuance.
5. **Money is ledger-backed.** Balances are derived from immutable ledger entries.
6. **Provider webhooks are authoritative for asynchronous payment and KYC results.** Redirect pages alone must not mark operations successful.
7. **Mutations are idempotent.** Retries must not create duplicate payments, bookings or refunds.
8. **Sensitive KYC data stays out of SupaOS, WhatsApp and ordinary backend logs.**
9. **Rules are configured and versioned.** Existing bookings retain the rule version accepted by the customer.

## 4. Actors

- **Customer:** Interacts through the Tripkopa WhatsApp number and completes KYC in the web UI.
- **SupaOS agent:** Converts customer requests into structured backend API calls and renders structured responses conversationally.
- **KYC web UI:** Collects consent and identity information and embeds or redirects to the selected KYC provider.
- **Operations user:** Reviews exceptions, provider failures, cancellations and reconciliations.
- **Flight provider:** Supplies flight inventory, fares, reservations, ticketing and cancellation information.
- **Payment provider:** Supplies checkout, virtual accounts, transfers, refunds and transaction webhooks.
- **KYC provider:** Verifies BVN/NIN and other required identity evidence.

## 5. Authentication and customer identity

### 5.1 Customer authentication model

For the initial release, control of the WhatsApp account is the only customer authentication factor. The canonical identity is the normalized WhatsApp number in E.164 format, for example `+2348012345678`.

This is implemented as follows:

1. SupaOS verifies that an inbound event came from the configured WhatsApp integration.
2. SupaOS calls Tripkopa using a secret key credential.

3. Tripkopa validates the secret key.
5. Tripkopa resolves or creates the internal `customer_id` from the asserted WhatsApp number.


### 5.2 Loan Score calculation
There is an algorithm that calculates the scores of users and whethere we are able to give them a loan to finance their trip.
Tripkopa AI Risk Manager & Behavioural Intelligence Engine
Master Strategic Framework
Executive Summary
Tripkopa is not fundamentally a flight-booking company.
Tripkopa is building:
 • behavioural travel-financing infrastructure
 • conversational underwriting systems
 • repayment orchestration intelligence
 • behavioural trust architecture for mobility access
Tripkopa's core strategic moat is not airline inventory.
The moat is:
 • behavioural intelligence
 • repayment predictability
 • trust-based financing
 • risk orchestration
 • AI-driven underwriting
 • behavioural mobility scoring
The AI Risk Manager exists to continuously evaluate:
 • trustworthiness
 • repayment reliability
 • behavioural consistency
 • operational risk
 • travel intent stability
 • fraud probability
 • financing exposure
 • repayment deterioration risk
 • user lifetime value
The objective is not simply to approve or reject users.
The objective is to:
 “Predict behavioural reliability before financial failure occurs.”

SECTION 1: CORE RISK PHILOSOPHY
Introduction
Traditional lenders base underwriting on static income data, asking if a user can afford repayment. Tripkopa shifts this paradigm by deploying behavioural underwriting techniques to ask how reliably a user behaves under structured financial obligations over time.
Primary Table: Evaluation Dimensions
Category
Purpose
Analytical Focus
Identity Stability
Verify real user status
Metadata and digital footprints
Repayment Discipline
Assess obligation reliability
Punctuality and reminder dependency
Behavioural Stability
Track momentum
Identification of sudden behavioural drift
Financial Rhythm
Measure cash flow stability
Transaction regularity and volatility

Interpretation
This table outlines the foundational pillars of Tripkopa's risk assessment. By tracking these categories, the AI engine shifts focus away from asset-backed collateral toward ongoing behavioural consistency, which is a stronger predictor of repayment in emerging markets.

Secondary Table(s): Traditional vs. Behavioural Underwriting
Traditional Lending Model
Tripkopa Behavioural Model
Focuses on static income snapshots
Focuses on continuous behavioural rhythm
Punishes past failures permanently
Evaluates current behavioural momentum

Operational Rules
The system must evaluate behaviour consistently over time, rather than relying on one-off snapshots.
Behavioural consistency overrides stated income in the final decision matrix.

Exceptions (where applicable)
Users with heavily documented, flawless traditional credit histories may bypass initial behavioural probation periods.

Core Principle
Predict behavioural reliability before financial failure occurs.


SECTION 2: STRATEGIC RISK OBJECTIVES
Introduction
The AI Risk Engine acts as the central nervous system for all financing decisions. Its strategic objective is not simply to facilitate credit but to dynamically orchestrate risk, protecting capital while maximising travel access for reliable users.

Primary Table: Core Objectives
Objective
Execution Mechanism
Reduce Default Exposure
Early detection of behavioural deterioration
Improve Predictability
Continuous monitoring of repayment rhythms
Personalise Exposure
Algorithmic limit and deposit adjustments
Prevent Settlement Abuse
Strict gating of post-travel financing

Interpretation
These objectives ensure the risk engine remains proactive rather than reactive. By personalising exposure, Tripkopa can safely scale its portfolio without uniformly increasing its risk appetite.

Secondary Table(s): Target Outcomes
Risk Metric
Target Outcome
Early Deterioration Detection
Flag hidden high-risk patterns before debt hits the books
Fraud Identification
Zero-tolerance automated restriction

Operational Rules
Risk objectives must be continually back-tested against actual repayment outcomes.
The system must prioritise capital protection over aggressive loan book expansion.

Exceptions (where applicable)
N/A

Core Principle
Risk management must be dynamic, continuous, and highly personalised.


SECTION 3: THE 4-LAYER RISK ARCHITECTURE
Introduction
Risk cannot be evaluated through a single lens. Tripkopa utilises a multi-tiered architecture that progresses from basic identity verification up to complex portfolio exposure control.

Primary Table: The 4 Layers
Layer
Purpose
Evaluation Focus
1: Identity & Fraud
Determine WHO the user is
BVN, device consistency, login geolocation
2: Behavioural Intelligence
Determine HOW the user behaves
Repayment timing, support interaction
3: Predictive Trajectory
Determine WHERE the user is heading
Momentum shifts, default probability
4: Exposure Control
Determine HOW MUCH risk to carry
Route volatility, portfolio concentration

Interpretation
A user must successfully pass the lower layers (identity and behaviour) before the system calculates their predictive trajectory and assigns capital exposure. Failure at Layer 1 immediately halts progression.

Secondary Table(s): Layer Failure Impact
Layer Failure
System Action
Layer 1 Failure
Immediate account restriction
Layer 2 Deterioration
Deposit requirement increased
Layer 4 Overextension
Financing limits capped

Operational Rules
Layer 1 must utilise device metadata and digital footprints to detect impersonation without compromising data privacy.
Layer 3 must continuously recalculate based on new inputs from Layer 2.

Exceptions (where applicable)
Layer 4 exposure limits may be temporarily expanded during targeted promotional periods for Elite-tier users.
Core Principle
Risk evaluation is a stacked, sequential, and continuous process.


SECTION 4: MASTER TRUST SCORE (0–1000)
Introduction
The Master Trust Score is the primary quantifiable metric of a user's behavioural reliability. It consolidates multiple data streams into a highly reactive score that prioritises recent actions.

Primary Table: Trust Score Weighting Model
Component
Weight
Repayment Discipline
35%
Behavioural Stability
20%
Financial Stability
15%
Travel Reliability
10%
Exposure Behaviour
5%
Communication Reliability
5%
Identity & Fraud Confidence
5%
Loyalty & Platform Value
5%

Interpretation
Repayment and stability metrics account for 70% of the total score, ensuring that consistent financial discipline remains the overriding factor in trust calculation.

Secondary Table(s): Scoring Dynamics
Score Action
Formula Impact
Positive Action
Gradual, compounding score increase
Negative Action
Immediate, weighted score reduction

Operational Rules
The score must update dynamically within 24 hours of any material user action.
The Identity & Fraud component serves as a baseline; severe failures here nullify positive scores in other categories.

Exceptions (where applicable)
System errors or platform outages that result in missed actions will not negatively affect the score.

Core Principle
Repayment behaviour must dominate the trust ecosystem.


SECTION 5: REPAYMENT DISCIPLINE ENGINE (35%)
Introduction
This engine evaluates the exact mechanics of how repayments occur, rather than merely logging whether they occur. It represents the single strongest predictor of financing reliability.

Primary Table: Repayment Signals
Positive Signals
Impact
Negative Signals
Impact
Post-travel settlement completion
+30
Failed post-travel settlement
-150
High-value repayment completion
+25
Missed repayment
-120
Completing a full repayment cycle
+20
Ghosting support during delinquency
-80
Early repayment / Pre-funding
+15
Broken repayment promise
-70
Consistent repayment timing
+12
Late repayment (8–14 days)
-60

Interpretation
The scoring deliberately skews negative. One major repayment failure erases the trust built by multiple positive actions, accurately mimicking the reality of financial underwriting.

Secondary Table(s): Minor Negative Signals
Minor Negative Signals
Impact
Late repayment (4–7 days)
-30
Wallet depletion immediately after paying
-10
Excessive reminder dependency
-10

Operational Rules
Early repayments or pre-funding wallets before due dates generate the strongest positive signals.
Dependency on automated reminders reduces the quality of a positive repayment.

Exceptions (where applicable)
Bank routing delays outside the user's control are excluded from late penalties.

Core Principle
Negative repayment behaviour must mathematically outweigh positive repayment behaviour.


SECTION 6: BEHAVIOURAL STABILITY ENGINE (20%)
Introduction
Humans reveal latent risk through behavioural drift. This engine measures consistency over time to detect early warning signs of instability before they manifest as missed payments. Research demonstrates that incorporating behavioural stability metrics improves predictive accuracy for thin-file borrowers.

Primary Table: Stability Signals
Positive Stability Signals
Impact
Negative Stability Signals
Impact
Long-term behavioural consistency
Compounding
Financial rhythm deterioration
-60
Stable wallet funding behaviour
+15
Identity inconsistencies
-50
Stable repayment cadence
+15
Sudden repayment slowdown
-40
Consistent travel behaviour
+12
Device hopping
-30
Predictable booking timing
+10
Panic booking behaviour
-25

Interpretation
Predictability is rewarded. Sudden shifts, such as logging in from multiple devices rapidly or shifting from planned bookings to last-minute panic bookings, are flagged as risk indicators.

Secondary Table(s): Measurement Confidence
Stability Measurement Window
Weighting
30 Days
Low Confidence
90 Days
Moderate Confidence
180+ Days
High Confidence

Operational Rules
The engine must track the variance between a user's historical median behaviour and their current actions.
Device hopping without multi-factor authentication triggers immediate stability penalties.

Exceptions (where applicable)
Sudden travel changes caused by verifiable emergencies can be manually exempted.

Core Principle
Consistency is the most reliable proxy for future safety.


SECTION 7: FINANCIAL STABILITY ENGINE (15%)
Introduction
Tripkopa does not attempt to measure wealth; it measures financial rhythm. Alternative data trails, such as wallet transaction patterns and cash-flow regularity, provide a highly predictive indicator of a user's ability to sustain obligations.

Primary Table: Financial Rhythm Signals
Positive Signals
Impact
Negative Signals
Impact
Stable wallet inflows
+20
Sudden cash-flow collapse
-70
Salary-like funding rhythm
+20
Loan-stacking indicators
-60
Healthy wallet buffers
+15
Gambling-heavy transaction patterns
-50
Predictable funding cycles
+15
Extreme funding volatility
-45
Low-volatility wallet behaviour
+12
Severe wallet depletion
-40

Interpretation
Users who maintain healthy wallet buffers and predictable inflows present significantly less risk than users with highly volatile, hand-to-mouth transaction patterns.

Secondary Table(s): Rhythm Archetypes
Rhythm Archetypes
Risk Level
Salary Earner (Predictable Monthly)
Low Risk
Stable Merchant (Daily/Weekly Inflows)
Low-Medium Risk
Erratic Gig Worker (High Volatility)
High Risk

Operational Rules
Monitor for "loan-stacking" patterns, where funds are rapidly moved to other known credit providers.
High wallet depletion immediately prior to travel dates must flag a liquidity warning.

Exceptions (where applicable)
Seasonal workers (e.g., agricultural or tourism merchants) whose volatility is predictable on an annual basis.
Core Principle
Predictable cash flows are safer than unpredictable wealth.


SECTION 8: TRAVEL RELIABILITY ENGINE (10%)
Introduction
Travel behaviour itself is a potent behavioural signal. This engine assesses the operational cost the user incurs on the platform by evaluating their commitment to itineraries and chosen routes.

Primary Table: Travel Signals
Positive Signals
Impact
Negative Signals
Impact
Successfully completed trips
+15
No-show behaviour
-70
Employer/business travel patterns
+15
Frequent cancellations
-40
Predictable travel frequency
+12
High-risk one-way routes
-35
Repeat routes / Return trips
+10
Unusual route instability
-20
Early booking behaviour
+8
Excessive emergency bookings
-15

Interpretation
Business travellers and users who successfully complete return trips create stable, predictable revenue. Users prone to no-shows or high-risk one-way flights present both financial and operational liabilities.

Secondary Table(s): Route Profiles
Route Profile
Risk Assignment
Domestic Return
Lowest
International Return
Low
International One-Way
High


Here is the clear definition of Low, Medium, and High-Risk routes:
Low-Risk Routes: These routes are highly predictable, recurrent, and typically involve domestic or short-haul travel. Because the traveller has a return ticket and is likely travelling for routine business or regular family visits, the default risk is minimal.
Characteristics: Round-trip, low-to-moderate ticket value, high frequency of travel.
Examples: Domestic return flights (e.g., Nairobi to Mombasa) and established inter-city business corridors (e.g., Lagos to Abuja).
Medium-Risk Routes: These consist of regional, intra-continental leisure travel or standard international round-trip. They carry slightly more risk due to higher ticket values and cross-border complexities, but the presence of a return ticket indicates a clear intent to come back.
Characteristics: Round-trip, higher ticket value, often associated with family vacations or premium leisure travel.
Examples: Highly trafficked intra-African routes, such as flights from Nigeria to South Africa, where BNPL is heavily utilised for family travel. It also includes standard long-haul round-trips to international hubs such as London and Dubai.
High-Risk (and Severe-Risk) Routes: These routes carry the highest probability of financial default and operational complexity. They are typically characterised by expensive one-way international flights, often linked to permanent relocation or migration. Once a traveller leaves the country on a one-way ticket, the platform's ability to enforce repayment drops drastically.
Characteristics: One-way tickets, first-time high-value purchases, out-of-continent travel, or routes with historically high cancellation and no-show rates.
Examples: Panic international bookings, first-time high-ticket routes (e.g., Accra to London), or migration-linked one-way tickets (e.g., Lagos to Canada).
Operational Rules
The AI must calculate the product of user risk and route risk to determine the final travel reliability.
No-show behaviour must trigger an automatic downgrade in financing eligibility.

Exceptions (where applicable)
One-way flights booked in conjunction with a verifiable long-term visa or relocation program.

Core Principle
A user's travel footprint reveals their overall reliability.



SECTION 9: EXPOSURE BEHAVIOUR ENGINE (5%)
Introduction
This engine evaluates how responsibly users consume and scale their financing. It prevents users from building trust with small loans, only to suddenly default on massive exposure.

Primary Table: Exposure Signals
Positive Signals
Impact
Negative Signals
Impact
Gradual financing growth
+15
Sudden high-ticket jumps
-35
Controlled repayment exposure
+15
Exposure concentration risk
-30
Responsible ticket sizing
+12
Aggressive financing escalation
-25

Interpretation
Users who slowly increase their ticket sizes over multiple successful trips demonstrate financial maturity. Sudden leaps in requested financing limits signal potential desperation or premeditated default.

Secondary Table(s): Escalation Triggers
Exposure Escalation Rate
AI Action
< 20% increase per cycle
Auto-Approve
20% - 50% increase
Watchlist / Hold
> 50% increase
Manual Review

Operational Rules
Financing limits must grow algorithmically based on the successful clearance of previous tiers.
Users cannot skip tiers regardless of sudden cash injections into their wallets.

Exceptions (where applicable)
Corporate accounts utilise aggregate limits for multiple employees.

Core Principle
Credit scaling must be gradual, earned, and proportional.




SECTION 10: COMMUNICATION RELIABILITY ENGINE (5%)
Introduction
How a user communicates under pressure is highly predictive of their intent to repay. This engine tracks interactions with customer support and automated communication channels.

Primary Table: Communication Signals
Positive Signals
Impact
Negative Signals
Impact
Proactive repayment communication
+15
Ghosting support
-50
Honest issue disclosure
+12
Avoidance behaviour
-35
Fast support response
+8
Aggressive operational behaviour
-25

Interpretation
A user who proactively communicates a delay is fundamentally different from a user who ignores messages ("ghosting"). This engine rewards transparency and penalises evasion.

Secondary Table(s): Communication Actions
Communication Action
Risk Implication
Initiates contact before the due date
High intent to repay
Responds to first reminder
Moderate intent to repay
Ignores all outreach
High default probability

Operational Rules
Natural Language Processing tools will scan support interactions to flag aggressive or evasive language.
Proactive disclosure of financial hardship grants the user access to restructuring options without severe penalty.
Exceptions (where applicable)
Lack of communication during active travel in regions with known connectivity issues.

Core Principle
Transparency mitigates risk; avoidance amplifies it.


SECTION 11: IDENTITY & FRAUD CONFIDENCE ENGINE (5%)
Introduction
Identity establishes the behavioural trust floor. By utilising device metadata and geolocation, the system identifies fraud without relying strictly on formal banking records, extracting behavioural scores with zero PII.

Primary Table: Identity Signals
Positive Signals
Impact
Negative Signals
Impact
Long-term identity consistency
+15
Identity mismatch
-100
Stable device behaviour
+10
Refund-account mismatch attempts
-90
Stable geography patterns
+10
SIM swap patterns
-70
Verified biometric login
+8
VPN abuse / IP anomalies
-40

Interpretation
While this category only accounts for 5% of the standard score, its negative impacts are absolute. A severe failure here (e.g., an identity mismatch) instantly overrides all positive scores and locks the account.

Secondary Table(s): Fraud Vectors
Fraud Vector
Immediate Action
Refund to a different bank account
Halt the refund; flag for AML review
SIM swap detected
Monitor the account closely and determine the frequency of SIM swaps. Freeze financing access

Operational Rules
The system must continuously monitor for device emulators and location spoofing.
Refund requests must only be routed back to the original funding source to prevent money laundering.

Exceptions (where applicable)
Legitimate VPN usage for corporate travellers (requires manual whitelisting).
Core Principle
Without a verifiable identity, there is no foundation for trust. All users must have their BVN done first. 


SECTION 12: LOYALTY & PLATFORM VALUE ENGINE (5%)
Introduction
This engine rewards long-term ecosystem engagement. While loyalty is valuable, the engine is capped at 5% to ensure that platform tenure never overpowers actual repayment risk.

Primary Table: Loyalty Signals
Positive Signals
Impact
Negative Signals
Impact
High lifetime value
+20
Excessive disputes
-30
Repeat usage
+15
Promotion abuse
-20
Referral behaviour
+12
Operational burden patterns
-15
Long platform age
+10
Artificial booking loops
-10

Interpretation
Users who continually utilise the platform responsibly and refer high-quality peers receive minor score uplifts. Conversely, users who abuse promotions or drain operational resources are penalised.
Secondary Table(s): Loyalty Metrics
Loyalty Metric
Definition
Platform Age
Months since first successful booking
Referral Quality
Repayment success rate of referred users

Operational Rules
Referral bonuses or score uplifts are only applied after the referred user completes a successful repayment cycle.
Accounts flagged for high dispute ratios must have their loyalty scores set to null.

Exceptions (where applicable)
N/A

Core Principle
Loyalty matters but must never blind the system to risk.


SECTION 13: TRUST SCORE BANDS
Introduction
The raw 0-1000 Master Trust Score is categorised into specific bands to allow for rapid, automated decision-making and clear internal risk segmentation.

Primary Table: Score Bands
Score Range
Classification
Risk Profile
0 - 299
High Risk
Unacceptable
300 - 499
Restricted
Severe
500 - 699
Stable
Moderate
700 - 849
Trusted
Low
850 - 1000
Elite
Minimal

Interpretation
These bands act as the primary gateways for financing. Users must migrate upward through the bands by consistently behaving to unlock premium platform features.

Secondary Table(s): Band Actions
Classification
Automated Action
High Risk
If the user is new, approve based on the user's trust-tier category. 
If the user isn’t new, meaning the user's points have been depleted, revoke access to credit facilities.
Restricted
If the user is new, approve them based on their trust-tier category. 
If the user isn’t new, meaning the user's points have been depleted, review the user's transaction.
Trusted
Auto-approve standard limits

Operational Rules
Score bands are strictly enforced by the AI for automated checkout flows.
A user dropping into the restricted band triggers an immediate freeze on active financing offers.

Exceptions (where applicable)
None. Score bands are absolute.

Core Principle
Clearly defined thresholds drive automated, unbiased decision-making.


SECTION 14: TRUST TIER INTELLIGENCE
Introduction
Trust tiers are behavioural classes, not fixed lending brackets. Two users in the same tier may receive entirely different financing outcomes based on granular operational variables.

Primary Table: Tier Variables
Evaluation Variable
Purpose
Repayment Quality
Assesses the timeliness of past payments
Route Complexity
Evaluates the risk of the specific itinerary
Operational Friction
Measures customer service burden
Wallet Behaviour
Tracks current liquidity

Interpretation
Being in a "Trusted" tier grants eligibility, not entitlement. The AI evaluates the specific context of the current transaction against these variables before finalising a decision.

Secondary Table(s): Tier Context
User A (Trusted Tier)
User B (Trusted Tier)
Outcome
Booking a Domestic Route
Booking High-Risk One-Way
User A Approved, User B Restricted

Operational Rules
Trust Tiers dictate the maximum possible financing limit; the transactional variables dictate the actual approved limit.
Tiers must be recalculated before each new checkout session.

Exceptions (where applicable)
N/A

Core Principle
Eligibility does not guarantee identical financing outcomes.



SECTION 15: BEHAVIOURAL MOMENTUM ENGINE
Introduction
Credit scoring in emerging markets must be forward-looking. This engine continuously evaluates the trajectory of a user's behaviour to answer the question: "Is this user becoming safer or riskier over time?"

Primary Table: Momentum States
Momentum State
Meaning
AI Action
Improving
Risk decreasing
Favourable limit adjustments
Stable
Neutral
Maintain current exposure
Watchlist
Mild deterioration
Pause limit increases
Deteriorating
Rising risk
Increase deposit requirements
Critical
Severe intervention risk
Halt all new financing

Interpretation
A user with a moderate score who is rapidly improving presents a better lending opportunity than a user with a high score whose financial rhythm is deteriorating. Momentum dictates future risk.

Secondary Table(s): Momentum vs Score
Scenario
Score
Momentum
Risk Assessment
User 1
720
Improving
Safer
User 2
810
Deteriorating
Riskier

Operational Rules
Momentum is calculated by comparing the trailing 30-day behavioural moving average against the 90-day baseline.
A "Critical" momentum state overrides the Master Trust Score.

Exceptions (where applicable)
N/A

Core Principle
Direction is more predictive than the current location.



SECTION 16: COMPOUND NEGATIVE EVENT LOGIC
Introduction
Financial collapse rarely happens due to a single isolated event. This logic ensures that multiple negative signals occurring simultaneously amplify the total risk penalty, accurately reflecting cascading failure.

Primary Table: Compound Multipliers
Event Combination
Base Penalty
Compound Multiplier
Final Impact
Missed Repayment + Ghosting Support
(-120) + (-80) = -200
1.4x
-280
Late Payment + Wallet Depletion
(-30) + (-20) = -50
1.3x
-65
Cancellation + Route Manipulation
(-40) + (-50) = -90
1.5x
-135

Interpretation
By using a compound multiplier, the AI aggressively penalises users who exhibit concurrent signs of distress, allowing the system to restrict exposure before a full default occurs.

Secondary Table(s): Multiplier Escalation
Number of Concurrent Negative Events
Multiplier Escalation
2 Events
1.3x - 1.5x
3+ Events
1.6x - 2.0x

Operational Rules
Compound logic is triggered when two or more negative events occur within a 14-day window.
Multipliers scale aggressively based on the severity of the combined infractions.

Exceptions (where applicable)
Concurrent events directly caused by a verified platform technical failure.

Core Principle
Cascading bad behaviour requires an amplified system response.



SECTION 17: RECENCY & TIME DECAY LOGIC
Introduction
Recent behaviour is vastly more indicative of current financial health than old behaviour. This logic ensures that older negative actions gradually decay, preventing permanent punishment for past mistakes and encouraging rehabilitation.

Primary Table: Decay Impact
Age of Negative Event
Impact Weight Formula
Effective Weight
Current (0 Months)
1 / (1 + (0 * 0.08))
100%
6 Months Old
1 / (1 + (6 * 0.08))
~67%
12 Months Old
1 / (1 + (12 * 0.08))
~51%
24 Months Old
1 / (1 + (24 * 0.08))
~34%

Interpretation
As an infraction ages, its mathematical impact on the Master Trust Score diminishes. This allows users who have recovered from financial stress to rebuild their standing on the platform.

Secondary Table(s): Decay Rates by Severity
Event Severity
Decay Rate
Minor (Late by 1-3 days)
Fast Decay (0.15 multiplier)
Severe (Default)
Slow Decay (0.04 multiplier)

Operational Rules
Fraud-related events (identity mismatch, refund abuse) do NOT decay and permanently impact the profile.
Decay only applies if the user maintains active, positive behaviour during the decay period.

Exceptions (where applicable)
Fraud and anti-money laundering (AML) violations are exempt from time decay.

Core Principle
Users must be allowed to rehabilitate through sustained good behaviour.



SECTION 18: ROUTE RISK INTELLIGENCE
Introduction
In travel financing, the asset being financed (the ticket) carries its own intrinsic risk. The AI evaluates the volatility and operational risk associated with specific travel corridors.

Primary Table: Route Risk Profiles
Route Profile
Risk Classification
Example Corridors
Predictable Domestic Return
Low Risk
Nairobi to Mombasa (Return)
Repeat Business Corridors
Low Risk
Lagos to Abuja (Return)
High-Ticket First-Time
High Risk
Accra to London (First Time)
Migration-Linked One-Way
Severe Risk
Lagos to UK/Canada (One-Way)

Interpretation
Certain routes have historically high rates of cancellation, no-shows, or user default. The system dynamically adjusts deposit requirements and approval rates based on these corridor profiles.

Secondary Table(s): Formula Matrix
Calculation Matrix
Formula
Final Travel Risk
User Trust Score × Route Risk Multiplier

Operational Rules
High-risk routes automatically trigger higher initial deposit requirements.
One-way international flights require users to be in the "Trusted" or "Elite" tiers for financing approval.

Exceptions (where applicable)
One-way flights booked for verified corporate relocation accounts.

Core Principle
Not all travel routes are equally financeable.



SECTION 19: POST-TRAVEL SETTLEMENT RISK ENGINE
Introduction
Allowing a user to travel before their financing is fully paid off creates unsecured behavioural exposure. This engine places ultra-tight controls on post-travel settlement privileges.

Primary Table: Post-Travel Failure Penalties
Behaviour
Impact
AI Consequence
Late post-travel settlement
-60
The deposit increased for the next trip
Missed post-travel settlement
-150
Post-travel privileges revoked
Settlement avoidance
-200
Account sent to collections
Repeated settlement abuse
Severe restriction
Permanent platform ban

Interpretation
Once the service (the flight) is consumed, the user's incentive to repay drops drastically. Therefore, failures in post-travel settlement are penalised far more heavily than pre-travel instalment delays.

Secondary Table(s): Prerequisite Gates
Prerequisite for Post-Travel Approval
Requirement
Minimum Trust Tier
Navigator or Ambassador
Behavioural Momentum
Stable or Improving

Operational Rules
Post-travel exposure must never exceed 40% of the user's total approved financing limit.
Users must have successfully completed at least two pre-funded trips before unlocking post-travel settlement.

Exceptions (where applicable)
Enterprise B2B accounts utilise aggregated corporate billing.

Core Principle
Post-travel financing is a high-risk privilege reserved exclusively for elite behaviour.



SECTION 20: FRAUD & MANIPULATION DETECTION
Introduction
Alternative credit systems are prime targets for algorithmic gaming. This engine continuously scans for synthetic activity, systemic manipulation, and coordinated fraud rings.

Primary Table: Strategic Fraud Flags
Strategic Fraud Flags
System Interpretation
Action
Rapid low-value booking loops
Trust-tier gaming attempt
Freeze score progression
Excessive itinerary requests
Data extraction / Fare scraping
Rate-limit account
Suspicious repayment timing
Artificial repayment behaviour
Flag for manual review
Multiple-account behaviour
Synthetic network creation
Block associated devices

Interpretation
Fraudsters will attempt to rapidly complete cheap transactions to artificially inflate their Trust Score before executing a massive default. This engine identifies the patterns that precede this abuse.

Secondary Table(s): Manipulation Tactics
Manipulation Tactic
Detection Method
Refund Abuse
Tracking cancellation frequency vs. booking value
Account Takeover
Geolocation and device IP anomaly detection

Operational Rules
Any detection of trust-tier gaming immediately halts the user's progression up the Trust Bands.
High-velocity booking-and-cancelling behaviour triggers an automatic account suspension.

Exceptions (where applicable)
Travel agents legitimately checking multiple itineraries (must be formally registered as B2B accounts).

Core Principle
The integrity of the Trust Score relies on defeating artificial manipulation.



SECTION 21: DYNAMIC FINANCING ENGINE
Introduction
Static credit limits expose lenders to massive risk during economic downturns. The Dynamic Financing Engine ensures that exposure adapts continuously to the user's real-time risk profile and macroeconomic factors.


Primary Table: Limit Weighting Model
Factor
Weight in Limit Calculation
Trust Score
35%
Repayment Capacity (Cash Flows)
25%
Behavioural Stability
15%
Route Risk
10%
Exposure Concentration
10%
Loyalty Value
5%

Interpretation
This weighting model dictates the exact monetary value a user is allowed to finance. It balances their proven trustworthiness against their actual capacity to repay and the risk of the specific asset being financed.

Secondary Table(s): Adjustment Triggers
Limit Adjustment Trigger
Action
Sudden drop in wallet inflows
Decrease limit by 30%
Upgrade to Ambassador Tier
Increase limit by 25%

Operational Rules
Limits are soft-capped based on the user's Trust Tier.
The engine must run this calculation in the background prior to presenting checkout options.

Exceptions (where applicable)
Manual overrides for high-net-worth individuals requiring bespoke limits.

Core Principle
Financing exposure must be as fluid as the user's behaviour.


SECTION 22: AI RISK MANAGER OUTPUT
Introduction
The AI processes millions of data points, but its output must be concise, readable, and actionable for internal risk teams. This section defines the standard internal dossier generated for every user.

Primary Table: Executive Dashboard Metrics
Metric
Example Output
Purpose
Trust Score
742
Base behavioural rating
Tier
Navigator
Determines baseline deposit
Behaviour Trend
Improving
Contextualises future risk
Route Risk
Medium
Asset volatility indicator
Suggested Deposit
35%
Dynamic capital protection

Interpretation
This dashboard provides a complete, at-a-glance summary of a user's risk profile. It translates complex machine learning outputs into clear operational directives.

Secondary Table(s): Advanced Metrics
Advanced Metrics
Example Output
Repayment Reliability
91%
Communication Reliability
88%
Approval Confidence
High

Operational Rules
These outputs are STRICTLY INTERNAL and must never be exposed to the end-user to prevent algorithm gaming.
The "Approval Confidence" metric dictates if a human review is necessary.

Exceptions (where applicable)
Regulators or auditors may view anonymised versions of these outputs during compliance checks.

Core Principle
Complex AI must yield simple, actionable decisions.



SECTION 23: DATA PRIVACY & CONSENT FRAMEWORK
Introduction
Utilising alternative data requires a robust data privacy infrastructure. With frameworks such as Kenya's Data Protection Act 2019 and Egypt's FinTech Law No. 5 of 2022 now in effect, strict adherence to regional data protection laws is mandatory to prevent regulatory breaches.

Primary Table: Consent Architecture
Data Type
Sourcing Method
Consent Requirement
E-commerce / Wallet Data
API Integration
Explicit Opt-In
Device Metadata
SDK / App Permissions
Explicit Opt-In
Booking History
Internal Platform Data
Implicit (Terms of Service)

Interpretation
To safely utilise alternative data, Tripkopa must ensure that all external data points are lawfully sourced and that secondary use does not exceed the disclosed purpose, mitigating algorithmic explainability risks.

Secondary Table(s): Regulatory Risks
Regulatory Risk
Mitigation Strategy
Algorithmic Bias
Routine demographic stress-testing
Data Misuse
Total anonymisation of PII

Operational Rules
Users must explicitly consent to the collection of alternative data points.
Users must be given the option to revoke data access, which will trigger a recalculation of their financing limits.

Exceptions (where applicable)
Internal platform booking data does not require secondary opt-in as it is native to the service.

Core Principle
Privacy and consent are the prerequisites to behavioural trust.


SECTION 24: REPAYMENT FAILURE CASCADE ENGINE
Introduction
The Repayment Failure Cascade Engine determines how the AI Risk Manager responds when repayment behaviour deteriorates. The objective is to identify behavioural decline early and intervene before financial loss occurs.

Primary Table: Repayment Failure Cascade Matrix
Stage
Classification
Characteristics
Trust Impact
AI Action
0
Healthy
Stable repayments and communication
None
Normal monitoring
1
Early Stress
Increased reminder dependency
-10 to -30
Soft intervention
2
Watchlist
Repayment hesitation and delays
-30 to -80
Exposure review
3
Active Delinquency
Repayment breach occurs
-80 to -150
Financing restrictions
4
Severe Risk
Repeated delinquency and instability
-150 to -250
Manual review
5
Defaulted
Confirmed exposure loss
-300+
Recovery process activation

Interpretation
The Cascade Engine measures the severity of behavioural deterioration. Users move between stages dynamically as behaviour improves or deteriorates. The purpose is not punishment. The purpose is early intervention.

Secondary Table(s): Recovery Signal Matrix
Behaviour
Impact
Successful repayment recovery
+30
Three consecutive on-time repayments
+40
Completed booking after delinquency
+50
Behavioural stability recovery
+30
Six months without negative events
+50

Operational Rules
Movement between cascade stages should consider both the severity and frequency of negative events.
Multiple negative events occurring within a short period should trigger accelerated escalation.
The AI should prioritise intervention before users reach Active Delinquency.

Exceptions (where applicable)
Airline cancellations, provider disruptions, and operational events outside the user's control must not trigger Cascade escalation.


Core Principle
The purpose of the Cascade Engine is to prevent financial loss through early behavioural intervention rather than reactive punishment after default occurs.



SECTION 25: EMBEDDED ECOSYSTEM & CHECKOUT ARCHITECTURE
Introduction
For financing to scale, BNPL must be deeply embedded into the checkout flows of airlines and OTAs. As seen with embedded insurtech in Africa, merely building an API endpoint is insufficient; the backend reconciliation logic must scale.

Primary Table: Integration Types
Integration Type
Merchant Benefit
Risk Management Tool
API Checkout Widget
Higher Conversion
Real-time AI eligibility ping
Post-Booking Financing
Saved Carts Recovery
Retargeted specific limit offers
Partner White-label
Brand Loyalty
Shared liability agreements

Interpretation
Embedding financing removes friction and captures high-intent travellers. However, it requires the AI Risk Manager to deliver decisions in milliseconds via API to prevent cart abandonment.

Secondary Table(s): Embedded Metrics
Metric Monitored
Target Threshold
API Response Time
< 1.5 Seconds
Checkout Abandonment
< 15% post-financing offer

Operational Rules
The AI must pre-calculate limits for logged-in users to ensure zero-latency checkout experiences.
High-risk merchants or highly volatile travel corridors are excluded from instant embedded financing.
Exceptions (where applicable)
Third-party merchants with high historical chargeback rates will face stricter API underwriting thresholds.

Core Principle
Financing must remain invisible, instantaneous, and frictionless within the travel journey.



SECTION 26: CANCELLATION RELIABILITY ENGINE
Introduction
The Cancellation Reliability Engine measures a user's commitment to travel plans. Repayment reliability and travel commitment are separate behavioural dimensions; a user may repay perfectly but create operational chaos through excessive cancellations.


Primary Table: Cancellation Reliability Classification
Score
Classification
Risk Interpretation
AI Action
80-100
High
Strong travel commitment
Eligible for improved flexibility
60-79
Moderate
Acceptable cancellation behaviour
Normal monitoring
40-59
Watchlist
Elevated cancellation risk
Increased monitoring
20-39
Low
Poor commitment reliability
Financing restrictions considered
0-19
Critical
Severe operational risk
Manual review and restrictions

Interpretation
Cancellation behaviour directly impacts operational costs, liquidity forecasting, and airline settlement complexity. Users with low cancellation reliability may be financially sound but create unacceptable operational uncertainty.
Secondary Table(s): Cancellation Impact Matrix
Behaviour
Impact
Low cancellation frequency over 12 months
+20
Completed trip without cancellation
+15
Early cancellation notice (>21 days)
+10
Cancellation within 7 days of departure
-35
Cancellation within 72 hours of departure
-60

Operational Rules
The AI must evaluate both the frequency and severity of cancellations.
Repeated late-stage cancellations generate stronger penalties due to higher operational costs.
A single responsible cancellation should not significantly damage a user's reliability profile.

Exceptions (where applicable)
Airline-initiated cancellations and operational disruptions outside the user's control are strictly excluded from scoring calculations.

Core Principle
The goal is to measure commitment reliability, not to punish users for legitimate changes in travel plans.



SECTION 27: DEPOSIT FLEXIBILITY FRAMEWORK
Introduction
Tripkopa replaces rigid, one-size-fits-all underwriting with a dynamic model. The Deposit Flexibility Framework allows users to meet lower upfront deposit requirements by demonstrating behavioural reliability.

Primary Table: Deposit Tier Matrix
Tier
Domestic
Regional
International
Explorer
35%
45%
55%
Voyager
30%
40%
50%
Navigator
25%
35%
45%
Ambassador
20%
30%
40%

Interpretation
The matrix represents baseline expectations. Deposit flexibility is a privilege earned through trust, incentivising users to maintain perfect repayment records to unlock cheaper upfront travel costs.

Secondary Table(s): Deposit Decision Weighting & Adjustments
Factor
Weight
Risk Event
Adjustment
Trust Score
35%
Watchlist Status
+5%
Repayment Reliability
25%
Active Delinquency
+10%
Behavioural Stability
15%
Recent Default
+20%

Operational Rules
Deposit reductions should be earned gradually through sustained behavioural reliability.
Deposit increases should occur immediately upon detection of significant behavioural deterioration.
The AI must prioritise capital protection over financing convenience.

Exceptions (where applicable)
Human review may override deposit recommendations in highly exceptional, verified circumstances.

Core Principle
Deposit flexibility is a privilege earned through trust, not an entitlement granted through account age.


SECTION 28: HUMAN REVIEW & OVERRIDE FRAMEWORK
Introduction
While the AI processes the vast majority of decisions, the Human Review & Override Framework ensures governance, fairness, and accountability by allowing human intervention in exceptional or highly complex scenarios.

Primary Table: Manual Review Trigger Matrix
Trigger
Review Required
Decision Confidence below 60%
Yes
Fraud Investigation
Yes
High Exposure Booking
Yes
Severe Risk Classification
Yes
System Anomalies
Yes
Regulatory or Compliance Concern
Yes

Interpretation
Most decisions should remain fully automated. Manual reviews are reserved for situations where risk signals are conflicting, unusual, or require human judgment.

Secondary Table(s): Override Audit Matrix
Required Field
Description
Reviewer & Timestamp
Individual performing override, date, and time
Original Recommendation
AI decision
Final Decision & Reason
Human decision and justification
Supporting Evidence
Additional context if applicable

Operational Rules
All overrides must be documented and auditable.
Human reviewers must not override fraud restrictions without documented evidence.
Override activity should be monitored regularly to identify patterns of poor AI recommendations.

Exceptions (where applicable)
Emergency operational situations may require temporary override procedures approved by management.

Core Principle
The AI recommends that humans remain accountable for exceptional decisions.



SECTION 29: AI RISK MANAGER EXECUTIVE OUTPUT FRAMEWORK
Introduction
The AI Risk Manager converts hundreds of behavioural, operational, financial, and fraud signals into a concise set of actionable decision outputs. These outputs are used internally for underwriting and risk monitoring.

Primary Table: Executive Output Dashboard
Metric
Example
Master Trust Score
742
Trust Tier
Navigator
Behavioural Stability Index
81
Repayment Reliability
91%
Momentum State
Improving
Risk State
Healthy
Fraud Confidence
97%
Cancellation Reliability
High
Suggested Deposit
35%
Recommended Financing Limit
₦1,500,000
Maximum Exposure
₦900,000
Decision Confidence
94%
Final Decision
Approve

Interpretation
The Executive Output Dashboard represents the final decision layer. Individual scores should not be evaluated in isolation; the AI must consider the combined relationship between trust, stability, momentum, and exposure risk.

Secondary Table(s): Decision Matrix
Decision
Meaning
Approve
Financing approved under standard terms
Approve with Conditions
Additional controls required
Manual Review
Human assessment required
Restrict / Reject
Financing privileges limited or denied

Operational Rules
The Executive Output Dashboard must be generated for every financing decision.
Outputs should remain internal and must never be exposed directly to users.
The AI should provide explanatory drivers for both positive and negative decisions.


Exceptions (where applicable)
Regulatory disclosures and compliance reviews may require limited access to selected outputs.

Core Principle
The objective is not merely to score users but to generate explainable, actionable, and auditable financing decisions.

SECTION 30: RISK GOVERNANCE & AUDIT FRAMEWORK
Introduction
To ensure regulatory readiness, the Risk Governance & Audit Framework ensures that all material risk decisions remain explainable, traceable, reviewable, and compliant with future regulatory expectations.

Primary Table: Auditable Events Matrix
Event
Audit Required
Trust Score Changes
Yes
Tier Upgrades / Downgrades
Yes
Deposit Adjustments
Yes
Financing Limit Changes
Yes
Manual Overrides
Yes
Fraud Investigations
Yes
Default Events
Yes

Interpretation
Every material financing decision should leave an auditable trail. The objective is to ensure that future reviewers can understand what decision was made, why it was made, and what behavioural signals influenced it.

Secondary Table(s): Governance Requirements Matrix
Requirement
Description
Explainability
Decisions must be explainable via observable behaviour
Traceability
Decision history must be retained
Consistency
Similar cases should receive similar treatment
Accountability
The responsible party must be identifiable

Operational Rules
All material decision changes must be logged automatically.
Risk models should be reviewed periodically to ensure scoring remains aligned with observed repayment outcomes.
Override frequency, default trends, and trust-score performance should be monitored continuously.

Exceptions (where applicable)
Emergency operational responses may temporarily bypass standard governance procedures, provided full audit records are created afterwards.

Core Principle
Every material financing decision must be explainable using observable behavioural evidence. The AI Risk Manager must never generate decisions that cannot be traced back to measurable behavioural signals.

SECTION 31: STRATEGIC CONCLUSION
Introduction
Tripkopa's ultimate value proposition extends far beyond the immediate facilitation of travel bookings. This framework establishes the foundational intelligence required to scale into a holistic ecosystem.

Primary Table: Ecosystem Expansion
Current State
Future State Application
Ticket Financing
Hotel & Accommodation Financing
Travel BNPL
Premium Ecosystem Access
Instalment Payments
Mobility & Visa Financing

Interpretation
Once the behavioural mobility trust infrastructure is fully trained and deployed, the underlying AI becomes Tripkopa's most valuable asset, capable of underwriting risk across the entire African mobility spectrum.

Secondary Table(s): Strategic Moat
Ecosystem Value
Strategic Moat
Proprietary Data
Superior to public credit bureaus
Repayment Predictability
Lowers the overall cost of capital

Operational Rules
The AI engine must be built with modular APIs to allow future integration with hospitality and mobility partners.
Data harvesting must prioritise long-term predictive value over short-term transaction revenue.

Exceptions (where applicable)
N/A

Core Principle
Tripkopa is building behavioural mobility trust infrastructure, not just a booking engine.



### 5.3 Account lifecycle

Customer account states:

- `ACTIVE`
- `RESTRICTED`
- `SUSPENDED`
- `CLOSED`

A WhatsApp number change or account recovery is not automated in the first release. It requires an operations workflow and renewed identity verification.

### 5.4 Authentication limitation

WhatsApp-number authentication does not protect against an unlocked stolen device, shared phone, compromised linked device, recycled number or account takeover. The implementation must preserve the ability to introduce a transaction PIN, passkey or additional verification later without changing customer IDs or booking ownership.

## 6. KYC web flow

### 6.1 KYC-link creation

SupaOS requests a KYC session through `POST /v1/kyc/sessions` using the signed customer assertion.

The backend returns:

```json
{
  "session_id": "kycs_123",
  "status": "PENDING",
  "url": "https://verify.tripkopa.com/s/opaque-single-use-token",
  "expires_at": "2026-08-06T12:10:00Z"
}
```

The link must:

- be single-use;
- expire after 5–10 minutes;
- be bound to the customer, purpose and KYC session;
- contain only an opaque random token;
- be invalidated after successful exchange;
- never contain a WhatsApp number, BVN, NIN or KYC result.

### 6.2 KYC completion

1. Customer opens the Tripkopa KYC UI.
2. UI exchanges the one-time token for an HTTP-only, secure, same-site session cookie.
3. UI presents the privacy notice and requests explicit consent.
4. UI starts the configured KYC provider experience.
5. Sensitive identity input is sent directly to the KYC provider where supported.
6. The provider sends a signed webhook to Tripkopa.
7. Tripkopa records the provider reference and normalized result.
8. Tripkopa emits `kyc.status_changed` to SupaOS.
9. SupaOS informs the customer through WhatsApp.

### 6.3 Stored KYC data

Store only what the booking/payment product requires:

- provider verification reference;
- verification type;
- status and reason code;
- verified legal name and date of birth when required;
- masked BVN/NIN or provider token, not the raw value where avoidable;
- consent version and timestamp;
- verification and expiry timestamps;
- assurance level;
- manual-review metadata.

Raw documents, selfies and biometric artifacts should remain with the KYC provider unless a documented requirement makes Tripkopa storage necessary.

KYC states:

- `NOT_STARTED`
- `PENDING`
- `VERIFIED`
- `FAILED`
- `MANUAL_REVIEW`
- `EXPIRED`

## 7. Flight domain

### 7.1 Supported search inputs

- payment preference: full or flexible;
- origin and destination airport/city;
- departure date;
- return date when applicable;
- preferred time range;
- one-way or return;
- cabin class;
- refundable/flexible or nonrefundable preference;
- adult, child and infant counts.

### 7.2 Route classification

The backend classifies each route as:

- `DOMESTIC`
- `REGIONAL_AFRICA`
- `INTERNATIONAL`

Classification is derived from airport-country data. The caller cannot choose the classification.

### 7.3 Search behavior

- Search one or more eligible providers.
- Normalize provider results into a common offer model.
- Deduplicate materially identical itineraries.
- Apply Tripkopa service/financing pricing server-side.
- Sort by total customer price by default.
- Persist a temporary quote snapshot for every offer returned to SupaOS.
- Return an opaque `quote_id`; do not expose provider credentials or mutable pricing fields.
- Record the provider fare rules and quote expiry.

### 7.4 Quote revalidation

Before accepting terms or initiating payment, the backend must revalidate:

- availability;
- provider price;
- fare class;
- baggage allowance;
- refund/change rules;
- departure schedule;
- passenger count.

If the price changes, the quote becomes `REPRICE_REQUIRED` and the customer must accept a new version. SupaOS cannot override this state.

### 7.5 Passenger rules

- Passenger names must match the required travel document.
- Passenger data is stored separately from the authenticated booking owner.
- International passenger records may require passport information.
- Every booking stores the owner `customer_id` and one or more passengers.
- Passenger changes after provider confirmation follow provider rules and may require operations review.

## 8. Provider abstraction and factories

### 8.1 General requirements

Each provider integration consists of:

1. a provider-neutral interface;
2. a provider adapter;
3. a factory/registry;
4. capability metadata;
5. health and error mapping;
6. sandbox contract tests.

Business services depend on interfaces, not concrete provider classes.

### 8.2 Flight provider interface

```text
FlightProvider
  search(criteria) -> ProviderOffer[]
  revalidate(providerOfferRef) -> RevalidatedOffer
  createReservation(offer, passengers) -> Reservation
  issueTicket(reservation, paymentReference) -> Ticket
  getBooking(providerBookingRef) -> ProviderBooking
  getFareRules(providerOfferRef) -> FareRules
  requestCancellation(providerBookingRef) -> CancellationResult
  getRecoverableValue(providerBookingRef) -> RecoverableValue
```

Capabilities may include:

- domestic routes;
- regional routes;
- international routes;
- reservations/holds;
- immediate ticketing;
- refunds;
- open tickets/travel credits;
- ancillary baggage.

### 8.3 Flight provider factory

`FlightProviderFactory` chooses eligible adapters using configuration such as:

- route support;
- required capability;
- provider availability;
- currency;
- configured priority;
- circuit-breaker state.

Selection must be observable and deterministic for identical configuration. Initial provider routing may use configured priority; later optimization can be added without changing the domain interface.

### 8.4 Payment provider interface

```text
PaymentProvider
  createCustomer(profile) -> ProviderCustomer
  createVirtualAccount(customer) -> VirtualAccount
  createPaymentIntent(order) -> PaymentIntent
  getTransaction(providerReference) -> ProviderTransaction
  initiateRefund(transaction, amount) -> Refund
  getRefund(providerRefundReference) -> RefundStatus
  verifyWebhook(headers, rawBody) -> VerifiedProviderEvent
```

### 8.5 KYC provider interface

```text
KycProvider
  createSession(customer, callbackUrl) -> ProviderKycSession
  getVerification(providerReference) -> VerificationResult
  verifyWebhook(headers, rawBody) -> VerifiedProviderEvent
```

### 8.6 Provider error model

Adapters translate provider failures into stable internal codes:

- `PROVIDER_UNAVAILABLE`
- `RATE_LIMITED`
- `OFFER_EXPIRED`
- `PRICE_CHANGED`
- `NO_AVAILABILITY`
- `BOOKING_REJECTED`
- `PAYMENT_PENDING`
- `PAYMENT_FAILED`
- `KYC_FAILED`
- `MANUAL_REVIEW_REQUIRED`

Raw provider errors are retained in restricted diagnostic storage but are not returned to SupaOS or customers.

## 9. Pricing and flexible-payment rules

All percentages, limits and booking windows are configurable, effective-dated and versioned.

### 9.1 Standard payment

- Customer pays the complete amount before ticket issuance.
- Default Tripkopa service fee: 5%.
- The exact customer total and applicable disclosures are saved with the quote version.

### 9.2 Flexible-payment markup defaults

| Route | Booking/payment window | Default markup |
|---|---:|---:|
| Domestic | 1–5 weeks | 7.5% |
| Domestic | 6–9 weeks | 10% |
| Domestic | 10–12 weeks | 12.5% |
| Regional/international | 1–5 weeks | 7.5% |
| Regional/international | 6–9 weeks | 10% |
| Regional/international | 10–13 weeks | 12.5% |
| Regional/international | 14–17 weeks | 17.5% |
| Regional/international | 18–21 weeks | 22.5% |
| Regional/international | 22–24 weeks | 27.5% |

The backend stores both the calculation components and the customer-facing total. What must be disclosed to the customer is a legal/product configuration decision, not an agent decision.

### 9.3 Maximum financing windows

- Domestic: 12 weeks.
- Regional: 16 weeks.
- International: 24 weeks.

### 9.4 Installment limits

- Domestic: 1–4 installments after deposit.
- Regional: 1–6 installments after deposit.
- International: 1–8 installments after deposit.

### 9.5 Repayment-plan validation

The backend validates that:

- KYC is verified;
- the customer is eligible for flexible payment;
- the minimum deposit is satisfied;
- every installment has an amount and due date;
- installment amounts plus deposit equal the total payable amount exactly;
- all due dates are ordered and fall within the permitted window;
- scheduled repayments finish at least 10 days before departure, unless an approved product rule explicitly permits post-travel settlement;
- the number of installments does not exceed the route limit;
- the accepted plan is saved with its rule and terms versions.

### 9.6 Grace period

- Maximum final-payment grace period: 3 days.
- Grace must never extend later than 7 days before departure.
- Grace activation and cancellation consequences are deterministic backend rules.


All of these should be configurable via an admin dashboard

### 9.7 Eligibility input

The backend does not perform AI underwriting. For the first release, flexible-payment eligibility is one of:

- determined by a simple configured rule set; or
- supplied by an authorized external risk/operations service and stored as a versioned decision.

SupaOS cannot supply or override approval status, financing cap, deposit percentage or post-travel eligibility.

## 10. Booking flows

### 10.1 Standard full-payment flow

1. SupaOS searches flights.
2. Customer chooses a `quote_id`.
3. Backend revalidates the quote.
4. SupaOS submits passengers and contact information.
5. Backend creates a booking draft.
6. Backend returns the exact price, fare conditions and terms version.
7. Customer acceptance is recorded.
8. Backend creates a payment intent or returns the assigned virtual account.
9. Payment webhook confirms funds.
10. Backend revalidates inventory and issues the booking/ticket.
11. Backend emits `booking.confirmed` and makes the full itinerary available.

If ticket issuance fails after payment, the booking moves to `MANUAL_REVIEW` or an automatic reversal/refund path according to payment method and provider capability.

### 10.2 Flexible-payment flow

1. SupaOS requests KYC status.
2. If incomplete, SupaOS requests and sends the secure KYC link.
3. After `VERIFIED`, SupaOS searches flexible-payment offers.
4. Backend revalidates the selected quote.
5. Backend checks deterministic or externally approved eligibility.
6. Backend generates allowed deposit and installment options.
7. Customer selects or proposes a plan.
8. Backend validates and versions the plan.
9. Customer accepts the exact terms.
10. Backend creates the deposit payment instruction.
11. Payment webhook confirms the deposit.
12. Backend reserves/issues the flight according to provider and product configuration.
13. Backend releases only the permitted itinerary representation.
14. Installment payments update the ledger and repayment plan.
15. Backend emits reminders/events before due dates; SupaOS decides how to phrase and send them.
16. When release conditions are met, the full itinerary becomes available.

## 11. Booking and payment state machines

### 11.1 Quote states

```text
ACTIVE -> REVALIDATING -> ACTIVE
ACTIVE -> REVALIDATING -> REPRICE_REQUIRED
ACTIVE -> EXPIRED
ACTIVE -> CONSUMED
```

### 11.2 Booking states

```text
DRAFT
  -> AWAITING_KYC
  -> AWAITING_TERMS
  -> AWAITING_PAYMENT
  -> PAYMENT_RECEIVED
  -> BOOKING_IN_PROGRESS
  -> CONFIRMED
  -> TICKETED

Any eligible state
  -> CANCELLATION_PENDING
  -> CANCELLED
  -> REFUND_PENDING
  -> REFUNDED | PARTIALLY_REFUNDED | TRAVEL_CREDIT_ISSUED

Failure paths
  -> FAILED | MANUAL_REVIEW
```

Transitions must be validated server-side. A caller cannot set a state directly.

### 11.3 Payment states

```text
CREATED -> PENDING -> SUCCEEDED
CREATED -> PENDING -> FAILED
SUCCEEDED -> PARTIALLY_REFUNDED -> REFUNDED
SUCCEEDED -> REVERSED
```

### 11.4 Repayment states

```text
PENDING_DEPOSIT -> ACTIVE -> COMPLETED
ACTIVE -> PAYMENT_DUE -> OVERDUE -> GRACE_ACTIVE
GRACE_ACTIVE -> ACTIVE | COMPLETED | DEFAULTED
ACTIVE -> CANCELLED
```

## 12. Payments, wallet and ledger

### 12.1 Payment methods

The backend supports provider-hosted methods such as:

- dedicated virtual account;
- bank transfer;
- hosted card checkout;
- other provider-supported methods added through the payment adapter.

Tripkopa never receives or stores raw card details.

### 12.2 Ledger requirements

- Use an immutable double-entry ledger.
- Represent money in integer minor units with an ISO currency code.
- Every entry references a business event and idempotency key.
- Posted entries are never edited or deleted; corrections use compensating entries.
- Wallet balances are derived from posted entries.
- Booking, payment-provider and ledger records are linked but remain separate domains.

Suggested account categories:

- customer available funds;
- customer committed funds;
- provider payable;
- Tripkopa revenue;
- refund payable;
- payment clearing;
- reconciliation suspense.

### 12.3 Webhook processing

- Read and preserve the raw request body for signature verification.
- Verify signatures before parsing trusted fields.
- Store the provider event ID and reject duplicates.
- Acknowledge valid events quickly and process them asynchronously.
- Do not mark payment successful from a browser redirect or SupaOS request.
- Reconcile ambiguous events using the provider transaction lookup API.

### 12.4 Refunds

- Refund calculation begins only after recoverable value is confirmed by the flight provider.
- Refunds are linked to the original booking and payment transaction.
- Refund destination follows configured compliance rules, normally the original funding source or verified wallet.
- Third-party refund destinations are not accepted automatically.
- Unusual refund cases move to `MANUAL_REVIEW`.

## 13. Itineraries

### 13.1 Partial itinerary

May include:

- passenger name;
- airline;
- origin and destination;
- dates and times;
- class and ticket type;
- traveler count;
- total, deposit, paid amount and outstanding balance;
- repayment status.

It excludes restricted provider identifiers such as PNR, ticket number and provider booking ID when the applicable release rule requires withholding them.

### 13.2 Full itinerary

Includes provider-confirmed booking references, ticket identifiers, terminal, baggage, stops, duration, support information and travel instructions.

The backend returns an itinerary view based on booking state and release policy. SupaOS cannot request a more privileged view than the customer is entitled to receive.

## 14. API requirements

All mutation endpoints require:

- service authentication or KYC UI authentication;
- customer context where applicable;
- `Idempotency-Key`;
- a correlation ID;
- strict request-schema validation.

### 14.1 Customer and KYC

```text
GET    /v1/me
GET    /v1/me/kyc
POST   /v1/kyc/sessions
GET    /v1/kyc/sessions/{session_id}
POST   /v1/webhooks/kyc/{provider}
```

### 14.2 Flight search and quotes

```text
POST   /v1/flights/searches
GET    /v1/flights/searches/{search_id}
GET    /v1/quotes/{quote_id}
POST   /v1/quotes/{quote_id}/revalidate
```

### 14.3 Bookings

```text
POST   /v1/bookings
GET    /v1/bookings
GET    /v1/bookings/{booking_id}
POST   /v1/bookings/{booking_id}/passengers
POST   /v1/bookings/{booking_id}/accept-terms
POST   /v1/bookings/{booking_id}/confirm
POST   /v1/bookings/{booking_id}/cancel-requests
GET    /v1/bookings/{booking_id}/itinerary
```

### 14.4 Flexible payment

```text
GET    /v1/financing/eligibility
POST   /v1/bookings/{booking_id}/repayment-plan-options
POST   /v1/bookings/{booking_id}/repayment-plans
GET    /v1/bookings/{booking_id}/repayment-plan
GET    /v1/bookings/{booking_id}/repayment-summary
```

### 14.5 Payments and refunds

```text
POST   /v1/bookings/{booking_id}/payment-intents
GET    /v1/payments/{payment_id}
GET    /v1/me/wallet
GET    /v1/me/wallet/transactions
POST   /v1/bookings/{booking_id}/refund-requests
GET    /v1/refunds/{refund_id}
POST   /v1/webhooks/payments/{provider}
```

### 14.6 Operations APIs

Operations APIs live under `/internal/v1` and require staff identity and role authorization. They support:

- manual-review queues;
- reconciliation;
- provider retry/recovery;
- cancellation and refund review;
- controlled state repair through explicit commands;
- rule and provider configuration;
- audit-log lookup.

Direct database editing is not an accepted operations process.

### 14.7 Error envelope

```json
{
  "error": {
    "code": "QUOTE_PRICE_CHANGED",
    "message": "The selected offer must be accepted again.",
    "retryable": false,
    "correlation_id": "cor_123",
    "details": {
      "replacement_quote_id": "qte_456"
    }
  }
}
```

Messages must be safe for SupaOS to show to customers. Internal/provider errors remain restricted.

## 15. Events sent to SupaOS

The backend sends signed, versioned events to a configured SupaOS endpoint.

Initial event types:

- `kyc.status_changed`
- `quote.repriced`
- `quote.expired`
- `payment.pending`
- `payment.succeeded`
- `payment.failed`
- `booking.confirmed`
- `booking.failed`
- `booking.manual_review_required`
- `installment.upcoming`
- `installment.overdue`
- `grace_period.started`
- `repayment_plan.completed`
- `itinerary.full_available`
- `cancellation.status_changed`
- `refund.status_changed`

Event envelope:

```json
{
  "event_id": "evt_123",
  "type": "payment.succeeded",
  "version": 1,
  "occurred_at": "2026-08-06T12:00:00Z",
  "customer": {
    "whatsapp_number": "+2348012345678"
  },
  "data": {
    "booking_id": "bkg_123",
    "payment_id": "pay_123",
    "amount_minor": 8050000,
    "currency": "NGN"
  }
}
```

Delivery is at least once. SupaOS must deduplicate using `event_id`. Tripkopa retries failures with exponential backoff and exposes dead-letter events to operations.

## 16. Core data model

Minimum entities:

- `customers`
- `customer_channel_identities`
- `kyc_profiles`
- `kyc_sessions`
- `consent_records`
- `airports`
- `flight_searches`
- `flight_offers`
- `quotes`
- `quote_price_components`
- `bookings`
- `booking_passengers`
- `provider_bookings`
- `itineraries`
- `terms_acceptances`
- `financing_decisions`
- `repayment_plans`
- `installments`
- `wallets`
- `ledger_accounts`
- `ledger_transactions`
- `ledger_entries`
- `payment_intents`
- `provider_transactions`
- `refunds`
- `provider_webhook_events`
- `outbox_events`
- `rule_versions`
- `audit_events`

Public IDs must be opaque and non-sequential.

## 17. Consistency and concurrency

- Use database transactions for state transition plus outbox-event creation.
- Use an outbox worker for SupaOS events.
- Lock or compare versions when confirming quotes, allocating funds, issuing tickets and processing refunds.
- Enforce unique constraints for provider event IDs and idempotency keys.
- Use a booking saga for multi-provider operations; do not hold a database transaction open across network calls.
- Implement circuit breakers, bounded retries and timeouts for all provider calls.
- Retry only operations known to be safe or protected by provider idempotency.

## 18. Security and privacy requirements

- TLS for all network traffic.
- Encryption at rest for databases, backups and object storage.
- Secrets stored in a managed secret store, never source code or workflow payloads.
- Field-level encryption or tokenization for high-risk identifiers retained by Tripkopa.
- Role-based staff access with least privilege.
- Audit all access to KYC, passenger, payment, itinerary and refund data.
- Redact WhatsApp numbers, names and provider references from ordinary logs where not required.
- Never log raw BVN/NIN, document images, access tokens or provider webhook secrets.
- Rate-limit APIs by service, customer and operation.
- Validate redirect and callback destinations against allowlists.
- Protect KYC sessions against token reuse, CSRF, session fixation and clickjacking.
- Define retention by data category and support deletion/anonymization when permitted.
- Maintain tested backup, restoration, incident-response and key-rotation procedures.

## 19. Observability and operations

Metrics:

- provider latency, success and error rate;
- search-to-quote conversion;
- quote reprice and expiry rate;
- booking confirmation and ticketing rate;
- payment success, pending and reversal rate;
- ledger/provider reconciliation variance;
- KYC completion/failure rate;
- webhook age, retry count and dead-letter volume;
- installment delinquency and grace-period volume;
- refund cycle time;
- manual-review queue age.

Every request, provider call and event must carry a correlation ID. Business dashboards use internal IDs and masked customer identifiers.

## 20. Non-functional requirements

- **Availability:** Target 99.9% monthly availability excluding upstream provider outages.
- **Search latency:** Return initial results within 10 seconds at p95 when providers respond normally; support asynchronous polling for slower aggregation.
- **Non-search API latency:** Under 750 ms at p95 excluding provider calls.
- **Scalability:** Stateless API nodes and independently scalable background workers.
- **Reliability:** No lost acknowledged provider webhook events.
- **Financial correctness:** Zero unexplained ledger imbalance; every ledger transaction must balance.
- **Auditability:** Reconstruct every booking price, accepted terms, payment and state transition.
- **Versioning:** Backward-compatible `/v1` contracts and versioned webhook payloads.
- **Environment separation:** Separate development, staging and production credentials, databases and provider accounts.

## 21. Testing requirements

### 21.1 Unit tests

- price and fee calculations;
- route classification;
- financing-window and installment validation;
- state-transition guards;
- itinerary-release policy;
- refund allocation;
- provider error mapping;
- identity-assertion validation.

### 21.2 Contract tests

Every provider adapter must pass the same interface contract suite using sandbox fixtures.

### 21.3 Integration tests

- signed SupaOS authentication;
- KYC link issue, exchange, expiry and replay rejection;
- KYC and payment webhook signature verification;
- duplicate webhook processing;
- payment-to-ledger reconciliation;
- quote reprice before payment;
- booking recovery after provider timeout;
- SupaOS event retry and deduplication.

### 21.4 End-to-end tests

- standard booking from search through full itinerary;
- flexible booking from KYC through deposit and repayment completion;
- failed ticketing after successful payment;
- missed installment, grace period and cancellation;
- partial/full refund and travel credit;
- manual-review escalation.

## 22. Delivery phases

### Phase 1: Foundation

- Customer identity and SupaOS signed authentication.
- KYC session UI/API and one KYC adapter.
- Core data model, audit log and outbox.
- Provider registries/factories.

### Phase 2: Standard flight booking

- Airport/route classification.
- One flight provider adapter.
- Search, quote, revalidation and booking.
- One payment provider adapter.
- Full-payment ledger and itinerary.

### Phase 3: Flexible payments

- Eligibility record and deterministic rules.
- Deposit/repayment-plan calculation.
- Virtual accounts, installment ledger and reminders/events.
- Partial/full itinerary release.

### Phase 4: Cancellations and refunds

- Recoverable-value flow.
- Refund/travel-credit states.
- Operations review and reconciliation tooling.

### Phase 5: Resilience and additional providers

- Additional flight/payment/KYC adapters.
- Provider fallback and circuit breakers.
- Load, failure-recovery and security testing.

## 23. MVP acceptance criteria

The backend MVP is complete when:

1. A SupaOS call cannot impersonate a different WhatsApp number by changing request JSON.
2. A customer can receive a one-time KYC link and complete verification without sending BVN/NIN through WhatsApp or SupaOS.
3. Expired, reused or customer-mismatched KYC links are rejected.
4. SupaOS can search, select and revalidate normalized flight offers without provider-specific knowledge.
5. A changed or expired fare cannot be booked at its old price.
6. A full-payment booking can be paid, ticketed and retrieved through structured APIs.
7. Duplicate SupaOS requests and provider webhooks do not create duplicate financial or booking operations.
8. Ledger entries balance and reconcile to successful provider transactions.
9. SupaOS receives signed payment, KYC and booking events and can safely retry/deduplicate them.
10. Provider credentials, raw KYC identifiers and internal errors do not appear in customer responses or standard logs.
11. A provider adapter can be replaced through configuration without changing booking-service business logic.
12. Failed asynchronous operations enter a recoverable state or an auditable manual-review queue.





For the flights API we are using take trips as our flight provider 
![logo](https://taketrips.co/appicon.png)

TakeTrips

Integrate TakeTrips flight search and booking capabilities into your own application.
Introduction
The TakeTrips Reseller API allows you to perform flight searches, validate offers, and create bookings programmatically. Our API follows RESTful principles and returns data in JSON format.

Authentication
All API requests must be authenticated using your API Key as a Bearer token in the Authorization header. You can find your API Key in your Profile Page.
Base URLs
Select the appropriate environment for your integration:

Production: https://appsconnect.taketrips.co
Search Flights
Search for available flight offers based on origin, destination, and dates.

GET
/resellers/flights/search
Query Parameters

Parameter	Type	Description
from	string required*	Origin airport IATA code (e.g., "LHR"). *Required for single-city search.
to	string required*	Destination airport IATA code (e.g., "JFK"). *Required for single-city search.
departureDate	string required*	Departure date in YYYY-MM-DD format. *Required for single-city search.
returnDate	string	Return date in YYYY-MM-DD format (leave empty for one-way).
adult	number	Number of adult passengers (default: 1).
children	number	Number of child passengers (2-12 years, default: 0).
infant	number	Number of infant passengers (under 2 years, default: 0).
cabinClass	string	Cabin class: Economy, Premium_Economy, Business, First (default: Economy).
Multi-City Search
For multi-city itineraries, use indexed parameters (starting from 0) for each segment. When using multi-city search, the from, to, and departureDate parameters should be omitted.
Parameter (max of 5)	Type	Description
from{n}	string	Origin airport IATA code for segment n.
to{n}	string	Destination airport IATA code for segment n.
departureDate{n}	string	Departure date for segment n in YYYY-MM-DD format.
Example Requests

Single-City Round Trip:

curl -X GET "https://appsconnect.taketrips.co/resellers/flights/search?from=LHR&to=DXB&departureDate=2024-12-01&returnDate=2024-12-10&adult=1&children=1" \
     -H "Authorization: Bearer YOUR_API_KEY"
Multi-City (LHR-DXB, DXB-SIN):

curl -X GET "https://appsconnect.taketrips.co/resellers/flights/search?from0=LHR&to0=DXB&departureDate0=2024-12-01&from1=DXB&to1=SIN&departureDate1=2024-12-05&adult=1" \
     -H "Authorization: Bearer YOUR_API_KEY"
Example Response

{
  "status": true,
  "details": {
    "total": "1175809.08",
    "id": "1",
    "price": {
        "currency": "NGN",
        "total": "1175809.08",
        "base": "90448.00",
        "fees": null,
        "grandTotal": 1175809.08,
        "flexiTotal": 1175809.08,
        "discount": 0,
        "discountComment": "",
        "conversion": {
            "from": "",
            "to": "",
            "price": 0,
            "convertedPrice": 0,
            "rates": {
                "GBP": 1974.825,
                "USD": 1443.18,
                "BASE": "NGN"
            }
        }
    },
    "itenaries": {
        "routes": {
            "outgoingRoutes": [
                {
                    "id": "78",
                    "carrier": "",
                    "carrierCode": "QR",
                    "operatingCarrierCode": "QR",
                    "carrierNumber": "1408",
                    "aircraftCode": "",
                    "routeDuration": "PT6H55M",
                    "numberOfStops": 0,
                    "departure": {
                        "iataCode": "LOS",
                        "terminal": "2I",
                        "timestamp": "2026-03-31T08:55:00"
                    },
                    "arrival": {
                        "iataCode": "DOH",
                        "timestamp": "2026-03-31T17:50:00"
                    }
                },
                {
                    "id": "79",
                    "carrier": "",
                    "carrierCode": "QR",
                    "operatingCarrierCode": "QR",
                    "carrierNumber": "329",
                    "aircraftCode": "",
                    "routeDuration": "PT7H10M",
                    "numberOfStops": 0,
                    "departure": {
                        "iataCode": "DOH",
                        "timestamp": "2026-04-01T01:30:00"
                    },
                    "arrival": {
                        "iataCode": "LGW",
                        "terminal": "N",
                        "timestamp": "2026-04-01T06:40:00"
                    }
                }
            ],
            "returnRoutes": [
                {
                    "id": "145",
                    "carrier": "",
                    "carrierCode": "QR",
                    "operatingCarrierCode": "QR",
                    "carrierNumber": "328",
                    "aircraftCode": "",
                    "routeDuration": "PT6H35M",
                    "numberOfStops": 0,
                    "departure": {
                        "iataCode": "LGW",
                        "terminal": "N",
                        "timestamp": "2026-04-07T14:55:00"
                    },
                    "arrival": {
                        "iataCode": "DOH",
                        "timestamp": "2026-04-07T23:30:00"
                    }
                },
                {
                    "id": "146",
                    "carrier": "",
                    "carrierCode": "QR",
                    "operatingCarrierCode": "QR",
                    "carrierNumber": "1405",
                    "aircraftCode": "",
                    "routeDuration": "PT8H5M",
                    "numberOfStops": 0,
                    "departure": {
                        "iataCode": "DOH",
                        "timestamp": "2026-04-08T07:30:00"
                    },
                    "arrival": {
                        "iataCode": "LOS",
                        "terminal": "2I",
                        "timestamp": "2026-04-08T13:35:00"
                    }
                }
            ],
            "cityRoutes": {
                "single": {
                    "from": "LOS",
                    "to": "LON",
                    "departureDate": "2026-03-31",
                    "returnDate": "2026-04-07"
                },
                "multi": []
            }
        },
        "passengers": {
            "adult": 1,
            "children": 0,
            "infant": 0
        },
        "carriers": [
            "QR"
        ],
        "rules": {},
        "flightClassBagsAndFare": {
            "allowance": {
                "checkedBags": {
                    "adult": {
                        "weight": 23,
                        "total": 2,
                        "amount": 0
                    },
                    "child": {
                        "weight": 23,
                        "total": 0,
                        "amount": 0
                    }
                },
                "carryOn": {
                    "adult": {
                        "weight": 7,
                        "total": "1",
                        "amount": 0
                    },
                    "child": {
                        "weight": 7,
                        "total": "1",
                        "amount": 0
                    }
                },
                "extras": []
            }
        },
        "baggagePrice": 0,
        "isVirtualInterlining": false,
        "totalTripduration": 2665
    },
    "currency": "NGN",
    "conversionRate": 1,
    "bookingToken": "",
    "cabinClass": "economy",
    "gdsType": "amadeus",
 
}
}
Validate Offer
Confirm the price and availability of a specific flight offer before proceeding to booking.

POST
/resellers/flights/validate
Request Body

Field	Type	Description
flightInfo	FlightOffers required	The flight offer object received from the search results.
Post the full offer object to this endpoint; it returns the validated version if the offer remains available.

Example Request/Response

{
  "status": true,
  "details": {
    "total": "1175809.08",
    "id": "1",
    "price": {
        "currency": "NGN",
        "total": "1175809.08",
        "base": "90448.00",
        "fees": null,
        "grandTotal": 1175809.08,
        "flexiTotal": 1175809.08,
        "discount": 0,
        "discountComment": "",
        "conversion": {
            "from": "",
            "to": "",
            "price": 0,
            "convertedPrice": 0,
            "rates": {
                "GBP": 1974.825,
                "USD": 1443.18,
                "BASE": "NGN"
            }
        }
    },
    "itenaries": {
        "routes": {
            "outgoingRoutes": [
                {
                    "id": "78",
                    "carrier": "",
                    "carrierCode": "QR",
                    "operatingCarrierCode": "QR",
                    "carrierNumber": "1408",
                    "aircraftCode": "",
                    "routeDuration": "PT6H55M",
                    "numberOfStops": 0,
                    "departure": {
                        "iataCode": "LOS",
                        "terminal": "2I",
                        "timestamp": "2026-03-31T08:55:00"
                    },
                    "arrival": {
                        "iataCode": "DOH",
                        "timestamp": "2026-03-31T17:50:00"
                    }
                },
                {
                    "id": "79",
                    "carrier": "",
                    "carrierCode": "QR",
                    "operatingCarrierCode": "QR",
                    "carrierNumber": "329",
                    "aircraftCode": "",
                    "routeDuration": "PT7H10M",
                    "numberOfStops": 0,
                    "departure": {
                        "iataCode": "DOH",
                        "timestamp": "2026-04-01T01:30:00"
                    },
                    "arrival": {
                        "iataCode": "LGW",
                        "terminal": "N",
                        "timestamp": "2026-04-01T06:40:00"
                    }
                }
            ],
            "returnRoutes": [
                {
                    "id": "145",
                    "carrier": "",
                    "carrierCode": "QR",
                    "operatingCarrierCode": "QR",
                    "carrierNumber": "328",
                    "aircraftCode": "",
                    "routeDuration": "PT6H35M",
                    "numberOfStops": 0,
                    "departure": {
                        "iataCode": "LGW",
                        "terminal": "N",
                        "timestamp": "2026-04-07T14:55:00"
                    },
                    "arrival": {
                        "iataCode": "DOH",
                        "timestamp": "2026-04-07T23:30:00"
                    }
                },
                {
                    "id": "146",
                    "carrier": "",
                    "carrierCode": "QR",
                    "operatingCarrierCode": "QR",
                    "carrierNumber": "1405",
                    "aircraftCode": "",
                    "routeDuration": "PT8H5M",
                    "numberOfStops": 0,
                    "departure": {
                        "iataCode": "DOH",
                        "timestamp": "2026-04-08T07:30:00"
                    },
                    "arrival": {
                        "iataCode": "LOS",
                        "terminal": "2I",
                        "timestamp": "2026-04-08T13:35:00"
                    }
                }
            ],
            "cityRoutes": {
                "single": {
                    "from": "LOS",
                    "to": "LON",
                    "departureDate": "2026-03-31",
                    "returnDate": "2026-04-07"
                },
                "multi": []
            }
        },
        "passengers": {
            "adult": 1,
            "children": 0,
            "infant": 0
        },
        "carriers": [
            "QR"
        ],
        "rules": {},
        "flightClassBagsAndFare": {
            "allowance": {
                "checkedBags": {
                    "adult": {
                        "weight": 23,
                        "total": 2,
                        "amount": 0
                    },
                    "child": {
                        "weight": 23,
                        "total": 0,
                        "amount": 0
                    }
                },
                "carryOn": {
                    "adult": {
                        "weight": 7,
                        "total": "1",
                        "amount": 0
                    },
                    "child": {
                        "weight": 7,
                        "total": "1",
                        "amount": 0
                    }
                },
                "extras": []
            }
        },
        "baggagePrice": 0,
        "isVirtualInterlining": false,
        "totalTripduration": 2665
    },
    "currency": "NGN",
    "conversionRate": 1,
    "bookingToken": "",
    "cabinClass": "economy",
    "gdsType": "amadeus",
 
}
}
Create Booking
Finalize the flight booking by providing passenger and payment details.

POST
/resellers/flights/order
Request Body

Field	Type	Description
flightOffer	FlightOffers required	The validated flight offer object.
passengers	PaxInfo[] required	An array of passenger details.
paymentRef	string	Optional payment reference or transaction ID.
Passenger Details (PaxInfo)

Field	Type	Description
title	string	Mr, Mrs, Miss, etc.
firstName	string required	Passenger's first name.
middleName	string	Passenger's middle name.
lastName	string required	Passenger's last name.
dob	string required	Date of birth (YYYY-MM-DD).
gender	string required	MALE or FEMALE.
passportNumber	string required	Passport or ID number.
passportExpiry	string required	Passport expiry date (YYYY-MM-DD).
email	string required	Contact email for the passenger.
phone	string required	Contact phone number with country code.
Example Request

{
  "flightOffer": {
    "id": "offer_123",
    "total": 250.00,
    "currency": "USD",
    "gdsType": "AMADEUS",
    "itenaries": { ... }
  },
  "passengers": [
    {
      "title": "MR",
      "firstName": "John",
      "lastName": "Doe",
      "dob": "1990-01-01",
      "gender": "MALE",
      "passportNumber": "A12345678",
      "passportExpiry": "2030-01-01",
      "issuanceDate": "2020-01-01",
      "passportIssuingAuthority": "UK",
      "saveDetails": false,
      "email": "john.doe@example.com",
      "phone": "+44123456789",
      "label": "ADULT"
    }
  ],
  "paymentRef": "ref_12345"
}
Example Response

{
  "status": true,
  "message": "Booking created successfully",
  "details": {
    "bookingId": "TT-123456",
    "pnr": "ABCD12",
    "status": "CONFIRMED",
    "total": 250.00,
    "currency": "USD"
    offer: {...}
  }
