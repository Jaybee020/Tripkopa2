CREATE TABLE IF NOT EXISTS public.take_trip_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operation TEXT NOT NULL,
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  request_payload JSONB,
  response_status INTEGER,
  response_payload JSONB,
  error_message TEXT,
  error_payload JSONB,
  duration_ms INTEGER NOT NULL,
  success BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS take_trip_logs_created_at_idx
  ON public.take_trip_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS take_trip_logs_operation_created_at_idx
  ON public.take_trip_logs (operation, created_at DESC);

ALTER TABLE public.take_trip_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS take_trip_logs_staff_read ON public.take_trip_logs;
CREATE POLICY take_trip_logs_staff_read
  ON public.take_trip_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.staff_profiles sp
      WHERE sp.user_id = auth.uid()
        AND sp.role IN ('operations', 'operations_staff', 'admin')
    )
  );
