-- Dashboard: a bulletin board per department, birthdays and work anniversaries.
--
-- bulletin_post: department_id null = the whole organization. Members read
-- posts for the organization and for the departments they belong to or have
-- schedule.view in. bulletin.manage (departments/organization) writes them.
-- celebrations(): birthdays (day and month only, no age) and whole years of
-- employment of colleagues in the same departments. Employees can opt out.

insert into public.permission (key, allowed_scopes, sort_order) values
  ('bulletin.manage', '{departments,organization}', 290);
insert into public.permission_grant (organization_id, profile_id, permission, scope)
select p.organization_id, p.id, 'bulletin.manage',
       case when p.is_owner then 'organization'::public.permission_scope else 'departments'::public.permission_scope end
from public.permission_profile p where p.is_owner or p.name = 'Leder'
on conflict do nothing;

create or replace function private.create_default_profiles(org uuid)
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
  values (org, 'Leder', 'Medarbejdere, kontrakter, vagtplan, tid, fravær, lønlinjer, projekttimer og opslagstavlen i de afdelinger, brugeren er ansvarlig for.')
  returning id into m;
  insert into public.permission_grant (organization_id, profile_id, permission, scope)
  select org, m, k, 'departments' from unnest(array[
    'employees.view', 'employees.manage', 'employees.invite', 'contracts.view', 'contracts.manage',
    'schedule.view', 'schedule.manage', 'schedule.publish', 'schedule.override', 'projects.view',
    'time.view', 'time.manage', 'time.approve', 'absence.view', 'absence.manage', 'absence.approve',
    'payroll.view', 'bulletin.manage'
  ]) as k;

  insert into public.permission_profile (organization_id, name, description)
  values (org, 'Medarbejder', 'Ser egne oplysninger og den offentliggjorte vagtplan for egne afdelinger. Registrerer egen tid og søger fravær.')
  returning id into e;

  update public.organization set default_profile_id = e where id = org;
  perform set_config('app.bootstrap', 'off', true);
  return query select o, m, e;
end $$;

create table public.bulletin_post (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organization (id),
  department_id uuid,
  title text not null check (length(trim(title)) between 1 and 120),
  body text not null default '' check (length(body) <= 4000),
  pinned boolean not null default false,
  expires_on date,
  created_by uuid default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (organization_id, id),
  foreign key (organization_id, department_id) references public.department (organization_id, id)
);
create index bulletin_post_org_idx on public.bulletin_post (organization_id, created_at desc);

-- Is the user an employee in the department?
create function private.in_department(dept uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.employee_department ed
                 join public.employee e on e.id = ed.employee_id
                 where ed.department_id = dept and e.user_id = (select auth.uid()) and e.archived_at is null);
$$;

create function private.can_post(org uuid, dept uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select case when dept is null then private.has_org_permission(org, 'bulletin.manage')
              else private.can_on_department('bulletin.manage', dept) end;
$$;

alter table public.bulletin_post enable row level security;
create policy bulletin_post_select on public.bulletin_post for select to authenticated
  using (private.is_member(organization_id)
         and (department_id is null or private.in_department(department_id)
              or private.can_on_department('schedule.view', department_id)
              or private.can_post(organization_id, department_id)));
create policy bulletin_post_insert on public.bulletin_post for insert to authenticated
  with check (private.can_post(organization_id, department_id) and archived_at is null);
create policy bulletin_post_update on public.bulletin_post for update to authenticated
  using (private.can_post(organization_id, department_id))
  with check (private.can_post(organization_id, department_id));

create trigger bulletin_post_audit after insert or update or delete on public.bulletin_post
  for each row execute function private.audit_row();
create trigger bulletin_post_org_immutable before update on public.bulletin_post
  for each row execute function private.forbid_org_change();

-- Opt-out of being shown with birthday and anniversary.
alter table public.employee add column show_celebrations boolean not null default true;

create function public.set_show_celebrations(p_show boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.employee set show_celebrations = p_show
  where user_id = (select auth.uid()) and archived_at is null;
end $$;
revoke execute on function public.set_show_celebrations(boolean) from public, anon;
grant execute on function public.set_show_celebrations(boolean) to authenticated;

-- Birthdays and anniversaries from p_from and p_days ahead, for colleagues in
-- the user's departments (or departments the user has employees.view in).
create function public.celebrations(p_org uuid, p_from date, p_days integer default 14)
returns table (employee_id uuid, name text, department_name text, kind text, on_date date, years integer)
language sql stable security definer set search_path = '' as $$
  with visible as (
    select distinct e.id, trim(e.first_name || ' ' || e.last_name) as name, e.birth_date, e.hired_on,
           (select d.name from public.employee_department ed2
            join public.department d on d.id = ed2.department_id
            where ed2.employee_id = e.id order by ed2.is_primary desc limit 1) as department_name
    from public.employee e
    join public.employee_department ed on ed.employee_id = e.id
    where e.organization_id = p_org and e.archived_at is null and e.show_celebrations
      and private.is_member(p_org)
      and (private.in_department(ed.department_id)
           or private.can_on_department('employees.view', ed.department_id))
  ),
  days as (
    select (p_from + i)::date as d from generate_series(0, least(greatest(p_days, 0), 60)) i
  )
  select v.id, v.name, v.department_name, 'birthday', days.d, null::integer
  from visible v join days
    on extract(month from v.birth_date) = extract(month from days.d)
   and (extract(day from v.birth_date) = extract(day from days.d)
        -- 29 February is celebrated on 28 February in other years.
        or (extract(month from v.birth_date) = 2 and extract(day from v.birth_date) = 29
            and extract(day from days.d) = 28
            and not (extract(year from days.d)::int % 4 = 0
                     and (extract(year from days.d)::int % 100 <> 0 or extract(year from days.d)::int % 400 = 0))))
  union all
  select v.id, v.name, v.department_name, 'anniversary', days.d,
         (extract(year from days.d) - extract(year from v.hired_on))::integer
  from visible v join days
    on v.hired_on is not null
   and extract(month from v.hired_on) = extract(month from days.d)
   and extract(day from v.hired_on) = extract(day from days.d)
   and extract(year from days.d) > extract(year from v.hired_on)
  order by 5, 2;
$$;
revoke execute on function public.celebrations(uuid, date, integer) from public, anon;
grant execute on function public.celebrations(uuid, date, integer) to authenticated;
