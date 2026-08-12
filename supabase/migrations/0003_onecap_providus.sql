-- OneCap-proxied Providus virtual accounts owned by Tripkopa customers.
CREATE TABLE IF NOT EXISTS public.virtual_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'onecap_providus',
  account_number TEXT,
  account_name TEXT,
  bank_name TEXT,
  status TEXT NOT NULL DEFAULT 'PROVISIONING',
  provider_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (customer_id, provider),
  UNIQUE (provider, account_number)
);

DROP TRIGGER IF EXISTS virtual_accounts_set_updated_at ON public.virtual_accounts;
CREATE TRIGGER virtual_accounts_set_updated_at
  BEFORE UPDATE ON public.virtual_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.virtual_accounts ENABLE ROW LEVEL SECURITY;

-- Extra immutable-ledger correlation fields. Existing rows remain compatible.
ALTER TABLE public.ledger_entries ADD COLUMN IF NOT EXISTS account_code TEXT;
ALTER TABLE public.ledger_entries ADD COLUMN IF NOT EXISTS direction TEXT;
ALTER TABLE public.ledger_entries ADD COLUMN IF NOT EXISTS provider_reference TEXT;
ALTER TABLE public.ledger_entries ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS provider_webhooks_provider_event_uidx
  ON public.provider_webhooks (provider, provider_event_id);
CREATE UNIQUE INDEX IF NOT EXISTS ledger_entries_idempotency_account_uidx
  ON public.ledger_entries (idempotency_key, account_code)
  WHERE idempotency_key IS NOT NULL AND account_code IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS payments_customer_idempotency_uidx
  ON public.payments (customer_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS payments_provider_reference_uidx
  ON public.payments (provider, provider_reference)
  WHERE provider_reference IS NOT NULL;

-- Verify, deduplicate, and post a deposit in one database transaction.
CREATE OR REPLACE FUNCTION public.process_onecap_deposit(
  p_event_id TEXT,
  p_account_number TEXT,
  p_reference TEXT,
  p_amount NUMERIC,
  p_currency TEXT,
  p_payload JSONB
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer_id UUID;
  v_wallet_id UUID;
  v_payment_id UUID;
  v_candidate_id UUID;
  v_candidate_count INTEGER;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'deposit amount must be positive';
  END IF;

  SELECT customer_id INTO v_customer_id
    FROM public.virtual_accounts
   WHERE provider = 'onecap_providus'
     AND account_number = p_account_number
     AND status = 'ACTIVE';
  IF v_customer_id IS NULL THEN
    RAISE EXCEPTION 'virtual account not found';
  END IF;

  SELECT id INTO v_payment_id
    FROM public.payments
   WHERE provider = 'onecap_providus'
     AND provider_reference = p_reference;
  IF v_payment_id IS NOT NULL THEN
    RETURN v_payment_id;
  END IF;

  INSERT INTO public.provider_webhooks (
    provider, event_type, provider_event_id, payload,
    processing_status, processed_at
  ) VALUES (
    'onecap_providus', 'deposit.success', p_event_id, p_payload,
    'PROCESSED', NOW()
  ) ON CONFLICT (provider, provider_event_id) DO NOTHING;

  IF NOT FOUND THEN
    SELECT id INTO v_payment_id
      FROM public.payments
     WHERE provider = 'onecap_providus'
       AND provider_reference = p_reference;
    RETURN v_payment_id;
  END IF;

  SELECT id INTO v_wallet_id
    FROM public.wallets
   WHERE customer_id = v_customer_id
     AND currency = p_currency
   FOR UPDATE;
  IF v_wallet_id IS NULL THEN
    RAISE EXCEPTION 'customer wallet not found';
  END IF;

  SELECT COUNT(*) INTO v_candidate_count
    FROM public.payments
   WHERE customer_id = v_customer_id
     AND provider = 'onecap_providus'
     AND status = 'PENDING'
     AND amount = p_amount
     AND currency = p_currency;

  IF v_candidate_count = 1 THEN
    SELECT id INTO v_candidate_id
      FROM public.payments
     WHERE customer_id = v_customer_id
       AND provider = 'onecap_providus'
       AND status = 'PENDING'
       AND amount = p_amount
       AND currency = p_currency
     FOR UPDATE;
    UPDATE public.payments
       SET status = 'SUCCEEDED',
           provider_reference = p_reference,
           metadata = COALESCE(metadata, '{}'::jsonb) || p_payload
     WHERE id = v_candidate_id
     RETURNING id INTO v_payment_id;
  ELSE
    INSERT INTO public.payments (
      customer_id, provider, provider_reference, payment_type,
      amount, currency, status, metadata
    ) VALUES (
      v_customer_id, 'onecap_providus', p_reference, 'wallet_deposit',
      p_amount, p_currency, 'SUCCEEDED', p_payload
    ) RETURNING id INTO v_payment_id;
  END IF;

  INSERT INTO public.ledger_entries (
    customer_id, wallet_id, payment_id, entry_type, amount, currency,
    status, description, account_code, direction, provider_reference,
    idempotency_key
  ) VALUES
    (v_customer_id, v_wallet_id, v_payment_id, 'DEPOSIT', p_amount, p_currency,
     'POSTED', 'Providus virtual account deposit', 'CUSTOMER_AVAILABLE', 'CREDIT',
     p_reference, p_event_id),
    (v_customer_id, v_wallet_id, v_payment_id, 'DEPOSIT', p_amount, p_currency,
     'POSTED', 'Providus settlement clearing', 'PROVIDER_CLEARING', 'DEBIT',
     p_reference, p_event_id);

  UPDATE public.wallets
     SET balance = balance + p_amount
   WHERE id = v_wallet_id;

  INSERT INTO public.operational_events (
    customer_id, event_type, payload, delivered_at
  ) VALUES (
    v_customer_id, 'payment.succeeded',
    jsonb_build_object(
      'payment_id', v_payment_id,
      'provider_reference', p_reference,
      'amount', p_amount,
      'currency', p_currency
    ),
    NULL
  );

  RETURN v_payment_id;
END;
$$;

REVOKE ALL ON FUNCTION public.process_onecap_deposit(TEXT, TEXT, TEXT, NUMERIC, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.process_onecap_deposit(TEXT, TEXT, TEXT, NUMERIC, TEXT, JSONB) TO service_role;
