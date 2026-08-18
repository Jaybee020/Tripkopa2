-- Trust-based financing, repayment lifecycle, and ticket-rule snapshots.

ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS trust_tier TEXT NOT NULL DEFAULT 'OBSERVER';
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS trust_tier_override TEXT;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS trust_tier_override_reason TEXT;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS trust_tier_overridden_at TIMESTAMPTZ;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS successful_cycles INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS on_time_repayment_rate NUMERIC NOT NULL DEFAULT 1;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS reminder_dependency_rate NUMERIC NOT NULL DEFAULT 0;

ALTER TABLE public.flight_searches ADD COLUMN IF NOT EXISTS ticket_type TEXT NOT NULL DEFAULT 'any';

ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS route_category TEXT;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS trust_tier TEXT;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS repayment_deadline DATE;

ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS route_category TEXT;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS trust_tier_at_booking TEXT;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS ticket_type TEXT;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS fare_rules JSONB;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS departure_date DATE;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS travel_completion_date DATE;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS repayment_deadline DATE;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS grace_deadline DATE;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS post_travel_amount NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS post_travel_deadline DATE;

ALTER TABLE public.installments ADD COLUMN IF NOT EXISTS phase TEXT NOT NULL DEFAULT 'PRE_TRAVEL';
ALTER TABLE public.installments ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;
ALTER TABLE public.installments ADD COLUMN IF NOT EXISTS grace_due_date DATE;
ALTER TABLE public.installments ADD COLUMN IF NOT EXISTS reminder_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.itineraries ADD COLUMN IF NOT EXISTS provider_ticket_reference TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS installments_booking_sequence_key
  ON public.installments(booking_id, sequence_number);
CREATE INDEX IF NOT EXISTS installments_due_status_idx
  ON public.installments(due_date, status);

CREATE TABLE IF NOT EXISTS public.installment_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  installment_id UUID NOT NULL REFERENCES public.installments(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(customer_id, idempotency_key)
);
ALTER TABLE public.installment_reminders ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.customer_risk_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN',
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  resolution TEXT,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS customer_risk_events_customer_idx
  ON public.customer_risk_events(customer_id, status, severity);
DROP TRIGGER IF EXISTS customer_risk_events_set_updated_at ON public.customer_risk_events;
CREATE TRIGGER customer_risk_events_set_updated_at
  BEFORE UPDATE ON public.customer_risk_events
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
ALTER TABLE public.customer_risk_events ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.trust_tier_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  previous_tier TEXT,
  computed_tier TEXT NOT NULL,
  effective_tier TEXT NOT NULL,
  reason TEXT NOT NULL,
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS trust_tier_history_customer_idx
  ON public.trust_tier_history(customer_id, created_at DESC);
ALTER TABLE public.trust_tier_history ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.admin_rule_config_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL,
  version TEXT NOT NULL,
  value JSONB NOT NULL,
  description TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(key, version)
);
ALTER TABLE public.admin_rule_config_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS customer_risk_events_staff_all ON public.customer_risk_events;
CREATE POLICY customer_risk_events_staff_all ON public.customer_risk_events
  FOR ALL USING (EXISTS (
    SELECT 1 FROM public.staff_profiles sp
    WHERE sp.user_id = auth.uid() AND sp.role IN ('operations', 'operations_staff', 'admin')
  ));
DROP POLICY IF EXISTS installment_reminders_staff_read ON public.installment_reminders;
CREATE POLICY installment_reminders_staff_read ON public.installment_reminders
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.staff_profiles sp
    WHERE sp.user_id = auth.uid() AND sp.role IN ('operations', 'operations_staff', 'admin')
  ));
DROP POLICY IF EXISTS trust_tier_history_staff_read ON public.trust_tier_history;
CREATE POLICY trust_tier_history_staff_read ON public.trust_tier_history
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.staff_profiles sp
    WHERE sp.user_id = auth.uid() AND sp.role IN ('operations', 'operations_staff', 'admin')
  ));
DROP POLICY IF EXISTS admin_rule_versions_staff_read ON public.admin_rule_config_versions;
CREATE POLICY admin_rule_versions_staff_read ON public.admin_rule_config_versions
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.staff_profiles sp
    WHERE sp.user_id = auth.uid() AND sp.role IN ('operations', 'operations_staff', 'admin')
  ));

UPDATE public.admin_rule_configs
SET value = '{
  "rule_version":"flex_v2_2026_08",
  "full_service_fee_rate":0.05,
  "markup":{"domestic":[[5,0.075],[9,0.10],[12,0.125]],"regional":[[5,0.075],[9,0.10],[13,0.125],[16,0.175]],"international":[[5,0.075],[9,0.10],[13,0.125],[17,0.175],[21,0.225],[24,0.275]]},
  "max_financing_weeks":{"domestic":12,"regional":16,"international":24},
  "max_installments":{"domestic":4,"regional":6,"international":8},
  "repayment_due_days_before_departure":10,
  "generated_due_days_before_departure":14,
  "grace_period_days":3,
  "grace_hard_stop_days_before_departure":7,
  "post_travel_max_days":90,
  "deposit_rates":{"OBSERVER":{"domestic":0.35,"regional":0.45,"international":0.55},"EXPLORER":{"domestic":0.30,"regional":0.40,"international":0.50},"VOYAGER":{"domestic":0.25,"regional":0.35,"international":0.45},"NAVIGATOR":{"domestic":0.25,"regional":0.35,"international":0.45},"AMBASSADOR":{"domestic":0.25,"regional":0.35,"international":0.40}},
  "financing_caps":{"OBSERVER":{"domestic":300000,"regional":1000000,"international":1500000},"EXPLORER":{"domestic":350000,"regional":1200000,"international":1700000},"VOYAGER":{"domestic":400000,"regional":1300000,"international":2000000},"NAVIGATOR":{"domestic":450000,"regional":1400000,"international":2500000},"AMBASSADOR":{"domestic":500000,"regional":1500000,"international":3000000}},
  "post_travel_rates":{"OBSERVER":0,"EXPLORER":0,"VOYAGER":0.10,"NAVIGATOR":0.20,"AMBASSADOR":0.30}
}'::jsonb,
description = 'Versioned trust-based flexible payment rules.'
WHERE key = 'flex_mvp';

INSERT INTO public.admin_rule_config_versions(key, version, value, description)
SELECT key, value->>'rule_version', value, description
FROM public.admin_rule_configs WHERE key = 'flex_mvp'
ON CONFLICT (key, version) DO NOTHING;
