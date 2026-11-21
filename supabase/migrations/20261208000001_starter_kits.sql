-- Startpakker: a platform administrator creating a customer can choose a kit
-- for the customer's agreement (e.g. Industriens Overenskomst). The kit makes
-- the agreement the default for new contracts and adds the pay period groups
-- and supplement types that come with it. The agreement itself is a locked
-- system template; the customer adds local agreements on top.
-- Kits are data (packages/agreements/*/startpakke.json → seeds/agreements.sql).

create table public.starter_kit (
  key text primary key check (key ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  name text not null check (length(trim(name)) between 1 and 100),
  description text not null default '',
  content jsonb not null check (jsonb_typeof(content) = 'object'),
  created_at timestamptz not null default now()
);
alter table public.starter_kit enable row level security;
create policy starter_kit_select on public.starter_kit for select to authenticated
  using (private.is_platform_admin());
-- Written only by the seed (agreements.sql), like the system agreements.
create trigger starter_kit_audit after insert or update or delete on public.starter_kit
  for each row execute function private.audit_row();

-- Default agreement for new contracts (the contract form preselects it).
alter table public.organization_settings
  add column default_agreement_id uuid references public.agreement (id);

-- Only an agreement the organization can use: a system template or its own.
create function private.check_default_agreement() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.default_agreement_id is not null and not exists (
    select 1 from public.agreement a
    where a.id = new.default_agreement_id
      and (a.organization_id is null or a.organization_id = new.organization_id)
      and a.kind in ('agreement', 'base')
  ) then
    raise exception 'unknown agreement' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger organization_settings_default_agreement
  before insert or update of default_agreement_id on public.organization_settings
  for each row execute function private.check_default_agreement();

-- Creating a customer, optionally with a startpakke.
drop function public.platform_create_organization(text);
create function public.platform_create_organization(p_name text, p_starter_kit text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  org uuid;
  kit jsonb;
  g jsonb;
  s jsonb;
  amount integer;
begin
  if not private.is_platform_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_starter_kit is not null then
    select content into kit from public.starter_kit where key = p_starter_kit;
    if kit is null then raise exception 'unknown starter kit' using errcode = 'P0002'; end if;
  end if;

  insert into public.organization (name) values (trim(p_name)) returning id into org;
  perform private.create_default_profiles(org);
  insert into public.pay_period_group (organization_id, name, frequency, month_start_day)
  values (org, 'Månedslønnede', 'monthly', 1);
  insert into public.organization_settings (organization_id) values (org) on conflict do nothing;
  if kit is null then return org; end if;

  update public.organization_settings set default_agreement_id = (
    select a.id from public.agreement a
    where a.organization_id is null and a.key = kit ->> 'agreement')
  where organization_id = org;

  for g in select * from jsonb_array_elements(coalesce(kit -> 'pay_period_groups', '[]')) loop
    insert into public.pay_period_group (organization_id, name, frequency, anchor_date)
    values (org, g ->> 'name', (g ->> 'frequency')::public.pay_frequency, (g ->> 'anchor_date')::date);
  end loop;

  -- Each supplement type with the amount in force today (the latest rate date
  -- that has passed, else the first). Later rate changes are entered by the customer.
  for s in select * from jsonb_array_elements(coalesce(kit -> 'supplement_types', '[]')) loop
    select coalesce(
      (select (a ->> 'amount')::integer from jsonb_array_elements(s -> 'amounts') a
       where (a ->> 'valid_from')::date <= current_date
       order by (a ->> 'valid_from')::date desc limit 1),
      (select (a ->> 'amount')::integer from jsonb_array_elements(s -> 'amounts') a
       order by (a ->> 'valid_from')::date limit 1))
    into amount;
    insert into public.supplement_type (organization_id, name, pay_code, amount_type, amount)
    values (org, s ->> 'name', s ->> 'pay_code', (s ->> 'amount_type')::public.supplement_amount_type, amount);
  end loop;
  return org;
end $$;
revoke execute on function public.platform_create_organization(text, text) from public, anon;
grant execute on function public.platform_create_organization(text, text) to authenticated;
