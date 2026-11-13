-- Phase 4: time registration (tidsregistrering).
--
-- time_entry holds actual working time. A row is "current" while it is not
-- superseded and not archived. Approved rows never change: a correction is a
-- new row with supersedes_id, and the old row gets superseded_at.
--
-- Stamping is idempotent: every stamp action carries a client-generated UUID
-- (client_id for stamp in, end_client_id for stamp out), so an offline queue
-- can be replayed without duplicates.

insert into public.permission (key, allowed_scopes, sort_order) values
  ('time.view', '{departments,organization}', 170),
  ('time.manage', '{departments,organization}', 180),
  ('time.approve', '{departments,organization}', 190);

insert into public.permission_grant (organization_id, profile_id, permission, scope)
select p.organization_id, p.id, k.key, 'organization'
from public.permission_profile p
cross join (values ('time.view'), ('time.manage'), ('time.approve')) as k(key)
where p.is_owner
on conflict do nothing;

insert into public.permission_grant (organization_id, profile_id, permission, scope)
select p.organization_id, p.id, k.key, 'departments'
from public.permission_profile p
cross join (values ('time.view'), ('time.manage'), ('time.approve')) as k(key)
where not p.is_owner and p.name = 'Leder'
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
  values (org, 'Leder', 'Medarbejdere, kontrakter, vagtplan, tidsregistrering og projekttimer i de afdelinger, brugeren er ansvarlig for.')
  returning id into m;
  insert into public.permission_grant (organization_id, profile_id, permission, scope)
  select org, m, k, 'departments' from unnest(array[
    'employees.view', 'employees.manage', 'employees.invite', 'contracts.view', 'contracts.manage',
    'schedule.view', 'schedule.manage', 'schedule.publish', 'schedule.override', 'projects.view',
    'time.view', 'time.manage', 'time.approve'
  ]) as k;

  insert into public.permission_profile (organization_id, name, description)
  values (org, 'Medarbejder', 'Ser egne oplysninger og den offentliggjorte vagtplan for egne afdelinger. Registrerer egen tid.')
  returning id into e;

  update public.organization set default_profile_id = e where id = org;
  perform set_config('app.bootstrap', 'off', true);
  return query select o, m, e;
end $$;

-- ---------------------------------------------------------------------------
create type public.time_entry_status as enum ('open', 'pending', 'approved');
create type public.time_entry_source as enum ('stamp', 'planned', 'manual');

