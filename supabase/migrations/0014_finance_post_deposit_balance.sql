-- Apply flexible-payment markup only to the balance left after the tier deposit.
-- The pricing formula lives in the application; this version bump ensures new
-- quotes record the revised pricing policy while retaining all existing rates.

UPDATE public.admin_rule_configs
SET
  value = jsonb_set(value, '{rule_version}', '"pricing_v5_2026_09"'::jsonb),
  description = 'September 2026 pricing with financing markup applied after deposit.',
  updated_at = NOW()
WHERE key = 'flex_mvp';

INSERT INTO public.admin_rule_config_versions(key, version, value, description)
SELECT
  key,
  value->>'rule_version',
  value,
  'Financing markup applies only to the post-deposit balance.'
FROM public.admin_rule_configs
WHERE key = 'flex_mvp'
ON CONFLICT (key, version) DO NOTHING;
