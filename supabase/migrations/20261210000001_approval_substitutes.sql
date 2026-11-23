-- Substitute approvers (stedfortrædere): while a manager is away, another user
-- approves what the manager approves, for a period of dates.
--
-- During the period (dates in the organization's time zone) the substitute is
-- a time approver for the absent user's employees: those the absent user
-- approves personally ("Godkendes af") and the employees of the departments the
-- absent user is responsible for, when the absent user has time.approve there
-- (all employees with organization scope). private.is_time_approver is used for
-- time, absence and expense approvals, so the substitute approves all three.
--
-- Created by users.manage, or by the absent user themself (with time.approve).
-- Rows are never deleted: archived_at ends a substitution early or undoes it.

create table public.approval_substitute (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organization (id),
  absent_user_id uuid not null references auth.users (id),
  substitute_user_id uuid not null references auth.users (id),
  valid_from date not null,
  valid_to date not null,
  note text not null default '' check (length(note) <= 500),
  created_by uuid default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  check (valid_to >= valid_from),
  check (absent_user_id <> substitute_user_id)
);
create index approval_substitute_substitute_idx
  on public.approval_substitute (substitute_user_id, valid_from, valid_to) where archived_at is null;
create index approval_substitute_org_idx on public.approval_substitute (organization_id, valid_from);

create trigger approval_substitute_audit after insert or update or delete on public.approval_substitute
  for each row execute function private.audit_row();

-- Scope a given user (not necessarily the caller) has for `perm` in `org`.
create function private.user_permission_scope(org uuid, perm text, uid uuid)
returns public.permission_scope language sql stable security definer set search_path = '' as $$
  select max(g.scope)
  from public.membership m
  join public.organization o on o.id = m.organization_id and o.archived_at is null
  join public.permission_grant g on g.profile_id = m.profile_id
  where m.organization_id = org and m.user_id = uid and g.permission = perm;
$$;

-- May the caller manage substitutions for `absent` in `org`?
create function private.can_manage_substitute(org uuid, absent uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.has_org_permission(org, 'users.manage')
      or (absent = (select auth.uid()) and private.permission_scope(org, 'time.approve') is not null);
$$;

alter table public.approval_substitute enable row level security;
create policy approval_substitute_select on public.approval_substitute for select to authenticated
  using (private.is_member(organization_id)
         and (absent_user_id = (select auth.uid()) or substitute_user_id = (select auth.uid())
              or private.has_org_permission(organization_id, 'users.manage')));
-- Writes go through save_approval_substitute / end_approval_substitute.

-- Does `uid` approve the employee's time (personally, or by department / organization)?
create function private.user_approves_employee(uid uuid, emp uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.employee e
    where e.id = emp and (
      e.approver_user_id = uid
      or private.user_permission_scope(e.organization_id, 'time.approve', uid) = 'organization'
      or (private.user_permission_scope(e.organization_id, 'time.approve', uid) = 'departments'
          and exists (
            select 1 from public.employee_department ed
            join public.department_manager dm on dm.department_id = ed.department_id and dm.user_id = uid
            where ed.employee_id = emp))
    )
  );
$$;

-- Is the caller today a substitute for someone who approves the employee?
create function private.is_substitute_approver(emp uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.employee e
    join public.organization o on o.id = e.organization_id
    join public.approval_substitute s
      on s.organization_id = e.organization_id and s.archived_at is null
     and s.substitute_user_id = (select auth.uid())
     and (now() at time zone o.timezone)::date between s.valid_from and s.valid_to
    where e.id = emp and private.is_member(e.organization_id)
      and private.user_approves_employee(s.absent_user_id, emp)
  );
$$;

create or replace function private.is_time_approver(emp uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.employee e
    where e.id = emp and e.approver_user_id = (select auth.uid()) and private.is_member(e.organization_id)
  ) or private.is_substitute_approver(emp);
$$;

-- Employees whose time the current user approves personally or as a substitute.
create or replace function public.time_approvees(p_org uuid)
returns setof uuid language sql stable security definer set search_path = '' as $$
  select e.id from public.employee e
  where e.organization_id = p_org and e.archived_at is null and private.is_member(p_org)
    and (e.approver_user_id = (select auth.uid()) or private.is_substitute_approver(e.id));
$$;

-- Creates (p_id null) or changes a substitution.
create function public.save_approval_substitute(
  p_org uuid, p_id uuid, p_absent uuid, p_substitute uuid, p_from date, p_to date, p_note text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  old public.approval_substitute;
  new_id uuid;
begin
  if p_id is not null then
    select * into old from public.approval_substitute
    where id = p_id and organization_id = p_org and archived_at is null for update;
    if old.id is null then raise exception 'not found' using errcode = 'P0002'; end if;
    if not private.can_manage_substitute(p_org, old.absent_user_id) then
      raise exception 'not allowed' using errcode = '42501';
    end if;
  end if;
  if not private.can_manage_substitute(p_org, p_absent) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to < p_from then
    raise exception 'invalid period' using errcode = '22023', hint = 'invalid_period';
  end if;
  if p_absent = p_substitute then
    raise exception 'a user cannot substitute for themself' using errcode = '23514', hint = 'same_user';
  end if;
  if not exists (select 1 from public.membership m where m.organization_id = p_org and m.user_id = p_absent)
     or not exists (select 1 from public.membership m where m.organization_id = p_org and m.user_id = p_substitute) then
    raise exception 'both must be users in the organization' using errcode = '23514';
  end if;
  if p_id is null then
    insert into public.approval_substitute
      (organization_id, absent_user_id, substitute_user_id, valid_from, valid_to, note)
    values (p_org, p_absent, p_substitute, p_from, p_to, coalesce(trim(p_note), ''))
    returning id into new_id;
    return new_id;
  end if;
  update public.approval_substitute
  set absent_user_id = p_absent, substitute_user_id = p_substitute, valid_from = p_from,
      valid_to = p_to, note = coalesce(trim(p_note), '')
  where id = p_id;
  return p_id;
end $$;
revoke execute on function public.save_approval_substitute(uuid, uuid, uuid, uuid, date, date, text) from public, anon;
grant execute on function public.save_approval_substitute(uuid, uuid, uuid, uuid, date, date, text) to authenticated;

-- Ends a substitution (it no longer applies; kept for the audit trail).
create function public.end_approval_substitute(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  s public.approval_substitute;
begin
  select * into s from public.approval_substitute where id = p_id and archived_at is null for update;
  if s.id is null then raise exception 'not found' using errcode = 'P0002'; end if;
  if not private.can_manage_substitute(s.organization_id, s.absent_user_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.approval_substitute set archived_at = now() where id = p_id;
end $$;
revoke execute on function public.end_approval_substitute(uuid) from public, anon;
grant execute on function public.end_approval_substitute(uuid) to authenticated;

-- Users who can be chosen as absent or substitute (members, with a display name).
create function public.substitute_candidates(p_org uuid)
returns table (user_id uuid, name text, approves boolean)
language sql stable security definer set search_path = '' as $$
  select m.user_id,
         coalesce(nullif(trim(e.first_name || ' ' || e.last_name), ''), u.email::text),
         private.user_permission_scope(p_org, 'time.approve', m.user_id) is not null
           or exists (select 1 from public.employee x where x.organization_id = p_org
                      and x.approver_user_id = m.user_id and x.archived_at is null)
  from public.membership m
  join auth.users u on u.id = m.user_id
  left join public.employee e on e.organization_id = m.organization_id and e.user_id = m.user_id
    and e.archived_at is null
  where m.organization_id = p_org
    and u.email not like '%@login.turnus.invalid'
    and (private.has_org_permission(p_org, 'users.manage')
         or private.permission_scope(p_org, 'time.approve') is not null
         -- A substitute sees the names (for "you approve for …").
         or exists (select 1 from public.approval_substitute s
                    where s.organization_id = p_org and s.substitute_user_id = (select auth.uid())
                      and s.archived_at is null))
  order by 2;
$$;
revoke execute on function public.substitute_candidates(uuid) from public, anon;
grant execute on function public.substitute_candidates(uuid) to authenticated;
