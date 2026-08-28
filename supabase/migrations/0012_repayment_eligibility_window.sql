-- Flexible-payment schedules require at least three weeks before departure.
-- Repayments finish 10 days before travel, followed by at most 3 grace days.

UPDATE public.admin_rule_configs
SET
  value = value || jsonb_build_object(
    'rule_version', 'flex_v3_2026_08',
    'minimum_days_before_departure', 21,
    'repayment_due_days_before_departure', 10,
    'generated_due_days_before_departure', 10,
    'grace_period_days', 3,
    'grace_hard_stop_days_before_departure', 7,
    'post_travel_rates', jsonb_build_object(
      'OBSERVER', 0,
      'EXPLORER', 0,
      'VOYAGER', 0,
      'NAVIGATOR', 0,
      'AMBASSADOR', 0
    )
  ),
  description = 'Trust-based flexible payment rules with a three-week eligibility window.',
  updated_at = NOW()
WHERE key = 'flex_mvp';

INSERT INTO public.admin_rule_config_versions(key, version, value, description)
SELECT
  key,
  value->>'rule_version',
  value,
  'Three-week minimum booking window, full pre-travel settlement 10 days before departure, and 3-day grace period.'
FROM public.admin_rule_configs
WHERE key = 'flex_mvp'
ON CONFLICT (key, version) DO NOTHING;
