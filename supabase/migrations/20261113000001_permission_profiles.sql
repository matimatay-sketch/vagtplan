-- Phase 1 amendment: configurable permission profiles replace fixed roles.
--
-- A profile (rettighedsprofil) is an organization-specific set of grants.
-- Each grant gives one permission with a scope:
--   'departments'  – only for departments the user is responsible for
--                    (rows in department_manager)
--   'organization' – the whole organization
-- Reading one's own employee record and contracts is always allowed.
-- One locked "owner" profile per organization holds every permission; at
-- least one member must always have it, so a customer cannot lock itself out.

create type public.permission_scope as enum ('departments', 'organization');

-- Catalog of permissions. New permissions are added by later migrations.
create table public.permission (
  key text primary key check (key ~ '^[a-z]+\.[a-z]+$'),
  allowed_scopes public.permission_scope[] not null,
  sort_order integer not null
);
insert into public.permission (key, allowed_scopes, sort_order) values
  ('employees.view',     '{departments,organization}', 10),
  ('employees.manage',   '{departments,organization}', 20),
  ('employees.invite',   '{departments,organization}', 30),
  ('contracts.view',     '{departments,organization}', 40),
  ('contracts.manage',   '{departments,organization}', 50),
  ('departments.manage', '{organization}',             60),
  ('users.manage',       '{organization}',             70),
  ('settings.manage',    '{organization}',             80),
  ('agreements.manage',  '{organization}',             90),
  ('audit.view',         '{organization}',             100);

create table public.permission_profile (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organization (id),
  name text not null check (length(trim(name)) between 1 and 100),
  description text,
  is_owner boolean not null default false,
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (organization_id, id)
);
create unique index permission_profile_name_uniq
  on public.permission_profile (organization_id, lower(name)) where archived_at is null;
create unique index permission_profile_one_owner
  on public.permission_profile (organization_id) where is_owner;

create table public.permission_grant (
  organization_id uuid not null,
  profile_id uuid not null,
  permission text not null references public.permission (key),
  scope public.permission_scope not null,
  primary key (profile_id, permission),
  foreign key (organization_id, profile_id) references public.permission_profile (organization_id, id) on delete cascade
);

alter table public.organization add column default_profile_id uuid;

-- ---------------------------------------------------------------------------
-- Default profiles
-- ---------------------------------------------------------------------------
create function private.create_default_profiles(org uuid)
returns table (owner_id uuid, manager_id uuid, employee_id uuid)
language plpgsql security definer set search_path = '' as $$
declare
  o uuid; m uuid; e uuid;
begin
  perform set_config('app.bootstrap', 'on', true);
  insert into public.permission_profile (organization_id, name, description, is_owner)
  values (org, 'Administrator', 'Fuld adgang. Kan ikke ændres, og mindst én bruger skal have den.', true)
  returning id into o;
  insert into public.permission_grant (organization_id, profile_id, permission, scope)
  select org, o, p.key, 'organization' from public.permission p;

  insert into public.permission_profile (organization_id, name, description)
  values (org, 'Leder', 'Medarbejdere og kontrakter i de afdelinger, brugeren er ansvarlig for.')
  returning id into m;
  insert into public.permission_grant (organization_id, profile_id, permission, scope) values
    (org, m, 'employees.view', 'departments'),
    (org, m, 'employees.manage', 'departments'),
    (org, m, 'employees.invite', 'departments'),
    (org, m, 'contracts.view', 'departments'),
    (org, m, 'contracts.manage', 'departments');

  insert into public.permission_profile (organization_id, name, description)
  values (org, 'Medarbejder', 'Ser egne oplysninger.')
  returning id into e;

  update public.organization set default_profile_id = e where id = org;
  perform set_config('app.bootstrap', 'off', true);
  return query select o, m, e;
end $$;

-- ---------------------------------------------------------------------------
-- Migrate memberships from role → profile
-- ---------------------------------------------------------------------------
alter table public.membership add column profile_id uuid;

do $$
declare
  r record;
  p record;
begin
  for r in select id from public.organization loop
    select * into p from private.create_default_profiles(r.id);
    update public.membership set profile_id = case role
      when 'admin' then p.owner_id when 'manager' then p.manager_id else p.employee_id end
    where organization_id = r.id;
  end loop;
