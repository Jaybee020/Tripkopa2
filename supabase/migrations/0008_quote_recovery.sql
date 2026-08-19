ALTER TABLE public.flight_searches
  ADD COLUMN IF NOT EXISTS adult_count INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS children_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS infant_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS direct BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS all_providers BOOLEAN NOT NULL DEFAULT TRUE;

UPDATE public.flight_searches
SET adult_count = GREATEST(passenger_count, 1)
WHERE adult_count = 1
  AND children_count = 0
  AND infant_count = 0
  AND passenger_count > 1;

ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS supersedes_quote_id UUID REFERENCES public.quotes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS superseded_by_quote_id UUID REFERENCES public.quotes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS recovery_reason TEXT,
  ADD COLUMN IF NOT EXISTS recovery_attempted_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS quotes_one_replacement_per_quote_idx
  ON public.quotes(supersedes_quote_id)
  WHERE supersedes_quote_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS quotes_superseded_by_idx
  ON public.quotes(superseded_by_quote_id)
  WHERE superseded_by_quote_id IS NOT NULL;
