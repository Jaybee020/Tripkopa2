-- Automatically apply each verified deposit to eligible financing balances while
-- preserving any unused amount in the customer's wallet.

CREATE TABLE IF NOT EXISTS public.payment_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID NOT NULL REFERENCES public.payments(id) ON DELETE RESTRICT,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE RESTRICT,
  amount NUMERIC NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL,
  allocation_type TEXT NOT NULL,
  provider_paid_at TIMESTAMPTZ,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS payment_allocations_payment_idx
  ON public.payment_allocations(payment_id, created_at);
CREATE INDEX IF NOT EXISTS payment_allocations_booking_idx
  ON public.payment_allocations(booking_id, created_at);
CREATE INDEX IF NOT EXISTS payment_allocations_customer_idx
  ON public.payment_allocations(customer_id, created_at DESC);

ALTER TABLE public.payment_allocations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payment_allocations_staff_read ON public.payment_allocations;
CREATE POLICY payment_allocations_staff_read ON public.payment_allocations
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.staff_profiles sp
    WHERE sp.user_id = auth.uid()
      AND sp.role IN ('operations', 'operations_staff', 'admin')
  ));

CREATE OR REPLACE FUNCTION public.allocate_wallet_payment(p_payment_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment public.payments%ROWTYPE;
  v_wallet public.wallets%ROWTYPE;
  v_booking public.bookings%ROWTYPE;
  v_installment public.installments%ROWTYPE;
  v_available NUMERIC := 0;
  v_remaining NUMERIC := 0;
  v_total_allocated NUMERIC := 0;
  v_booking_allocation NUMERIC := 0;
  v_deposit_allocation NUMERIC := 0;
  v_installment_budget NUMERIC := 0;
  v_installment_allocation NUMERIC := 0;
  v_next_paid NUMERIC := 0;
  v_next_balance NUMERIC := 0;
  v_next_status TEXT;
  v_paid_at TIMESTAMPTZ;
  v_allocation_id UUID;
  v_allocation_key TEXT;
  v_breakdown JSONB;
  v_allocations JSONB := '[]'::jsonb;
  v_summary JSONB;
BEGIN
  SELECT * INTO v_payment
    FROM public.payments
   WHERE id = p_payment_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment not found';
  END IF;
  IF v_payment.status <> 'SUCCEEDED' THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'payment_not_succeeded');
  END IF;

  IF COALESCE((v_payment.metadata->>'wallet_allocation_applied')::BOOLEAN, false) THEN
    RETURN COALESCE(
      v_payment.metadata->'wallet_allocation_summary',
      jsonb_build_object('applied', false, 'reason', 'already_applied')
    );
  END IF;
  IF COALESCE((v_payment.metadata->>'booking_allocation_applied')::BOOLEAN, false) THEN
    RETURN jsonb_build_object(
      'applied', false,
      'reason', 'legacy_booking_allocation_already_applied',
      'payment_id', v_payment.id
    );
  END IF;

  SELECT * INTO v_wallet
    FROM public.wallets
   WHERE customer_id = v_payment.customer_id
     AND currency = v_payment.currency
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'customer wallet not found';
  END IF;

  v_available := LEAST(v_payment.amount, v_wallet.balance);
  v_remaining := v_available;

  BEGIN
    v_paid_at := (v_payment.metadata #>> '{data,timestamp}')::TIMESTAMPTZ;
  EXCEPTION WHEN OTHERS THEN
    v_paid_at := NULL;
  END;
  v_paid_at := COALESCE(v_paid_at, v_payment.updated_at, NOW());

  FOR v_booking IN
    SELECT b.*
      FROM public.bookings b
     WHERE b.customer_id = v_payment.customer_id
       AND b.currency = v_payment.currency
       AND b.balance_amount > 0
       AND b.status NOT IN (
         'AWAITING_TERMS', 'CANCELLED', 'CANCELLATION_PENDING',
         'REFUNDED', 'FAILED', 'PAID'
       )
       AND (
         b.id = v_payment.booking_id
         OR b.booking_type = 'flexible'
       )
     ORDER BY
       CASE WHEN b.id = v_payment.booking_id THEN 0 ELSE 1 END,
       CASE
         WHEN EXISTS (
           SELECT 1 FROM public.installments i
            WHERE i.booking_id = b.id AND i.paid_amount < i.amount
              AND i.status = 'DEFAULTED'
         ) THEN 0
         WHEN EXISTS (
           SELECT 1 FROM public.installments i
            WHERE i.booking_id = b.id AND i.paid_amount < i.amount
              AND i.status = 'OVERDUE'
         ) THEN 1
         WHEN EXISTS (
           SELECT 1 FROM public.installments i
            WHERE i.booking_id = b.id AND i.paid_amount < i.amount
              AND i.status = 'GRACE'
         ) THEN 2
         ELSE 3
       END,
       COALESCE((
         SELECT MIN(i.due_date) FROM public.installments i
          WHERE i.booking_id = b.id AND i.paid_amount < i.amount
       ), b.departure_date, b.created_at::DATE),
       b.created_at
     FOR UPDATE OF b
  LOOP
    EXIT WHEN v_remaining <= 0;

    v_booking_allocation := LEAST(v_remaining, v_booking.balance_amount);
    IF v_booking_allocation <= 0 THEN
      CONTINUE;
    END IF;

    v_breakdown := jsonb_build_object(
      'deposit_amount', 0,
      'installments', '[]'::jsonb
    );

    IF v_booking.booking_type = 'flexible' THEN
      v_deposit_allocation := LEAST(
        v_booking_allocation,
        GREATEST(0, COALESCE(v_booking.deposit_amount, 0) - v_booking.amount_paid)
      );
    ELSE
      v_deposit_allocation := 0;
    END IF;

    IF v_deposit_allocation > 0 THEN
      v_breakdown := jsonb_set(
        v_breakdown,
        '{deposit_amount}',
        to_jsonb(v_deposit_allocation)
      );
    END IF;

    v_installment_budget := v_booking_allocation - v_deposit_allocation;

    IF v_booking.booking_type = 'flexible' AND v_installment_budget > 0 THEN
      FOR v_installment IN
        SELECT i.*
          FROM public.installments i
         WHERE i.booking_id = v_booking.id
           AND i.customer_id = v_booking.customer_id
           AND i.paid_amount < i.amount
         ORDER BY
           CASE i.status
             WHEN 'DEFAULTED' THEN 0
             WHEN 'OVERDUE' THEN 1
             WHEN 'GRACE' THEN 2
             ELSE 3
           END,
           i.due_date,
           i.sequence_number
         FOR UPDATE
      LOOP
        EXIT WHEN v_installment_budget <= 0;
        v_installment_allocation := LEAST(
          v_installment_budget,
          v_installment.amount - v_installment.paid_amount
        );
        IF v_installment_allocation <= 0 THEN
          CONTINUE;
        END IF;

        UPDATE public.installments
           SET paid_amount = paid_amount + v_installment_allocation,
               status = CASE
                 WHEN paid_amount + v_installment_allocation >= amount THEN 'PAID'
                 ELSE 'PARTIALLY_PAID'
               END,
               paid_at = CASE
                 WHEN paid_amount + v_installment_allocation >= amount
                   THEN COALESCE(paid_at, v_paid_at)
                 ELSE paid_at
               END
         WHERE id = v_installment.id;

        v_breakdown := jsonb_set(
          v_breakdown,
          '{installments}',
          (v_breakdown->'installments') || jsonb_build_array(jsonb_build_object(
            'installment_id', v_installment.id,
            'sequence_number', v_installment.sequence_number,
            'amount', v_installment_allocation,
            'due_date', v_installment.due_date,
            'phase', v_installment.phase
          ))
        );
        v_installment_budget := v_installment_budget - v_installment_allocation;
      END LOOP;
    END IF;

    IF v_installment_budget > 0 THEN
      v_breakdown := jsonb_set(
        v_breakdown,
        '{unassigned_booking_balance}',
        to_jsonb(v_installment_budget)
      );
    END IF;

    v_next_paid := LEAST(v_booking.total_amount, v_booking.amount_paid + v_booking_allocation);
    v_next_balance := GREATEST(0, v_booking.total_amount - v_next_paid);
    v_next_status := CASE
      WHEN v_next_balance = 0 THEN 'PAID'
      WHEN v_booking.status IN (
        'MANUAL_REVIEW', 'BOOKING_IN_PROGRESS', 'CANCELLATION_REVIEW'
      ) THEN v_booking.status
      WHEN v_booking.provider_reference IS NOT NULL THEN 'TICKETED'
      WHEN v_booking.booking_type = 'flexible'
        AND v_next_paid >= COALESCE(v_booking.deposit_amount, 0) THEN 'PAYMENT_RECEIVED'
      ELSE 'PARTIALLY_PAID'
    END;

    UPDATE public.bookings
       SET amount_paid = v_next_paid,
           balance_amount = v_next_balance,
           status = v_next_status
     WHERE id = v_booking.id;

    v_allocation_key := v_payment.id::TEXT || ':' || v_booking.id::TEXT;
    v_allocation_id := NULL;
    INSERT INTO public.payment_allocations (
      payment_id, customer_id, booking_id, amount, currency,
      allocation_type, provider_paid_at, details, idempotency_key
    ) VALUES (
      v_payment.id, v_payment.customer_id, v_booking.id,
      v_booking_allocation, v_payment.currency,
      CASE WHEN v_booking.id = v_payment.booking_id
        THEN 'EXPLICIT_BOOKING'
        ELSE 'AUTOMATIC_LOAN'
      END,
      v_paid_at, v_breakdown, v_allocation_key
    )
    ON CONFLICT (idempotency_key) DO NOTHING
    RETURNING id INTO v_allocation_id;

    IF v_allocation_id IS NULL THEN
      RAISE EXCEPTION 'duplicate allocation state for payment % and booking %',
        v_payment.id, v_booking.id;
    END IF;

    INSERT INTO public.ledger_entries (
      customer_id, wallet_id, payment_id, booking_id, entry_type,
      amount, currency, status, description, account_code, direction,
      provider_reference, idempotency_key
    ) VALUES
      (
        v_payment.customer_id, v_wallet.id, v_payment.id, v_booking.id,
        'BOOKING_PAYMENT', v_booking_allocation, v_payment.currency, 'POSTED',
        'Wallet automatically applied to booking', 'CUSTOMER_AVAILABLE', 'DEBIT',
        v_payment.provider_reference, v_allocation_key
      ),
      (
        v_payment.customer_id, v_wallet.id, v_payment.id, v_booking.id,
        'BOOKING_PAYMENT', v_booking_allocation, v_payment.currency, 'POSTED',
        'Booking receivable settled', 'BOOKING_RECEIVABLE', 'CREDIT',
        v_payment.provider_reference, v_allocation_key
      );

    v_allocations := v_allocations || jsonb_build_array(jsonb_build_object(
      'allocation_id', v_allocation_id,
      'booking_id', v_booking.id,
      'amount', v_booking_allocation,
      'allocation_type', CASE WHEN v_booking.id = v_payment.booking_id
        THEN 'EXPLICIT_BOOKING'
        ELSE 'AUTOMATIC_LOAN'
      END,
      'booking_status', v_next_status,
      'outstanding_balance', v_next_balance,
      'details', v_breakdown
    ));

    v_remaining := v_remaining - v_booking_allocation;
    v_total_allocated := v_total_allocated + v_booking_allocation;
  END LOOP;

  IF v_total_allocated > 0 THEN
    UPDATE public.wallets
       SET balance = balance - v_total_allocated
     WHERE id = v_wallet.id;
  END IF;

  v_summary := jsonb_build_object(
    'applied', v_total_allocated > 0,
    'reason', CASE WHEN v_total_allocated > 0
      THEN NULL
      ELSE 'no_eligible_outstanding_loan'
    END,
    'payment_id', v_payment.id,
    'deposit_amount', v_payment.amount,
    'allocated_amount', v_total_allocated,
    'unallocated_amount', v_payment.amount - v_total_allocated,
    'wallet_balance', v_wallet.balance - v_total_allocated,
    'currency', v_payment.currency,
    'allocations', v_allocations
  );

  UPDATE public.payments
     SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
       'wallet_allocation_applied', true,
       'wallet_allocation_applied_at', NOW(),
       'wallet_allocation_summary', v_summary
     )
   WHERE id = v_payment.id;

  INSERT INTO public.operational_events (
    customer_id, event_type, payload, delivered_at
  ) VALUES (
    v_payment.customer_id,
    CASE WHEN v_total_allocated > 0
      THEN 'payment.automatically_allocated'
      ELSE 'payment.wallet_balance_retained'
    END,
    v_summary,
    NULL
  );

  RETURN v_summary;
END;
$$;

REVOKE ALL ON FUNCTION public.allocate_wallet_payment(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.allocate_wallet_payment(UUID) TO service_role;
