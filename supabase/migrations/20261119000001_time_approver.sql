-- Per-employee time approver ("Godkendes af"): a user who sees and approves
-- this employee's registered time only, whatever their permission profile.
-- Typically the employee's own manager, also for managers themselves.

-- Fix: has_org_permission returned NULL (not false) without the permission,
-- so "if not has_org_permission(...)" never raised. RLS was unaffected (NULL
-- denies), but organization_members() let any member list the users.
create or replace function private.has_org_permission(org uuid, perm text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(private.permission_scope(org, perm) = 'organization', false);
$$;

alter table public.employee add column approver_user_id uuid references auth.users (id);

create function private.check_employee_approver() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.approver_user_id is distinct from (case when tg_op = 'UPDATE' then old.approver_user_id end) then
    if coalesce(current_setting('app.bootstrap', true), '') <> 'on'
       and not coalesce(private.has_org_permission(new.organization_id, 'users.manage'), false) then
      raise exception 'setting the approver requires users.manage' using errcode = '42501';
    end if;
    if new.approver_user_id is not null then
      if new.approver_user_id = new.user_id then
        raise exception 'an employee cannot approve their own time' using errcode = '23514';
      end if;
      if not exists (select 1 from public.membership m
                     where m.organization_id = new.organization_id and m.user_id = new.approver_user_id) then
        raise exception 'the approver must be a user in the organization' using errcode = '23514';
      end if;
    end if;
  end if;
  return new;
end $$;
create trigger employee_approver_check before insert or update of approver_user_id, user_id on public.employee
  for each row execute function private.check_employee_approver();

create function private.is_time_approver(emp uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.employee e
    where e.id = emp and e.approver_user_id = (select auth.uid()) and private.is_member(e.organization_id)
  );
$$;

-- Employees whose time the current user approves personally.
create function public.time_approvees(p_org uuid)
returns setof uuid language sql stable security definer set search_path = '' as $$
  select e.id from public.employee e
  where e.organization_id = p_org and e.approver_user_id = (select auth.uid())
    and e.archived_at is null and private.is_member(p_org);
$$;
grant execute on function public.time_approvees(uuid) to authenticated;

drop policy time_entry_select on public.time_entry;
create policy time_entry_select on public.time_entry for select to authenticated
  using (private.is_own_employee(employee_id)
         or private.is_time_approver(employee_id)
         or private.can_on_department('time.view', department_id)
         or private.can_on_department('time.manage', department_id)
         or private.can_on_department('time.approve', department_id));

create or replace function public.approve_time_entries(p_ids uuid[])
returns integer language plpgsql security definer set search_path = '' as $$
declare
  t record;
  n integer := 0;
  org uuid;
begin
  for t in select * from public.time_entry where id = any (p_ids) for update loop
    continue when t.status <> 'pending' or t.superseded_at is not null or t.archived_at is not null;
    if not (private.can_on_department('time.approve', t.department_id) or private.is_time_approver(t.employee_id)) then
      raise exception 'not allowed to approve' using errcode = '42501';
    end if;
    if private.is_own_employee(t.employee_id)
       and private.permission_scope(t.organization_id, 'time.approve') <> 'organization' then
      raise exception 'cannot approve own registration' using errcode = '42501';
    end if;
    perform set_config('app.time_system', 'on', true);
    update public.time_entry set status = 'approved', approved_by = (select auth.uid()), approved_at = now()
    where id = t.id;
    perform set_config('app.time_system', 'off', true);
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function public.time_overview(p_from timestamptz, p_to timestamptz)
returns table (
  row_kind text, entry_id uuid, shift_id uuid, employee_id uuid, employee_name text, employee_number text,
  department_id uuid, department_name text, start_at timestamptz, end_at timestamptz, breaks jsonb,
  project_allocations jsonb, status public.time_entry_status, source public.time_entry_source,
  deviation_reason text, note text, offline boolean, approved_at timestamptz, approved_by_email text,
  version integer, is_mine boolean, plan_start timestamptz, plan_end timestamptz, plan_breaks jsonb
)
language sql stable security definer set search_path = '' as $$
  with visible_department as (
    select d.id, d.name from public.department d
    where private.is_member(d.organization_id)
  )
  select 'entry', t.id, t.shift_id, t.employee_id, trim(e.first_name || ' ' || e.last_name), e.employee_number,
         t.department_id, vd.name, t.start_at, t.end_at, t.breaks, t.project_allocations, t.status, t.source,
         t.deviation_reason, t.note, t.offline, t.approved_at, u.email::text,
         (with recursive chain as (
            select x.id, x.supersedes_id from public.time_entry x where x.id = t.id
            union all
            select y.id, y.supersedes_id from public.time_entry y join chain c on y.id = c.supersedes_id)
          select count(*)::int from chain),
         private.is_own_employee(t.employee_id),
         (s.published ->> 'start_at')::timestamptz, (s.published ->> 'end_at')::timestamptz, s.published -> 'breaks'
  from public.time_entry t
  join visible_department vd on vd.id = t.department_id
  join public.employee e on e.id = t.employee_id
  left join public.shift s on s.id = t.shift_id
  left join auth.users u on u.id = t.approved_by
  where t.superseded_at is null and t.archived_at is null
    and t.start_at >= p_from and t.start_at < p_to
    and (private.is_own_employee(t.employee_id)
         or private.can_on_department('time.view', t.department_id)
         or private.can_on_department('time.manage', t.department_id)
         or private.can_on_department('time.approve', t.department_id)
         or private.is_time_approver(t.employee_id))
  union all
  select 'missing', null, s.id, (s.published ->> 'employee_id')::uuid, trim(e.first_name || ' ' || e.last_name),
         e.employee_number, s.department_id, vd.name, (s.published ->> 'start_at')::timestamptz,
         (s.published ->> 'end_at')::timestamptz, s.published -> 'breaks', s.published -> 'project_allocations',
         null, null, null, null, false, null, null, 0, private.is_own_employee(e.id),
         (s.published ->> 'start_at')::timestamptz, (s.published ->> 'end_at')::timestamptz, s.published -> 'breaks'
  from public.shift s
  join visible_department vd on vd.id = s.department_id
  join public.employee e on e.id = (s.published ->> 'employee_id')::uuid
  where s.published is not null and s.archived_at is null
    and (s.published ->> 'start_at')::timestamptz >= p_from and (s.published ->> 'start_at')::timestamptz < p_to
    and (s.published ->> 'end_at')::timestamptz <= now()
    and not exists (select 1 from public.time_entry t
                    where t.shift_id = s.id and t.superseded_at is null and t.archived_at is null)
    and (private.is_own_employee(e.id)
         or private.can_on_department('time.view', s.department_id)
         or private.can_on_department('time.manage', s.department_id)
         or private.can_on_department('time.approve', s.department_id)
         or private.is_time_approver(e.id))
  order by 9, 5;
$$;

create or replace function public.time_entry_history(p_id uuid)
returns table (id uuid, start_at timestamptz, end_at timestamptz, breaks jsonb, status public.time_entry_status,
               source public.time_entry_source, deviation_reason text, created_at timestamptz, created_by_email text,
               approved_at timestamptz, approved_by_email text, superseded_at timestamptz)
language sql stable security definer set search_path = '' as $$
  with recursive chain as (
    select x.* from public.time_entry x where x.id = p_id
    union all
    select y.* from public.time_entry y join chain c on y.id = c.supersedes_id
  )
  select c.id, c.start_at, c.end_at, c.breaks, c.status, c.source, c.deviation_reason, c.created_at, cu.email::text,
         c.approved_at, au.email::text, c.superseded_at
  from chain c
  left join auth.users cu on cu.id = c.created_by
  left join auth.users au on au.id = c.approved_by
  where private.is_own_employee(c.employee_id)
     or private.can_on_department('time.view', c.department_id)
     or private.can_on_department('time.manage', c.department_id)
     or private.can_on_department('time.approve', c.department_id)
     or private.is_time_approver(c.employee_id)
  order by c.created_at desc;
$$;

revoke execute on function public.time_approvees(uuid) from public, anon;
