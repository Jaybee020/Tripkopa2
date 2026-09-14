-- Version quotes created from consistently normalized customer-facing search
-- prices. Pricing rates themselves are unchanged.

UPDATE public.admin_rule_configs
SET
  value = jsonb_set(value, '{rule_version}', '"pricing_v6_2026_09"'::jsonb),
  description = 'September 2026 pricing with consistent customer-facing search prices.',
  updated_at = NOW()
WHERE key = 'flex_mvp';

INSERT INTO public.admin_rule_config_versions(key, version, value, description)
SELECT
  key,
  value->>'rule_version',
  value,
  'Customer-facing search prices consistently include the provider price addition.'
FROM public.admin_rule_configs
WHERE key = 'flex_mvp'
ON CONFLICT (key, version) DO NOTHING;
