-- September 2026 pricing, trust-tier settlement, cancellation, and discount rules.

ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS cancellation_requested_at TIMESTAMPTZ;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS cancellation_platform_fee_rate NUMERIC;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS cancellation_platform_fee_amount NUMERIC;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS cancellation_airline_penalty_amount NUMERIC;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS cancellation_estimated_refund NUMERIC;

UPDATE public.admin_rule_configs
SET
  value = '{
    "rule_version":"pricing_v4_2026_09",
    "full_service_fee_rate":0.05,
    "markup":{
      "domestic":[[5,0.05],[9,0.075],[12,0.10]],
      "regional":[[5,0.05],[9,0.075],[13,0.10],[16,0.15]],
      "international":[[5,0.05],[9,0.075],[13,0.10],[17,0.15],[21,0.20],[24,0.25]]
    },
    "max_financing_weeks":{"domestic":12,"regional":16,"international":24},
    "max_installments":{"domestic":4,"regional":6,"international":8},
    "minimum_days_before_departure":21,
    "repayment_due_days_before_departure":10,
    "generated_due_days_before_departure":10,
    "grace_period_days":3,
    "grace_hard_stop_days_before_departure":7,
    "post_travel_max_days":90,
    "deposit_rates":{
      "OBSERVER":{"domestic":0.35,"regional":0.45,"international":0.55},
      "EXPLORER":{"domestic":0.30,"regional":0.40,"international":0.50},
      "VOYAGER":{"domestic":0.25,"regional":0.35,"international":0.45},
      "NAVIGATOR":{"domestic":0.25,"regional":0.35,"international":0.45},
      "AMBASSADOR":{"domestic":0.25,"regional":0.35,"international":0.40}
    },
    "financing_caps":{
      "OBSERVER":{"domestic":450000,"regional":2500000,"international":4500000},
      "EXPLORER":{"domestic":500000,"regional":3000000,"international":5000000},
      "VOYAGER":{"domestic":600000,"regional":4000000,"international":6000000},
      "NAVIGATOR":{"domestic":700000,"regional":5000000,"international":7000000},
      "AMBASSADOR":{"domestic":800000,"regional":6000000,"international":8000000}
    },
    "post_travel_rates":{"OBSERVER":0,"EXPLORER":0,"VOYAGER":0.10,"NAVIGATOR":0.20,"AMBASSADOR":0.30},
    "cancellation_rates":{
      "OBSERVER":{"domestic":0.20,"regional":0.20,"international":0.25},
      "EXPLORER":{"domestic":0.175,"regional":0.175,"international":0.23},
      "VOYAGER":{"domestic":0.15,"regional":0.15,"international":0.20},
      "NAVIGATOR":{"domestic":0.12,"regional":0.12,"international":0.17},
      "AMBASSADOR":{"domestic":0.10,"regional":0.10,"international":0.13}
    },
    "cancellation_fee_caps":{"domestic":0.20,"regional":0.20,"international":0.25},
    "discount_policy":{
      "approved_types":["PROMOTIONAL_CAMPAIGN","REFERRAL_CAMPAIGN","STRATEGIC_PARTNERSHIP","LOYALTY_REWARD","SEASONAL_CAMPAIGN"],
      "approved_benefits":["REDUCED_SERVICE_FEE","REDUCED_DEPOSIT","REPAYMENT_FLEXIBILITY_BOOST"],
      "blanket_discounts_allowed":false
    }
  }'::jsonb,
  description = 'September 2026 pricing, settlement, cancellation, and discount policy.',
  updated_at = NOW()
WHERE key = 'flex_mvp';

INSERT INTO public.admin_rule_config_versions(key, version, value, description)
SELECT
  key,
  value->>'rule_version',
  value,
  'September 2026 Tripkopa pricing and billing rules.'
FROM public.admin_rule_configs
WHERE key = 'flex_mvp'
ON CONFLICT (key, version) DO NOTHING;

-- Older quote documents embedded the full configuration and internal pricing
-- rates. Keep the schedule/request needed for fulfillment, but remove private
-- calculations from customer-owned JSON.
UPDATE public.quotes
SET details = details
  #- '{rules_snapshot}'
  #- '{pricing,base_amount}'
  #- '{pricing,rule_version}'
  #- '{pricing,financing_cap}'
  #- '{pricing,repayment_plan,markup_rate}'
  #- '{pricing,repayment_plan,minimum_deposit_rate}'
  #- '{pricing,repayment_plan,repayment_window_weeks}'
  #- '{pricing,repayment_plan,generated_deadline}'
WHERE details ? 'rules_snapshot'
   OR (details #> '{pricing,repayment_plan}') ? 'markup_rate';
