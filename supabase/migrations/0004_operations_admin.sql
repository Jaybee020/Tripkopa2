CREATE TABLE IF NOT EXISTS public.admin_rule_configs (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  description TEXT,
  updated_by UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.admin_rule_configs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_rule_configs_staff_read ON public.admin_rule_configs;
CREATE POLICY admin_rule_configs_staff_read
  ON public.admin_rule_configs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.staff_profiles sp
      WHERE sp.user_id = auth.uid()
        AND sp.role IN ('operations', 'operations_staff', 'admin')
    )
  );

DROP POLICY IF EXISTS admin_rule_configs_admin_write ON public.admin_rule_configs;
CREATE POLICY admin_rule_configs_admin_write
  ON public.admin_rule_configs
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.staff_profiles sp
      WHERE sp.user_id = auth.uid()
        AND sp.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.staff_profiles sp
      WHERE sp.user_id = auth.uid()
        AND sp.role = 'admin'
    )
  );

CREATE TABLE IF NOT EXISTS public.operation_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_user_id UUID,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.operation_audit_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS operation_audit_events_staff_read ON public.operation_audit_events;
CREATE POLICY operation_audit_events_staff_read
  ON public.operation_audit_events
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.staff_profiles sp
      WHERE sp.user_id = auth.uid()
        AND sp.role IN ('operations', 'operations_staff', 'admin')
    )
  );

INSERT INTO public.admin_rule_configs (key, value, description)
VALUES (
  'flex_mvp',
  '{
    "rule_version": "flex_mvp_2026_08",
    "full_service_fee_rate": 0.05,
    "flex_deposit_rate": 0.30,
    "domestic_max_installments": 4,
    "regional_international_max_installments": 8,
    "final_payment_due_days_before_departure": 10,
    "grace_period_days": 3
  }'::jsonb,
  'MVP flexible payment and release rules surfaced to operations.'
)
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS resolution_reason TEXT;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS resolved_by UUID;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;
