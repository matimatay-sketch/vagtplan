-- Platform operation: customers (organizations) are created by platform
-- administrators, not by self-service sign-up. The person configuring a
-- customer is invited as administrator (owner profile) of that organization.
--
-- platform_admin is platform-level (no organization_id). Rows are managed
-- with SQL by the operator; there is no UI for them.

create table public.platform_admin (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.platform_admin enable row level security;
create policy platform_admin_select_own on public.platform_admin for select to authenticated
  using (user_id = (select auth.uid()));

create function private.is_platform_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.platform_admin where user_id = (select auth.uid()));
$$;

create function public.is_platform_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_platform_admin();
$$;
grant execute on function public.is_platform_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- Archived (suspended) customers: members lose access.
alter table public.organization add column archived_at timestamptz;

create or replace function private.is_member(org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.membership m
    join public.organization o on o.id = m.organization_id
    where m.organization_id = org and m.user_id = (select auth.uid()) and o.archived_at is null
  );
$$;

create or replace function private.permission_scope(org uuid, perm text)
returns public.permission_scope language sql stable security definer set search_path = '' as $$
  select max(g.scope)
  from public.membership m
  join public.organization o on o.id = m.organization_id and o.archived_at is null
  join public.permission_grant g on g.profile_id = m.profile_id
  where m.organization_id = org and m.user_id = (select auth.uid()) and g.permission = perm;
$$;

create or replace function public.my_permissions(org uuid)
returns table (permission text, scope public.permission_scope)
language sql stable security definer set search_path = '' as $$
  select g.permission, max(g.scope)
  from public.membership m
  join public.organization o on o.id = m.organization_id and o.archived_at is null
  join public.permission_grant g on g.profile_id = m.profile_id
  where m.organization_id = org and m.user_id = (select auth.uid())
  group by g.permission;
$$;

-- Only the platform may archive a customer.
create function private.protect_organization_archive() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.archived_at is distinct from old.archived_at
     and coalesce(current_setting('app.platform', true), '') <> 'on' then
    raise exception 'only the platform can archive an organization' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger organization_archive_guard before update on public.organization
  for each row execute function private.protect_organization_archive();

-- No more self-service organizations.
drop function public.create_organization(text);

-- ---------------------------------------------------------------------------
-- Platform RPCs (platform administrators only).

create function public.platform_organizations()
returns table (id uuid, name text, created_at timestamptz, archived_at timestamptz,
               member_count bigint, employee_count bigint, owner_emails text[])
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_platform_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
    select o.id, o.name, o.created_at, o.archived_at,
      (select count(*) from public.membership m where m.organization_id = o.id),
      (select count(*) from public.employee e where e.organization_id = o.id and e.archived_at is null),
      coalesce((select array_agg(u.email::text order by u.email)
                from public.membership m
                join public.permission_profile p on p.id = m.profile_id and p.is_owner
                join auth.users u on u.id = m.user_id
                where m.organization_id = o.id), '{}')
    from public.organization o
    order by o.archived_at nulls first, o.name;
end $$;
grant execute on function public.platform_organizations() to authenticated;

create function public.platform_create_organization(p_name text)
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
  return org;
end $$;
grant execute on function public.platform_create_organization(text) to authenticated;

-- The user id for an e-mail (auth.users is not exposed), or null.
create function public.platform_user_id(p_email text)
returns uuid language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_platform_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return (select id from auth.users where lower(email) = lower(trim(p_email)) limit 1);
end $$;
grant execute on function public.platform_user_id(text) to authenticated;

-- Makes a user administrator (owner profile) of a customer.
create function public.platform_add_owner(p_org uuid, p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  owner uuid;
begin
  if not private.is_platform_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select id into owner from public.permission_profile where organization_id = p_org and is_owner;
  if owner is null then raise exception 'organization not found' using errcode = 'P0002'; end if;
  insert into public.membership (organization_id, user_id, profile_id) values (p_org, p_user, owner)
  on conflict (organization_id, user_id) do update set profile_id = excluded.profile_id;
end $$;
grant execute on function public.platform_add_owner(uuid, uuid) to authenticated;

create function public.platform_set_archived(p_org uuid, p_archived boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_platform_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  perform set_config('app.platform', 'on', true);
  update public.organization set archived_at = case when p_archived then coalesce(archived_at, now()) end
  where id = p_org;
  perform set_config('app.platform', 'off', true);
end $$;
grant execute on function public.platform_set_archived(uuid, boolean) to authenticated;

revoke execute on function public.platform_organizations(), public.platform_create_organization(text),
  public.platform_user_id(text), public.platform_add_owner(uuid, uuid),
  public.platform_set_archived(uuid, boolean), public.is_platform_admin() from public, anon;
