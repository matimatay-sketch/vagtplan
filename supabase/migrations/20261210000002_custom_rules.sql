-- The organization's own rules (Opsætning → Regelhåndtering): remark rules that
-- apply on top of every agreement through the organization layer. Validated by
-- the app with the rules engine; written by settings.manage (existing RLS).
alter table public.organization_settings
  add column custom_rules jsonb not null default '[]'::jsonb
  check (jsonb_typeof(custom_rules) = 'array' and jsonb_array_length(custom_rules) <= 50);
