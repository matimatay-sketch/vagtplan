-- Startpakker: a platform administrator can give a customer a kit for its
-- agreement (e.g. Industriens Overenskomst), when creating the customer or
-- later. The kit copies the agreement (all versions) into the customer's base
-- as the customer's own agreement, which the customer can change (new versions)
-- and delete like any other. It also makes the agreement the default for new
-- contracts and adds the pay period groups and supplement types that come with it.
-- Kits are data (packages/agreements/*/startpakke.json → seeds/agreements.sql).
-- Agreements can now be deleted (archived; history and pay calculations keep them).

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

-- ---------------------------------------------------------------------------
-- Deleting agreements
-- ---------------------------------------------------------------------------
alter table public.agreement add column archived_at timestamptz;

-- archived_at is set only by archive_agreement (which checks that nothing uses it).
-- Not security definer: current_user must be the caller.
create function private.agreement_archive_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.archived_at is distinct from old.archived_at
     and coalesce(current_setting('app.agreement_archive', true), '') <> 'on'
     and current_user not in ('postgres', 'supabase_admin') then
    raise exception 'agreements are deleted with archive_agreement' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger agreement_archive_guard before update on public.agreement
  for each row execute function private.agreement_archive_guard();

create function public.archive_agreement(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  a public.agreement;
begin
  select * into a from public.agreement where id = p_id and archived_at is null for update;
  if a.id is null then raise exception 'not found' using errcode = 'P0002'; end if;
  if a.organization_id is null or not private.has_org_permission(a.organization_id, 'agreements.manage') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if exists (select 1 from public.contract c
             where (c.agreement_id = p_id or c.local_agreement_id = p_id)
               and (c.valid_to is null or c.valid_to >= current_date)) then
    raise exception 'contracts use the agreement' using errcode = 'P0001', hint = 'agreement_in_use';
  end if;
  -- Local agreements built on it must go first.
  if exists (select 1 from public.agreement l
             join public.agreement_version v on v.agreement_id = l.id
             where l.organization_id = a.organization_id and l.archived_at is null and l.id <> a.id
               and v.document ->> 'inherits_from' = a.key) then
    raise exception 'local agreements build on it' using errcode = 'P0001', hint = 'agreement_has_locals';
  end if;
  perform set_config('app.agreement_archive', 'on', true);
  update public.agreement set archived_at = now() where id = p_id;
  perform set_config('app.agreement_archive', 'off', true);
  update public.organization_settings set default_agreement_id = null
  where organization_id = a.organization_id and default_agreement_id = p_id;
end $$;
revoke execute on function public.archive_agreement(uuid) from public, anon;
grant execute on function public.archive_agreement(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Default agreement for new contracts (the contract form preselects it)
-- ---------------------------------------------------------------------------
alter table public.organization_settings
  add column default_agreement_id uuid references public.agreement (id);

-- Only an agreement the organization can use: a system template or its own.
create function private.check_default_agreement() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.default_agreement_id is not null and not exists (
    select 1 from public.agreement a
    where a.id = new.default_agreement_id and a.archived_at is null
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

-- ---------------------------------------------------------------------------
-- Applying a kit
-- ---------------------------------------------------------------------------
create function private.apply_starter_kit(org uuid, p_key text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  kit jsonb;
  ag jsonb;
  agreement_id uuid;
  doc jsonb;
  g jsonb;
  s jsonb;
  amount integer;
begin
  select content into kit from public.starter_kit where key = p_key;
  if kit is null then raise exception 'unknown starter kit' using errcode = 'P0002'; end if;
  ag := kit -> 'agreement';
  if exists (select 1 from public.agreement where organization_id = org and key = ag ->> 'key') then
    raise exception 'the customer already has the agreement' using errcode = 'P0001', hint = 'kit_applied';
  end if;

  -- The agreement as the customer's own, with all versions published.
  insert into public.agreement (organization_id, key, name, kind, description)
  values (org, ag ->> 'key', ag ->> 'name', (ag ->> 'kind')::public.agreement_kind,
          ag -> 'versions' -> 0 ->> 'description')
  returning id into agreement_id;
  for doc in select * from jsonb_array_elements(ag -> 'versions') loop
    insert into public.agreement_version (agreement_id, version, valid_from, valid_to, status, document, published_at)
    values (agreement_id, (doc ->> 'version')::integer, (doc ->> 'valid_from')::date,
            nullif(doc ->> 'valid_to', '')::date, 'published', doc, now());
  end loop;

  insert into public.organization_settings (organization_id) values (org) on conflict do nothing;
  update public.organization_settings set default_agreement_id = agreement_id where organization_id = org;

  for g in select * from jsonb_array_elements(coalesce(kit -> 'pay_period_groups', '[]')) loop
    -- Groups and supplement types the customer already has (same name) are kept.
    continue when exists (select 1 from public.pay_period_group p where p.organization_id = org
                          and p.archived_at is null and lower(p.name) = lower(g ->> 'name'));
    insert into public.pay_period_group (organization_id, name, frequency, anchor_date)
    values (org, g ->> 'name', (g ->> 'frequency')::public.pay_frequency, (g ->> 'anchor_date')::date);
  end loop;

  -- Each supplement type with the amount in force today (the latest rate date
  -- that has passed, else the first). Later rate changes are entered by the customer.
  for s in select * from jsonb_array_elements(coalesce(kit -> 'supplement_types', '[]')) loop
    continue when exists (select 1 from public.supplement_type t where t.organization_id = org
                          and t.archived_at is null and lower(t.name) = lower(s ->> 'name'));
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
end $$;

drop function public.platform_create_organization(text);
create function public.platform_create_organization(p_name text, p_starter_kit text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  org uuid;
begin
  if not private.is_platform_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  insert into public.organization (name) values (trim(p_name)) returning id into org;
  perform private.create_default_profiles(org);
  insert into public.pay_period_group (organization_id, name, frequency, month_start_day)
  values (org, 'Månedslønnede', 'monthly', 1);
  insert into public.organization_settings (organization_id) values (org) on conflict do nothing;
  if p_starter_kit is not null then perform private.apply_starter_kit(org, p_starter_kit); end if;
  return org;
end $$;
revoke execute on function public.platform_create_organization(text, text) from public, anon;
grant execute on function public.platform_create_organization(text, text) to authenticated;

-- A kit for an existing customer.
create function public.platform_apply_starter_kit(p_org uuid, p_starter_kit text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_platform_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if not exists (select 1 from public.organization where id = p_org) then
    raise exception 'organization not found' using errcode = 'P0002';
  end if;
  perform private.apply_starter_kit(p_org, p_starter_kit);
end $$;
revoke execute on function public.platform_apply_starter_kit(uuid, text) from public, anon;
grant execute on function public.platform_apply_starter_kit(uuid, text) to authenticated;
