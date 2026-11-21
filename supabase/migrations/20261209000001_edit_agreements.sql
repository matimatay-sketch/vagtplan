-- Editing agreements in place.
-- 1. A customer may change a published version of its own agreement directly
--    (update_published_version), as long as no closed pay period has used it.
--    New versions from a date are still the way to change rates going forward.
-- 2. A platform administrator edits the starter kits (platform_save_starter_kit).
--    An edited kit is no longer overwritten by the seed on deploy.

-- ---------------------------------------------------------------------------
-- Published versions
-- ---------------------------------------------------------------------------
create or replace function private.protect_published_version() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.status = 'published' and current_user not in ('postgres', 'supabase_admin')
     and coalesce(current_setting('app.bootstrap', true), '') <> 'on'
     and coalesce(current_setting('app.agreement_edit', true), '') <> 'on' then
    raise exception 'a published version cannot be changed; make a new version' using errcode = '42501';
  end if;
  return new;
end $$;

-- Whether a closed pay period has used the version: a contract on the agreement
-- (directly, as local agreement, or through a local agreement built on it) in
-- a closed period that overlaps both the contract and the version.
create function private.version_in_closed_period(p_version uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.agreement_version v
    join public.agreement a on a.id = v.agreement_id
    join public.contract c on c.organization_id = a.organization_id
    join public.pay_period p on p.group_id = c.pay_period_group_id and p.status = 'closed'
    where v.id = p_version
      and (c.agreement_id = a.id or c.local_agreement_id = a.id
           or c.local_agreement_id in (
             select l.id from public.agreement l
             join public.agreement_version lv on lv.agreement_id = l.id
             where l.organization_id = a.organization_id and lv.document ->> 'inherits_from' = a.key))
      and p.start_date <= coalesce(v.valid_to, 'infinity'::date) and p.end_date >= v.valid_from
      and p.start_date <= coalesce(c.valid_to, 'infinity'::date) and p.end_date >= c.valid_from
  );
$$;

-- For the UI: can the caller change this published version directly?
create function public.agreement_version_editable(p_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.agreement_version v
    join public.agreement a on a.id = v.agreement_id
    where v.id = p_id and v.status = 'published' and a.organization_id is not null
      and a.archived_at is null
      and private.has_org_permission(a.organization_id, 'agreements.manage')
  ) and not private.version_in_closed_period(p_id);
$$;
revoke execute on function public.agreement_version_editable(uuid) from public, anon;
grant execute on function public.agreement_version_editable(uuid) to authenticated;

-- The document is validated by the app (rules engine) before it is sent. Its
-- id, version and validity always follow the row.
create function public.update_published_version(p_id uuid, p_document jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v public.agreement_version;
  a public.agreement;
begin
  select * into v from public.agreement_version where id = p_id for update;
  if v.id is null then raise exception 'not found' using errcode = 'P0002'; end if;
  select * into a from public.agreement where id = v.agreement_id;
  if a.organization_id is null or a.archived_at is not null
     or not private.has_org_permission(a.organization_id, 'agreements.manage') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v.status <> 'published' then raise exception 'not published' using errcode = '22023'; end if;
  if jsonb_typeof(p_document) <> 'object' or jsonb_typeof(p_document -> 'rules') <> 'array' then
    raise exception 'invalid document' using errcode = '22023';
  end if;
  if private.version_in_closed_period(p_id) then
    raise exception 'a closed pay period used the version' using errcode = 'P0001', hint = 'period_closed';
  end if;
  perform set_config('app.agreement_edit', 'on', true);
  update public.agreement_version set document = p_document
    || jsonb_build_object('id', a.key, 'version', v.version, 'valid_from', v.valid_from::text,
                          'valid_to', coalesce(to_jsonb(v.valid_to::text), 'null'::jsonb))
  where id = p_id;
  perform set_config('app.agreement_edit', 'off', true);
end $$;
revoke execute on function public.update_published_version(uuid, jsonb) from public, anon;
grant execute on function public.update_published_version(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Starter kits
-- ---------------------------------------------------------------------------
alter table public.starter_kit
  add column edited_at timestamptz,
  add column edited_by uuid references auth.users (id);

-- The app validates the agreement versions with the rules engine first.
create function public.platform_save_starter_kit(p_key text, p_content jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  old jsonb;
begin
  if not private.is_platform_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select content into old from public.starter_kit where key = p_key for update;
  if old is null then raise exception 'unknown starter kit' using errcode = 'P0002'; end if;
  if jsonb_typeof(p_content) <> 'object'
     or jsonb_typeof(p_content -> 'agreement' -> 'versions') <> 'array'
     or jsonb_array_length(p_content -> 'agreement' -> 'versions') = 0
     or jsonb_typeof(coalesce(p_content -> 'pay_period_groups', '[]')) <> 'array'
     or jsonb_typeof(coalesce(p_content -> 'supplement_types', '[]')) <> 'array' then
    raise exception 'invalid starter kit' using errcode = '22023';
  end if;
  if p_content -> 'agreement' ->> 'key' is distinct from old -> 'agreement' ->> 'key' then
    raise exception 'the agreement key cannot change' using errcode = '22023';
  end if;
  update public.starter_kit set content = p_content, edited_at = now(), edited_by = (select auth.uid())
  where key = p_key;
end $$;
revoke execute on function public.platform_save_starter_kit(text, jsonb) from public, anon;
grant execute on function public.platform_save_starter_kit(text, jsonb) to authenticated;