end $$;

-- Policies depending on the old role helpers must go before the column.
drop policy organization_select on public.organization;
drop policy organization_update on public.organization;
drop policy membership_select on public.membership;
drop policy membership_insert on public.membership;
drop policy membership_update on public.membership;
drop policy membership_delete on public.membership;
drop policy department_select on public.department;
drop policy department_insert on public.department;
drop policy department_update on public.department;
drop policy department_manager_select on public.department_manager;
drop policy department_manager_insert on public.department_manager;
drop policy department_manager_delete on public.department_manager;
drop policy employee_select on public.employee;
drop policy employee_insert on public.employee;
drop policy employee_update on public.employee;
drop policy employee_department_select on public.employee_department;
drop policy employee_department_insert on public.employee_department;
drop policy employee_department_update on public.employee_department;
drop policy employee_department_delete on public.employee_department;
drop policy agreement_select on public.agreement;
drop policy agreement_insert on public.agreement;
drop policy agreement_update on public.agreement;
drop policy agreement_version_select on public.agreement_version;
drop policy agreement_version_insert on public.agreement_version;
drop policy agreement_version_update on public.agreement_version;
drop policy pay_period_group_select on public.pay_period_group;
drop policy pay_period_group_insert on public.pay_period_group;
drop policy pay_period_group_update on public.pay_period_group;
drop policy contract_select on public.contract;
drop policy contract_insert on public.contract;
drop policy contract_update on public.contract;
drop policy audit_log_select on public.audit_log;

drop function private.can_manage_employee(uuid);
drop function private.manages_department(uuid);
drop function private.managed_department_ids();
drop function private.is_admin(uuid);
drop function private.has_role(uuid, public.app_role[]);

alter table public.membership drop column role;
drop type public.app_role;
alter table public.membership alter column profile_id set not null;
alter table public.membership
  add constraint membership_profile_fk foreign key (organization_id, profile_id)
  references public.permission_profile (organization_id, id);
alter table public.organization
  add constraint organization_default_profile_fk foreign key (id, default_profile_id)
  references public.permission_profile (organization_id, id);

-- ---------------------------------------------------------------------------
-- Permission helpers
-- ---------------------------------------------------------------------------

-- Scope the current user has for `perm` in `org`, or null.
create function private.permission_scope(org uuid, perm text)
returns public.permission_scope language sql stable security definer set search_path = '' as $$
  select max(g.scope)
  from public.membership m
  join public.permission_grant g on g.profile_id = m.profile_id
  where m.organization_id = org and m.user_id = (select auth.uid()) and g.permission = perm;
$$;

create function private.has_org_permission(org uuid, perm text)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.permission_scope(org, perm) = 'organization';
$$;

-- Departments the current user is responsible for.
create function private.responsible_department_ids()
returns setof uuid language sql stable security definer set search_path = '' as $$
  select dm.department_id from public.department_manager dm
  join public.membership m on m.organization_id = dm.organization_id and m.user_id = dm.user_id
  where dm.user_id = (select auth.uid());
$$;

-- `perm` on a specific department.
create function private.can_on_department(perm text, dept uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.department d
    where d.id = dept and (
      private.permission_scope(d.organization_id, perm) = 'organization'
      or (private.permission_scope(d.organization_id, perm) = 'departments'
          and dept in (select private.responsible_department_ids()))
    )
  );
$$;

