ALTER TABLE public.installment_reminders
  ADD COLUMN IF NOT EXISTS delivery_channel TEXT NOT NULL DEFAULT 'WHATSAPP',
  ADD COLUMN IF NOT EXISTS recipient TEXT,
  ADD COLUMN IF NOT EXISTS subject TEXT,
  ADD COLUMN IF NOT EXISTS delivery_status TEXT NOT NULL DEFAULT 'SENT',
  ADD COLUMN IF NOT EXISTS provider_message_id TEXT,
  ADD COLUMN IF NOT EXISTS delivery_error TEXT,
  ADD COLUMN IF NOT EXISTS attempted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS trigger_source TEXT NOT NULL DEFAULT 'LEGACY';

ALTER TABLE public.installment_reminders
  ALTER COLUMN delivery_channel SET DEFAULT 'EMAIL',
  ALTER COLUMN delivery_status SET DEFAULT 'PENDING',
  ALTER COLUMN trigger_source SET DEFAULT 'CRON',
  ALTER COLUMN sent_at DROP NOT NULL,
  ALTER COLUMN sent_at DROP DEFAULT;

CREATE INDEX IF NOT EXISTS installment_reminders_delivery_status_idx
  ON public.installment_reminders(delivery_status, attempted_at);

ALTER TABLE public.kyc_sessions
  ADD COLUMN IF NOT EXISTS success_email_status TEXT NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS success_email_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS success_email_provider_id TEXT,
  ADD COLUMN IF NOT EXISTS success_email_error TEXT;