create table public.time_entry (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organization (id),
  employee_id uuid not null,
  department_id uuid not null,
  shift_id uuid,
  start_at timestamptz not null,
  end_at timestamptz,
  breaks jsonb not null default '[]'::jsonb,
  project_allocations jsonb not null default '[]'::jsonb check (jsonb_typeof(project_allocations) = 'array'),
  kind public.shift_kind not null default 'work',
  source public.time_entry_source not null,
  status public.time_entry_status not null,
  note text check (note is null or length(note) <= 500),
  deviation_reason text check (deviation_reason is null or length(deviation_reason) <= 500),
  client_id uuid,
  end_client_id uuid,
  -- Device time differed from the server's clock by more than 5 minutes (offline queue).
  offline boolean not null default false,
  supersedes_id uuid,
  superseded_at timestamptz,
  approved_by uuid references auth.users (id),
  approved_at timestamptz,
  created_by uuid references auth.users (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (organization_id, id),
  foreign key (organization_id, employee_id) references public.employee (organization_id, id),
  foreign key (organization_id, department_id) references public.department (organization_id, id),
  foreign key (organization_id, shift_id) references public.shift (organization_id, id),
  foreign key (organization_id, supersedes_id) references public.time_entry (organization_id, id),
  check ((status = 'open') = (end_at is null)),
  check (end_at is null or end_at > start_at),
  check (end_at is null or end_at - start_at <= interval '24 hours'),
  check ((status = 'approved') = (approved_at is not null)),
  check (private.valid_breaks(breaks,
    coalesce((extract(epoch from end_at - start_at) / 60)::integer, 1440), 'start_at'))
);
create unique index time_entry_client_id_uniq on public.time_entry (organization_id, client_id) where client_id is not null;
create unique index time_entry_end_client_id_uniq on public.time_entry (organization_id, end_client_id) where end_client_id is not null;
create index time_entry_employee_start_idx on public.time_entry (employee_id, start_at);
create index time_entry_department_start_idx on public.time_entry (department_id, start_at);
create index time_entry_shift_idx on public.time_entry (shift_id) where shift_id is not null;
-- Current registrations of an employee never overlap (an open one runs until stamped out).
alter table public.time_entry add constraint time_entry_no_overlap
  exclude using gist (
    employee_id with =,
    tstzrange(start_at, coalesce(end_at, 'infinity'::timestamptz)) with &&
  ) where (superseded_at is null and archived_at is null);

-- Is the current user this employee?
create function private.is_own_employee(emp uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.employee e where e.id = emp and e.user_id = (select auth.uid()));
$$;

alter table public.time_entry enable row level security;
create policy time_entry_select on public.time_entry for select to authenticated
  using (private.is_own_employee(employee_id)
         or private.can_on_department('time.view', department_id)
         or private.can_on_department('time.manage', department_id)
         or private.can_on_department('time.approve', department_id));
create policy time_entry_insert on public.time_entry for insert to authenticated
  with check (status <> 'approved' and supersedes_id is null
              and (private.is_own_employee(employee_id) or private.can_on_department('time.manage', department_id)));
create policy time_entry_update on public.time_entry for update to authenticated
  using (private.is_own_employee(employee_id) or private.can_on_department('time.manage', department_id))
  with check (private.is_own_employee(employee_id) or private.can_on_department('time.manage', department_id));

-- Integrity: approved and superseded rows are immutable; approval only via RPC.
create function private.time_entry_before_write() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if coalesce(current_setting('app.time_system', true), '') = 'on' then
      new.updated_at := now();
      return new;
    end if;
    if old.status = 'approved' or old.superseded_at is not null then
      raise exception 'an approved registration cannot be changed; make a correction' using errcode = '42501';
    end if;
    if new.employee_id <> old.employee_id or new.supersedes_id is distinct from old.supersedes_id
       or new.client_id is distinct from old.client_id then
      raise exception 'immutable field' using errcode = '42501';
    end if;
    if new.superseded_at is distinct from old.superseded_at then
      raise exception 'superseded_at is set by corrections' using errcode = '42501';
    end if;
  end if;
  if coalesce(current_setting('app.time_system', true), '') <> 'on' then
    if new.status = 'approved' or new.approved_by is not null or new.approved_at is not null then
      raise exception 'registrations are approved with approve_time_entries' using errcode = '42501';
    end if;
  end if;
  if not exists (select 1 from public.employee_department ed
                 where ed.employee_id = new.employee_id and ed.department_id = new.department_id) then
    raise exception 'employee is not in this department' using errcode = '23514';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger time_entry_before_write before insert or update on public.time_entry
  for each row execute function private.time_entry_before_write();

create trigger time_entry_projects_check before insert or update of project_allocations, department_id on public.time_entry
  for each row execute function private.check_project_allocations();
create trigger time_entry_audit after insert or update or delete on public.time_entry
  for each row execute function private.audit_row();
create trigger time_entry_org_immutable before update on public.time_entry
  for each row execute function private.forbid_org_change();

-- ---------------------------------------------------------------------------
-- Stamping (idempotent by client UUID).

-- Breaks that still fit after the registration got its end.
create function private.fit_breaks(b jsonb, s timestamptz, e timestamptz)
returns jsonb language sql immutable set search_path = '' as $$
  with kept as (
    select x from jsonb_array_elements(b) x
    where x ->> 'start_at' is null
       or ((x ->> 'start_at')::timestamptz >= s
           and (x ->> 'start_at')::timestamptz + make_interval(mins => (x ->> 'minutes')::int) <= e)
  )
  select case
    when coalesce((select sum((x ->> 'minutes')::int) from kept), 0) < extract(epoch from e - s) / 60
      then coalesce((select jsonb_agg(x) from kept), '[]'::jsonb)
    else '[]'::jsonb end;
$$;

create function public.stamp(p_organization_id uuid, p_client_id uuid, p_action text, p_at timestamptz)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  emp uuid;
  at timestamptz := least(coalesce(p_at, now()), now());
  late boolean := abs(extract(epoch from now() - coalesce(p_at, now()))) > 300;
  existing uuid;
  open_entry public.time_entry;
  sh record;
  dept uuid;
begin
  select e.id into emp from public.employee e
  where e.organization_id = p_organization_id and e.user_id = (select auth.uid()) and e.archived_at is null;
  if emp is null or not private.is_member(p_organization_id) then
    raise exception 'not an employee' using errcode = '42501';
  end if;
  -- Replays of an action already received return the same registration.
  select id into existing from public.time_entry
  where organization_id = p_organization_id and (client_id = p_client_id or end_client_id = p_client_id);
  if existing is not null then return existing; end if;
  if at < now() - interval '7 days' then
    raise exception 'stamp too old' using errcode = '22023';
  end if;

  select * into open_entry from public.time_entry
  where employee_id = emp and status = 'open' and superseded_at is null and archived_at is null;

  if p_action = 'in' then
    if open_entry.id is not null then
      raise exception 'already stamped in' using errcode = 'P0001', hint = 'already_in';
    end if;
    -- The employee's published shift closest to the stamp (within 4 hours) that has no registration.
    select s.id, s.department_id, s.published into sh
    from public.shift s
    where s.published is not null and s.archived_at is null
      and (s.published ->> 'employee_id')::uuid = emp
      and abs(extract(epoch from (s.published ->> 'start_at')::timestamptz - at)) <= 4 * 3600
      and not exists (select 1 from public.time_entry t
                      where t.shift_id = s.id and t.superseded_at is null and t.archived_at is null)
    order by abs(extract(epoch from (s.published ->> 'start_at')::timestamptz - at))
    limit 1;
    if sh.id is not null then
      dept := sh.department_id;
    else
      select ed.department_id into dept from public.employee_department ed
      where ed.employee_id = emp order by ed.is_primary desc limit 1;
    end if;
    if dept is null then raise exception 'employee has no department' using errcode = '23514'; end if;
    insert into public.time_entry (organization_id, employee_id, department_id, shift_id, start_at,
      breaks, project_allocations, kind, source, status, client_id, offline)
    values (p_organization_id, emp, dept, sh.id, at,
      coalesce(sh.published -> 'breaks', '[]'::jsonb), coalesce(sh.published -> 'project_allocations', '[]'::jsonb),
      coalesce((sh.published ->> 'kind')::public.shift_kind, 'work'), 'stamp', 'open', p_client_id, late)
    returning id into existing;
    return existing;
  elsif p_action = 'out' then
    if open_entry.id is null then
      raise exception 'not stamped in' using errcode = 'P0001', hint = 'not_in';
    end if;
    if at <= open_entry.start_at then at := open_entry.start_at + interval '1 minute'; end if;
    update public.time_entry set
      end_at = at, end_client_id = p_client_id, status = 'pending',
      breaks = private.fit_breaks(breaks, start_at, at),
      offline = offline or late
    where id = open_entry.id;
    return open_entry.id;
  end if;
  raise exception 'unknown action' using errcode = '22023';
end $$;
grant execute on function public.stamp(uuid, uuid, text, timestamptz) to authenticated;

-- "Gennemført som planlagt": registrations from published shifts that have ended.
create function public.complete_as_planned(p_shift_ids uuid[])
returns integer language plpgsql security definer set search_path = '' as $$
declare
  s record;
  n integer := 0;
  emp uuid;
begin
  for s in select * from public.shift where id = any (p_shift_ids) loop
    emp := (s.published ->> 'employee_id')::uuid;
    continue when s.published is null or s.archived_at is not null or emp is null;
    continue when (s.published ->> 'end_at')::timestamptz > now();
    if not (private.is_own_employee(emp) or private.can_on_department('time.manage', s.department_id)) then
      raise exception 'not allowed' using errcode = '42501';
    end if;
    continue when exists (select 1 from public.time_entry t
                          where t.shift_id = s.id and t.superseded_at is null and t.archived_at is null);
    insert into public.time_entry (organization_id, employee_id, department_id, shift_id, start_at, end_at,
      breaks, project_allocations, kind, source, status)
    values (s.organization_id, emp, s.department_id, s.id,
      (s.published ->> 'start_at')::timestamptz, (s.published ->> 'end_at')::timestamptz,
      coalesce(s.published -> 'breaks', '[]'::jsonb), coalesce(s.published -> 'project_allocations', '[]'::jsonb),
      (s.published ->> 'kind')::public.shift_kind, 'planned', 'pending');
    n := n + 1;
  end loop;
  return n;
end $$;
grant execute on function public.complete_as_planned(uuid[]) to authenticated;

-- Approval. Own registrations can only be approved with organization scope.
create function public.approve_time_entries(p_ids uuid[])
returns integer language plpgsql security definer set search_path = '' as $$
declare
  t record;
  n integer := 0;
  org uuid;
begin
  for t in select * from public.time_entry where id = any (p_ids) for update loop
    continue when t.status <> 'pending' or t.superseded_at is not null or t.archived_at is not null;
    if not private.can_on_department('time.approve', t.department_id) then
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
grant execute on function public.approve_time_entries(uuid[]) to authenticated;

-- Correction of an approved registration: a new version that needs approval again.
create function public.correct_time_entry(
  p_id uuid, p_start_at timestamptz, p_end_at timestamptz, p_breaks jsonb,
  p_project_allocations jsonb, p_reason text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  old public.time_entry;
  new_id uuid;
begin
  select * into old from public.time_entry where id = p_id for update;
  if old.id is null then raise exception 'not found' using errcode = 'P0002'; end if;
  if not private.can_on_department('time.manage', old.department_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if old.status <> 'approved' or old.superseded_at is not null or old.archived_at is not null then
    raise exception 'only current approved registrations are corrected this way' using errcode = '22023';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 5 then
    raise exception 'a correction needs a reason' using errcode = '23514';
  end if;
  perform set_config('app.time_system', 'on', true);
  update public.time_entry set superseded_at = now() where id = old.id;
  perform set_config('app.time_system', 'off', true);
  insert into public.time_entry (organization_id, employee_id, department_id, shift_id, start_at, end_at,
    breaks, project_allocations, kind, source, status, note, deviation_reason, supersedes_id)
  values (old.organization_id, old.employee_id, old.department_id, old.shift_id, p_start_at, p_end_at,
    p_breaks, p_project_allocations, old.kind, 'manual', 'pending', old.note, trim(p_reason), old.id)
  returning id into new_id;
  return new_id;
end $$;
grant execute on function public.correct_time_entry(uuid, timestamptz, timestamptz, jsonb, jsonb, text) to authenticated;

-- Registrations with their plan, plus published shifts that have ended
-- without a registration ("missing"). Visible: own, or time.* on the department.
create function public.time_overview(p_from timestamptz, p_to timestamptz)
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
         or private.can_on_department('time.approve', t.department_id))
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
         or private.can_on_department('time.approve', s.department_id))
  order by 9, 5;
$$;
grant execute on function public.time_overview(timestamptz, timestamptz) to authenticated;

-- The versions of a registration (newest first), for the history view.
create function public.time_entry_history(p_id uuid)
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
  order by c.created_at desc;
$$;
grant execute on function public.time_entry_history(uuid) to authenticated;

-- Registered time with project data for the project overview.
create function public.project_time_entries(p_from timestamptz, p_to timestamptz)
returns table (id uuid, department_id uuid, department_name text, employee_id uuid,
               employee_number text, employee_name text, start_at timestamptz, end_at timestamptz,
               breaks jsonb, project_allocations jsonb, status public.time_entry_status)
language sql stable security definer set search_path = '' as $$
  select t.id, t.department_id, d.name, t.employee_id, e.employee_number,
         trim(e.first_name || ' ' || e.last_name), t.start_at, t.end_at, t.breaks, t.project_allocations, t.status
  from public.time_entry t
  join public.department d on d.id = t.department_id
  join public.employee e on e.id = t.employee_id
  where t.superseded_at is null and t.archived_at is null and t.end_at is not null
    and jsonb_array_length(t.project_allocations) > 0
    and t.start_at >= p_from and t.start_at < p_to
    and private.can_on_department('projects.view', t.department_id);
$$;
grant execute on function public.project_time_entries(timestamptz, timestamptz) to authenticated;

revoke execute on function public.stamp(uuid, uuid, text, timestamptz), public.complete_as_planned(uuid[]),
  public.approve_time_entries(uuid[]), public.correct_time_entry(uuid, timestamptz, timestamptz, jsonb, jsonb, text),
  public.project_time_entries(timestamptz, timestamptz), public.time_overview(timestamptz, timestamptz),
  public.time_entry_history(uuid) from public, anon;

alter publication supabase_realtime add table public.time_entry;