-- `perm` on a specific employee (org scope, or the employee is in one of the
-- user's departments).
create function private.can_on_employee(perm text, emp uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.employee e
    where e.id = emp and (
      private.permission_scope(e.organization_id, perm) = 'organization'
      or (private.permission_scope(e.organization_id, perm) = 'departments' and exists (
        select 1 from public.employee_department ed
        where ed.employee_id = emp and ed.department_id in (select private.responsible_department_ids())
      ))
    )
  );
$$;

grant execute on all functions in schema private to authenticated;

-- Grants must use a scope the permission allows; the owner profile is locked.
create function private.check_grant() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  allowed public.permission_scope[];
  owner boolean;
begin
  select is_owner into owner from public.permission_profile
  where id = coalesce(new.profile_id, old.profile_id);
  if owner and coalesce(current_setting('app.bootstrap', true), '') <> 'on'
     and (select auth.uid()) is not null then
    raise exception 'the owner profile cannot be changed' using errcode = '42501';
  end if;
  if tg_op <> 'DELETE' then
    select allowed_scopes into allowed from public.permission where key = new.permission;
    if not (new.scope = any (allowed)) then
      raise exception 'scope % not allowed for %', new.scope, new.permission using errcode = '23514';
    end if;
    return new;
  end if;
  return old;
end $$;
create trigger permission_grant_check before insert or update or delete on public.permission_grant
  for each row execute function private.check_grant();

create function private.protect_owner_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.is_owner and (new.is_owner is distinct from old.is_owner or new.archived_at is not null) then
    raise exception 'the owner profile cannot be archived or demoted' using errcode = '42501';
  end if;
  if new.is_owner and not old.is_owner then
    raise exception 'is_owner cannot be set' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger permission_profile_protect before update on public.permission_profile
  for each row execute function private.protect_owner_profile();

-- At least one member must keep the owner profile.
create function private.ensure_owner_remains() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  org uuid := old.organization_id;
begin
  if not exists (
    select 1 from public.membership m
    join public.permission_profile p on p.id = m.profile_id
    where m.organization_id = org and p.is_owner
  ) and exists (select 1 from public.organization where id = org) then
    raise exception 'the organization must have at least one administrator' using errcode = '42501';
  end if;
  return null;
end $$;
create trigger membership_owner_remains after update or delete on public.membership
  for each row execute function private.ensure_owner_remains();

-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------
alter table public.permission enable row level security;
alter table public.permission_profile enable row level security;
alter table public.permission_grant enable row level security;

create policy permission_select on public.permission for select to authenticated using (true);

create policy permission_profile_select on public.permission_profile for select to authenticated
  using (private.is_member(organization_id));
create policy permission_profile_insert on public.permission_profile for insert to authenticated
  with check (private.has_org_permission(organization_id, 'users.manage') and not is_owner);
create policy permission_profile_update on public.permission_profile for update to authenticated
  using (private.has_org_permission(organization_id, 'users.manage'))
  with check (private.has_org_permission(organization_id, 'users.manage'));

create policy permission_grant_select on public.permission_grant for select to authenticated
  using (private.is_member(organization_id));
create policy permission_grant_insert on public.permission_grant for insert to authenticated
  with check (private.has_org_permission(organization_id, 'users.manage'));
create policy permission_grant_update on public.permission_grant for update to authenticated
  using (private.has_org_permission(organization_id, 'users.manage'))
  with check (private.has_org_permission(organization_id, 'users.manage'));
create policy permission_grant_delete on public.permission_grant for delete to authenticated
  using (private.has_org_permission(organization_id, 'users.manage'));

create policy organization_select on public.organization for select to authenticated
  using (private.is_member(id));
create policy organization_update on public.organization for update to authenticated
  using (private.has_org_permission(id, 'settings.manage'))
  with check (private.has_org_permission(id, 'settings.manage'));

create policy membership_select on public.membership for select to authenticated
  using (user_id = (select auth.uid())
         or private.has_org_permission(organization_id, 'users.manage')
         or private.permission_scope(organization_id, 'employees.view') is not null);
create policy membership_insert on public.membership for insert to authenticated
  with check (private.has_org_permission(organization_id, 'users.manage'));
create policy membership_update on public.membership for update to authenticated
  using (private.has_org_permission(organization_id, 'users.manage'))
  with check (private.has_org_permission(organization_id, 'users.manage'));
create policy membership_delete on public.membership for delete to authenticated
  using (private.has_org_permission(organization_id, 'users.manage') and user_id <> (select auth.uid()));

create policy department_select on public.department for select to authenticated
  using (private.is_member(organization_id));
create policy department_insert on public.department for insert to authenticated
  with check (private.has_org_permission(organization_id, 'departments.manage'));
create policy department_update on public.department for update to authenticated
  using (private.has_org_permission(organization_id, 'departments.manage'))
  with check (private.has_org_permission(organization_id, 'departments.manage'));

create policy department_manager_select on public.department_manager for select to authenticated
  using (private.is_member(organization_id));
create policy department_manager_insert on public.department_manager for insert to authenticated
  with check (private.has_org_permission(organization_id, 'users.manage'));
create policy department_manager_delete on public.department_manager for delete to authenticated
  using (private.has_org_permission(organization_id, 'users.manage'));

create policy employee_select on public.employee for select to authenticated
  using (user_id = (select auth.uid())
         or private.can_on_employee('employees.view', id)
         or private.can_on_employee('employees.manage', id));
create policy employee_insert on public.employee for insert to authenticated
  with check (private.has_org_permission(organization_id, 'employees.manage'));
create policy employee_update on public.employee for update to authenticated
  using (private.can_on_employee('employees.manage', id))
  with check (private.can_on_employee('employees.manage', id));

create policy employee_department_select on public.employee_department for select to authenticated
  using (private.is_self(employee_id)
         or private.can_on_employee('employees.view', employee_id)
         or private.can_on_employee('employees.manage', employee_id));
create policy employee_department_insert on public.employee_department for insert to authenticated
  with check (private.can_on_department('employees.manage', department_id)
              and private.can_on_employee('employees.manage', employee_id));
create policy employee_department_update on public.employee_department for update to authenticated
  using (private.can_on_department('employees.manage', department_id))
  with check (private.can_on_department('employees.manage', department_id));
create policy employee_department_delete on public.employee_department for delete to authenticated
  using (private.can_on_department('employees.manage', department_id));

create policy agreement_select on public.agreement for select to authenticated
  using (organization_id is null or private.is_member(organization_id));
create policy agreement_insert on public.agreement for insert to authenticated
  with check (organization_id is not null and private.has_org_permission(organization_id, 'agreements.manage'));
create policy agreement_update on public.agreement for update to authenticated
  using (organization_id is not null and private.has_org_permission(organization_id, 'agreements.manage'))
  with check (organization_id is not null and private.has_org_permission(organization_id, 'agreements.manage'));

create policy agreement_version_select on public.agreement_version for select to authenticated
  using (exists (select 1 from public.agreement a where a.id = agreement_id
    and (a.organization_id is null or private.is_member(a.organization_id))));
create policy agreement_version_insert on public.agreement_version for insert to authenticated
  with check (exists (select 1 from public.agreement a where a.id = agreement_id
    and a.organization_id is not null and private.has_org_permission(a.organization_id, 'agreements.manage')));
create policy agreement_version_update on public.agreement_version for update to authenticated
  using (status = 'draft' and exists (select 1 from public.agreement a where a.id = agreement_id
    and a.organization_id is not null and private.has_org_permission(a.organization_id, 'agreements.manage')))
  with check (exists (select 1 from public.agreement a where a.id = agreement_id
    and a.organization_id is not null and private.has_org_permission(a.organization_id, 'agreements.manage')));

create policy pay_period_group_select on public.pay_period_group for select to authenticated
  using (private.is_member(organization_id));
create policy pay_period_group_insert on public.pay_period_group for insert to authenticated
  with check (private.has_org_permission(organization_id, 'settings.manage'));
create policy pay_period_group_update on public.pay_period_group for update to authenticated
  using (private.has_org_permission(organization_id, 'settings.manage'))
  with check (private.has_org_permission(organization_id, 'settings.manage'));

create policy contract_select on public.contract for select to authenticated
  using (private.is_self(employee_id)
         or private.can_on_employee('contracts.view', employee_id)
         or private.can_on_employee('contracts.manage', employee_id));
create policy contract_insert on public.contract for insert to authenticated
  with check (private.can_on_employee('contracts.manage', employee_id));
create policy contract_update on public.contract for update to authenticated
  using (private.can_on_employee('contracts.manage', employee_id))
  with check (private.can_on_employee('contracts.manage', employee_id));

create policy audit_log_select on public.audit_log for select to authenticated
  using (organization_id is not null and private.has_org_permission(organization_id, 'audit.view'));

-- Audit the new tables too.
create trigger permission_profile_audit after insert or update or delete on public.permission_profile
  for each row execute function private.audit_row();
create trigger permission_grant_audit after insert or update or delete on public.permission_grant
  for each row execute function private.audit_row();
create trigger permission_profile_org_immutable before update on public.permission_profile
  for each row execute function private.forbid_org_change();

-- ---------------------------------------------------------------------------
-- RPCs updated for profiles
-- ---------------------------------------------------------------------------
create or replace function public.create_organization(org_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  org uuid;
  p record;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  insert into public.organization (name) values (trim(org_name)) returning id into org;
  select * into p from private.create_default_profiles(org);
  insert into public.membership (organization_id, user_id, profile_id) values (org, uid, p.owner_id);
  insert into public.pay_period_group (organization_id, name, frequency, month_start_day)
  values (org, 'Månedslønnede', 'monthly', 1);
  return org;
end $$;

create or replace function public.create_employee(
  p_department_id uuid,
  p_employee_number text,
  p_first_name text,
  p_last_name text,
  p_birth_date date,
  p_email text default null,
  p_phone text default null,
  p_school_obligated boolean default false,
  p_school_obligation_ends_on date default null,
  p_hired_on date default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  org uuid;
  emp uuid;
begin
  select organization_id into org from public.department
  where id = p_department_id and archived_at is null;
  if org is null then
    raise exception 'department not found' using errcode = 'P0002';
  end if;
  if not private.can_on_department('employees.manage', p_department_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  insert into public.employee (
    organization_id, employee_number, first_name, last_name, birth_date, email, phone,
    school_obligated, school_obligation_ends_on, hired_on
  ) values (
    org, trim(p_employee_number), trim(p_first_name), trim(p_last_name), p_birth_date,
    nullif(trim(p_email), ''), nullif(trim(p_phone), ''),
    p_school_obligated, p_school_obligation_ends_on, p_hired_on
  ) returning id into emp;
  insert into public.employee_department (organization_id, employee_id, department_id, is_primary)
  values (org, emp, p_department_id, true);
  return emp;
end $$;

-- Permissions of the current user in an organization, for the UI.
create function public.my_permissions(org uuid)
returns table (permission text, scope public.permission_scope)
language sql stable security definer set search_path = '' as $$
  select g.permission, max(g.scope)
  from public.membership m
  join public.permission_grant g on g.profile_id = m.profile_id
  where m.organization_id = org and m.user_id = (select auth.uid())
  group by g.permission;
$$;
grant execute on function public.my_permissions(uuid) to authenticated;

-- Lets the app ask "may I do X to this employee?" before privileged work
-- (e.g. sending an invitation through the service client).
create function public.can_on_employee(perm text, emp uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.can_on_employee(perm, emp);
$$;
grant execute on function public.can_on_employee(text, uuid) to authenticated;

-- Members of an organization with e-mail (auth.users is not exposed).
-- Requires users.manage.
create function public.organization_members(org uuid)
returns table (user_id uuid, email text, profile_id uuid, employee_id uuid, first_name text, last_name text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.has_org_permission(org, 'users.manage') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
    select m.user_id, u.email::text, m.profile_id, e.id, e.first_name, e.last_name
    from public.membership m
    join auth.users u on u.id = m.user_id
    left join public.employee e on e.organization_id = m.organization_id and e.user_id = m.user_id
    where m.organization_id = org
    order by coalesce(e.first_name, u.email);
end $$;
revoke execute on function public.organization_members(uuid) from public, anon;
grant execute on function public.organization_members(uuid) to authenticated;

-- Atomically replace a profile's grants. SECURITY INVOKER: the caller's RLS
-- (users.manage) and the grant triggers still apply.
create function public.set_profile_grants(p_profile_id uuid, p_grants jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  org uuid;
begin
  select organization_id into org from public.permission_profile where id = p_profile_id;
  if org is null then
    raise exception 'profile not found' using errcode = 'P0002';
  end if;
  delete from public.permission_grant where profile_id = p_profile_id;
  insert into public.permission_grant (organization_id, profile_id, permission, scope)
  select org, p_profile_id, g.key, g.value::public.permission_scope
  from jsonb_each_text(p_grants) g;
end $$;
grant execute on function public.set_profile_grants(uuid, jsonb) to authenticated;
