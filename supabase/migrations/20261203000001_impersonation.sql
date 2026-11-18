-- Log in as an employee (impersonation), fully audited.
--
-- An administrator with users.impersonate gets a real session as the employee
-- (the server keeps the administrator's own session to return to). Requests
-- made during it carry the header x-turnus-impersonation: <session id>; the
-- database checks it against an active session for the signed-in user and
-- records the administrator as impersonator in the audit log, so everything
-- done can be told apart from the employee's own actions.

insert into public.permission (key, allowed_scopes, sort_order) values
  ('users.impersonate', '{organization}', 75);
insert into public.permission_grant (organization_id, profile_id, permission, scope)
select p.organization_id, p.id, 'users.impersonate', 'organization'
from public.permission_profile p where p.is_owner
on conflict do nothing;

create table public.impersonation_session (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organization (id),
  admin_user_id uuid not null references auth.users (id),
  target_user_id uuid not null references auth.users (id),
  target_employee_id uuid not null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  foreign key (organization_id, target_employee_id) references public.employee (organization_id, id)
);
create index impersonation_session_target_idx on public.impersonation_session (target_user_id) where ended_at is null;
alter table public.impersonation_session enable row level security;
create policy impersonation_session_select on public.impersonation_session for select to authenticated
  using (admin_user_id = (select auth.uid()) or target_user_id = (select auth.uid())
         or private.has_org_permission(organization_id, 'users.manage'));
create trigger impersonation_session_audit after insert or update on public.impersonation_session
  for each row execute function private.audit_row();

alter table public.audit_log add column impersonator_id uuid;

-- The administrator behind the current request, if it is made during an active session.
create function private.impersonator() returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare
  sid uuid;
  admin uuid;
begin
  begin
    sid := nullif(current_setting('request.headers', true)::json ->> 'x-turnus-impersonation', '')::uuid;
  exception when others then
    return null;
  end;
  if sid is null then return null; end if;
  select s.admin_user_id into admin from public.impersonation_session s
  where s.id = sid and s.target_user_id = (select auth.uid()) and s.ended_at is null
    and s.started_at > now() - interval '12 hours';
  return admin;
end $$;

create or replace function private.audit_row() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  rec jsonb;
  org uuid;
  rid text;
begin
  rec := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  org := case
    when tg_table_name = 'organization' then (rec ->> 'id')::uuid
    else (rec ->> 'organization_id')::uuid
  end;
  if org is null and tg_table_name = 'agreement_version' then
    select a.organization_id into org from public.agreement a where a.id = (rec ->> 'agreement_id')::uuid;
  end if;
  rid := coalesce(
    rec ->> 'id',
    concat_ws(':', rec ->> 'employee_id', rec ->> 'department_id', rec ->> 'user_id')
  );
  if tg_op = 'UPDATE' and to_jsonb(old) = to_jsonb(new) then
    return new;
  end if;
  insert into public.audit_log (organization_id, actor_id, impersonator_id, table_name, row_id, action, before, after)
  values (
    org,
    auth.uid(),
    private.impersonator(),
    tg_table_name,
    rid,
    tg_op,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );
  return coalesce(new, old);
end $$;

-- May the caller log in as this employee? Returns the employee's user (null = no login yet).
create function public.can_impersonate(p_employee_id uuid)
returns table (allowed boolean, reason text, user_id uuid, email text)
language plpgsql stable security definer set search_path = '' as $$
declare
  e public.employee;
begin
  select * into e from public.employee where id = p_employee_id;
  if e.id is null or e.archived_at is not null
     or not private.has_org_permission(e.organization_id, 'users.impersonate') then
    return query select false, 'not_allowed', null::uuid, null::text; return;
  end if;
  if e.user_id = (select auth.uid()) then
    return query select false, 'self', null::uuid, null::text; return;
  end if;
  if e.user_id is not null and (
       exists (select 1 from public.platform_admin pa where pa.user_id = e.user_id)
       or exists (select 1 from public.membership m join public.permission_profile p on p.id = m.profile_id
                  where m.user_id = e.user_id and m.organization_id = e.organization_id and p.is_owner)) then
    return query select false, 'administrator', null::uuid, null::text; return;
  end if;
  return query select true, null::text, e.user_id,
    (select u.email::text from auth.users u where u.id = e.user_id);
end $$;
revoke execute on function public.can_impersonate(uuid) from public, anon;
grant execute on function public.can_impersonate(uuid) to authenticated;

create function public.start_impersonation(p_employee_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  c record;
  sid uuid;
begin
  select * into c from public.can_impersonate(p_employee_id);
  if not coalesce(c.allowed, false) or c.user_id is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  insert into public.impersonation_session (organization_id, admin_user_id, target_user_id, target_employee_id)
  select e.organization_id, (select auth.uid()), e.user_id, e.id from public.employee e where e.id = p_employee_id
  returning id into sid;
  return sid;
end $$;
revoke execute on function public.start_impersonation(uuid) from public, anon;
grant execute on function public.start_impersonation(uuid) to authenticated;

create function public.end_impersonation(p_session uuid) returns void
language sql security definer set search_path = '' as $$
  update public.impersonation_session set ended_at = now()
  where id = p_session and ended_at is null
    and (target_user_id = (select auth.uid()) or admin_user_id = (select auth.uid()));
$$;
revoke execute on function public.end_impersonation(uuid) from public, anon;
grant execute on function public.end_impersonation(uuid) to authenticated;

-- For the banner: who is logged in as whom.
create function public.impersonation_info(p_session uuid)
returns table (admin_email text, employee_name text, employee_id uuid)
language sql stable security definer set search_path = '' as $$
  select u.email::text, trim(e.first_name || ' ' || e.last_name), e.id
  from public.impersonation_session s
  join auth.users u on u.id = s.admin_user_id
  join public.employee e on e.id = s.target_employee_id
  where s.id = p_session and s.target_user_id = (select auth.uid()) and s.ended_at is null;
$$;
revoke execute on function public.impersonation_info(uuid) from public, anon;
grant execute on function public.impersonation_info(uuid) to authenticated;

-- The history of a registration says when a version was made or approved by an
-- administrator logged in as someone else.
drop function public.time_entry_history(uuid);
create function public.time_entry_history(p_id uuid)
returns table (id uuid, start_at timestamptz, end_at timestamptz, breaks jsonb, status public.time_entry_status,
               source public.time_entry_source, deviation_reason text, created_at timestamptz, created_by_email text,
               approved_at timestamptz, approved_by_email text, superseded_at timestamptz,
               created_as_email text, approved_as_email text)
language sql stable security definer set search_path = '' as $$
  with recursive chain as (
    select x.* from public.time_entry x where x.id = p_id
    union all
    select y.* from public.time_entry y join chain c on y.id = c.supersedes_id
  )
  select c.id, c.start_at, c.end_at, c.breaks, c.status, c.source, c.deviation_reason, c.created_at, cu.email::text,
         c.approved_at, au.email::text, c.superseded_at,
         (select iu.email::text from public.audit_log l join auth.users iu on iu.id = l.impersonator_id
          where l.table_name = 'time_entry' and l.row_id = c.id::text and l.action = 'INSERT' limit 1),
         (select iu.email::text from public.audit_log l join auth.users iu on iu.id = l.impersonator_id
          where l.table_name = 'time_entry' and l.row_id = c.id::text and l.action = 'UPDATE'
            and l.after ->> 'status' = 'approved' and coalesce(l.before ->> 'status', '') <> 'approved'
          order by l.id desc limit 1)
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
revoke execute on function public.time_entry_history(uuid) from public, anon;
grant execute on function public.time_entry_history(uuid) to authenticated;

-- A login created in the background (no e-mail sent) so an administrator can
-- log in as an employee without one. Inviting the employee later takes it over.
alter table public.employee add column login_placeholder boolean not null default false;
