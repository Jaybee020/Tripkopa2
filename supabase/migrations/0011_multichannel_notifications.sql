-- Generic per-channel delivery records. Adding SMS or another channel requires
-- an application adapter, not another set of columns on each business table.
CREATE TABLE IF NOT EXISTS public.notification_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  notification_key TEXT NOT NULL UNIQUE,
  channel TEXT NOT NULL,
  recipient TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING',
  provider_message_id TEXT,
  error TEXT,
  attempted_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS notification_deliveries_customer_idx
  ON public.notification_deliveries(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notification_deliveries_entity_idx
  ON public.notification_deliveries(entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notification_deliveries_status_idx
  ON public.notification_deliveries(status, attempted_at);

DROP TRIGGER IF EXISTS notification_deliveries_set_updated_at
  ON public.notification_deliveries;
CREATE TRIGGER notification_deliveries_set_updated_at
  BEFORE UPDATE ON public.notification_deliveries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.notification_deliveries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notification_deliveries_staff_read
  ON public.notification_deliveries;
CREATE POLICY notification_deliveries_staff_read
  ON public.notification_deliveries FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.staff_profiles sp
    WHERE sp.user_id = auth.uid()
      AND sp.role IN ('operations', 'operations_staff', 'admin')
  ));

-- The logical reminder stays in installment_reminders; channel attempts live
-- in notification_deliveries and may fan out to one or many adapters.
ALTER TABLE public.installment_reminders
  ALTER COLUMN delivery_channel SET DEFAULT 'MULTI';
