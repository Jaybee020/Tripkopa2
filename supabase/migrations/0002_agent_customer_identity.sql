-- Customer identity is asserted by the trusted WhatsApp agent, not auth.users.
ALTER TABLE public.customers ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS middle_name TEXT;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS last_name TEXT;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS date_of_birth DATE;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS gender TEXT;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS preferred_currency TEXT NOT NULL DEFAULT 'NGN';
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS profile_completed_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS customers_whatsapp_number_uidx
  ON public.customers (whatsapp_number);

-- A browser KYC session is created only after a single-use link is exchanged.
ALTER TABLE public.kyc_sessions ADD COLUMN IF NOT EXISTS browser_token_hash TEXT;
ALTER TABLE public.kyc_sessions ADD COLUMN IF NOT EXISTS consented_at TIMESTAMPTZ;
ALTER TABLE public.kyc_sessions ADD COLUMN IF NOT EXISTS privacy_notice_version TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS wallets_customer_id_uidx
  ON public.wallets (customer_id);
