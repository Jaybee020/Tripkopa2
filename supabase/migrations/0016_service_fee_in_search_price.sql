-- Search totals now include the full-payment service fee once.
UPDATE public.admin_rule_configs
SET
  value = jsonb_set(
    jsonb_set(value, '{rule_version}', '"pricing_v7_2026_09"'::jsonb),
    '{full_service_fee_rate}', '0.025'::jsonb
  ),
  description = 'September 2026 pricing with a 2.5% service fee included in flight search totals.',
  updated_at = NOW()
WHERE key = 'flex_mvp';

INSERT INTO public.admin_rule_config_versions(key, version, value, description)
SELECT
  key,
  value->>'rule_version',
  value,
  'Flight search totals include the 2.5% service fee; full-payment quotes do not add it again.'
FROM public.admin_rule_configs
WHERE key = 'flex_mvp'
ON CONFLICT (key, version) DO NOTHING;
