-- Phase 3: schedule (vagtplan).
--
-- Shifts are a managers' working copy. Publishing copies the current values
-- into `published` (a snapshot), which is what employees see. Editing a
-- published shift turns it back into a draft until the next publish, while
-- employees keep seeing the snapshot. Publishing happens only through
-- public.publish_schedule(), which the app calls with the service role after
-- validating the schedule with the rules engine.

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------
insert into public.permission (key, allowed_scopes, sort_order) values
  ('schedule.view', '{departments,organization}', 110),
  ('schedule.manage', '{departments,organization}', 120),
  ('schedule.publish', '{departments,organization}', 130),
  ('schedule.override', '{departments,organization}', 140);

-- Owner profiles always hold every permission (no auth.uid() in migrations).
insert into public.permission_grant (organization_id, profile_id, permission, scope)
select p.organization_id, p.id, k.key, 'organization'
from public.permission_profile p
cross join (values ('schedule.view'), ('schedule.manage'), ('schedule.publish'), ('schedule.override')) as k(key)
where p.is_owner
on conflict do nothing;

-- Existing default "Leder" profiles get the schedule for their own departments.
insert into public.permission_grant (organization_id, profile_id, permission, scope)
select p.organization_id, p.id, k.key, 'departments'
from public.permission_profile p
cross join (values ('schedule.view'), ('schedule.manage'), ('schedule.publish'), ('schedule.override')) as k(key)
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
  values (org, 'Leder', 'Medarbejdere, kontrakter og vagtplan i de afdelinger, brugeren er ansvarlig for.')
  returning id into m;
  insert into public.permission_grant (organization_id, profile_id, permission, scope)
  select org, m, k, 'departments' from unnest(array[
    'employees.view', 'employees.manage', 'employees.invite', 'contracts.view', 'contracts.manage',
    'schedule.view', 'schedule.manage', 'schedule.publish', 'schedule.override'
  ]) as k;

  insert into public.permission_profile (organization_id, name, description)
  values (org, 'Medarbejder', 'Ser egne oplysninger og den offentliggjorte vagtplan for egne afdelinger.')
  returning id into e;

  update public.organization set default_profile_id = e where id = org;
  perform set_config('app.bootstrap', 'off', true);
  return query select o, m, e;
end $$;

-- Lets the app ask "may I do X in this department?".
create function public.can_on_department(perm text, dept uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.can_on_department(perm, dept);
$$;
grant execute on function public.can_on_department(text, uuid) to authenticated;

-- Audit actor: auth.uid(), or app.actor_id when the app acts with the service role.
create or replace function private.current_actor()
returns uuid language sql stable set search_path = '' as $$
  select coalesce(auth.uid(), nullif(current_setting('app.actor_id', true), '')::uuid);
$$;

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
    concat_ws(':', rec ->> 'employee_id', rec ->> 'department_id', rec ->> 'user_id', rec ->> 'profile_id', rec ->> 'permission')
  );
  if tg_op = 'UPDATE' and to_jsonb(old) = to_jsonb(new) then
    return new;
  end if;
  insert into public.audit_log (organization_id, actor_id, table_name, row_id, action, before, after)
  values (
    org,
    private.current_actor(),
    tg_table_name,
    rid,
    tg_op,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );
  return coalesce(new, old);
end $$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create type public.shift_status as enum ('draft', 'published');
create type public.shift_kind as enum ('work', 'on_call');
create type public.availability_kind as enum ('unavailable', 'available', 'wish_off', 'wish_work');

create table public.shift_template (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organization (id),
  department_id uuid,
  name text not null check (length(trim(name)) between 1 and 100),
  start_time time not null,
  end_time time not null,
  break_minutes integer not null default 0 check (break_minutes between 0 and 600),
  kind public.shift_kind not null default 'work',
  label text check (label is null or length(label) <= 60),
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (organization_id, id),
  foreign key (organization_id, department_id) references public.department (organization_id, id)
);

create table public.shift (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organization (id),
  department_id uuid not null,
  employee_id uuid,
  start_at timestamptz not null,
  end_at timestamptz not null,
  break_minutes integer not null default 0 check (break_minutes >= 0),
  kind public.shift_kind not null default 'work',
  label text check (label is null or length(label) <= 60),
  note text check (note is null or length(note) <= 500),
  status public.shift_status not null default 'draft',
  -- Snapshot employees see: {employee_id, start_at, end_at, break_minutes, kind, label}; null = not visible.
  published jsonb,
  published_at timestamptz,
  template_id uuid,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (organization_id, id),
  foreign key (organization_id, department_id) references public.department (organization_id, id),
  foreign key (organization_id, employee_id) references public.employee (organization_id, id),
  foreign key (organization_id, template_id) references public.shift_template (organization_id, id),
  check (end_at > start_at),
  check (end_at - start_at <= interval '24 hours'),
  check (break_minutes * interval '1 minute' < end_at - start_at)
);
create index shift_department_start_idx on public.shift (department_id, start_at);
create index shift_employee_start_idx on public.shift (employee_id, start_at);

create table public.availability (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organization (id),
  employee_id uuid not null,
  date date not null,
  kind public.availability_kind not null,
  -- Local times; both null = whole day.
  from_time time,
  to_time time,
  note text check (note is null or length(note) <= 300),
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  foreign key (organization_id, employee_id) references public.employee (organization_id, id),
  check ((from_time is null) = (to_time is null))
);
create index availability_employee_date_idx on public.availability (employee_id, date);

create table public.schedule_publication (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organization (id),
  department_id uuid not null,
  from_date date not null,
  to_date date not null,
  published_by uuid not null,
  published_at timestamptz not null default now(),
  shift_count integer not null,
  blocking_count integer not null,
  warning_count integer not null,
  unique (organization_id, id),
  foreign key (organization_id, department_id) references public.department (organization_id, id)
);

create table public.rule_violation (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organization (id),
  publication_id uuid not null,
  department_id uuid not null,
  shift_id uuid,
  employee_id uuid,
  rule_id text not null,
  code text not null,
  severity text not null check (severity in ('BLOCKING', 'WARNING')),
  message text not null,
  date date not null,
  details jsonb not null default '{}'::jsonb,
  source text,
  override_reason text,
  overridden_by uuid,
  created_at timestamptz not null default now(),
  foreign key (organization_id, publication_id) references public.schedule_publication (organization_id, id),
  check (severity = 'WARNING' or (override_reason is not null and length(trim(override_reason)) >= 5))
);
create index rule_violation_publication_idx on public.rule_violation (publication_id);
create index rule_violation_employee_idx on public.rule_violation (employee_id, date);

-- ---------------------------------------------------------------------------
-- Shift integrity: editing marks the shift as draft; the snapshot can only be
-- written by publish_schedule().
-- ---------------------------------------------------------------------------
create function private.shift_before_write() returns trigger
language plpgsql set search_path = '' as $$
begin
  if coalesce(current_setting('app.publishing', true), '') <> 'on' then
    if tg_op = 'INSERT' then
      new.status := 'draft';
      new.published := null;
      new.published_at := null;
    else
      new.published := old.published;
      new.published_at := old.published_at;
      if (new.employee_id, new.start_at, new.end_at, new.break_minutes, new.kind, new.label, new.department_id, new.archived_at)
         is distinct from
         (old.employee_id, old.start_at, old.end_at, old.break_minutes, old.kind, old.label, old.department_id, old.archived_at) then
        new.status := 'draft';
      else
        new.status := old.status;
      end if;
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger shift_before_write before insert or update on public.shift
  for each row execute function private.shift_before_write();

do $$
declare
  t text;
begin
  foreach t in array array['shift_template', 'shift', 'availability', 'schedule_publication', 'rule_violation'] loop
    execute format('create trigger %I after insert or update or delete on public.%I
      for each row execute function private.audit_row()', t || '_audit', t);
  end loop;
  foreach t in array array['shift_template', 'shift', 'availability'] loop
    execute format('create trigger %I before update on public.%I
      for each row execute function private.forbid_org_change()', t || '_org_immutable', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.shift_template enable row level security;
alter table public.shift enable row level security;
alter table public.availability enable row level security;
alter table public.schedule_publication enable row level security;
alter table public.rule_violation enable row level security;

create function private.can_schedule(perm text, org uuid, dept uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select case
    when dept is null then private.has_org_permission(org, perm)
    else private.can_on_department(perm, dept)
  end;
$$;
grant execute on function private.can_schedule(text, uuid, uuid) to authenticated;

create policy shift_template_select on public.shift_template for select to authenticated
  using (private.is_member(organization_id));
create policy shift_template_insert on public.shift_template for insert to authenticated
  with check (private.can_schedule('schedule.manage', organization_id, department_id));
create policy shift_template_update on public.shift_template for update to authenticated
  using (private.can_schedule('schedule.manage', organization_id, department_id))
  with check (private.can_schedule('schedule.manage', organization_id, department_id));

create policy shift_select on public.shift for select to authenticated
  using (private.can_on_department('schedule.view', department_id)
         or private.can_on_department('schedule.manage', department_id));
create policy shift_insert on public.shift for insert to authenticated
  with check (private.can_on_department('schedule.manage', department_id));
create policy shift_update on public.shift for update to authenticated
  using (private.can_on_department('schedule.manage', department_id))
  with check (private.can_on_department('schedule.manage', department_id));

create policy availability_select on public.availability for select to authenticated
  using (private.is_self(employee_id)
         or private.can_on_employee('schedule.view', employee_id)
         or private.can_on_employee('schedule.manage', employee_id));
create policy availability_insert on public.availability for insert to authenticated
  with check (private.is_self(employee_id));
create policy availability_update on public.availability for update to authenticated
  using (private.is_self(employee_id)) with check (private.is_self(employee_id));

create policy schedule_publication_select on public.schedule_publication for select to authenticated
  using (private.can_on_department('schedule.view', department_id));
create policy rule_violation_select on public.rule_violation for select to authenticated
  using (private.can_on_department('schedule.view', department_id));
-- No insert/update policies: written only by publish_schedule().

-- ---------------------------------------------------------------------------
-- What employees see: published snapshots of their own shifts and of the
-- departments they belong to.
-- ---------------------------------------------------------------------------
create function public.published_shifts(p_from timestamptz, p_to timestamptz)
returns table (
  id uuid, department_id uuid, department_name text, employee_id uuid, employee_name text,
  start_at timestamptz, end_at timestamptz, break_minutes integer, kind public.shift_kind,
  label text, is_mine boolean
)
language sql stable security definer set search_path = '' as $$
  with me as (
    select e.id from public.employee e where e.user_id = (select auth.uid())
  ), my_departments as (
    select ed.department_id from public.employee_department ed where ed.employee_id in (select id from me)
  )
  select s.id, s.department_id, d.name,
         (s.published ->> 'employee_id')::uuid,
         trim(coalesce(e.first_name, '') || ' ' || coalesce(e.last_name, '')),
         (s.published ->> 'start_at')::timestamptz, (s.published ->> 'end_at')::timestamptz,
         (s.published ->> 'break_minutes')::integer, (s.published ->> 'kind')::public.shift_kind,
         s.published ->> 'label',
         (s.published ->> 'employee_id')::uuid in (select id from me)
  from public.shift s
  join public.department d on d.id = s.department_id
  left join public.employee e on e.id = (s.published ->> 'employee_id')::uuid
  where s.published is not null
    and (s.published ->> 'start_at')::timestamptz < p_to
    and (s.published ->> 'end_at')::timestamptz > p_from
    and (s.department_id in (select department_id from my_departments)
         or (s.published ->> 'employee_id')::uuid in (select id from me))
  order by 6, 3;
$$;
grant execute on function public.published_shifts(timestamptz, timestamptz) to authenticated;

-- All shifts (draft values) of employees the caller may plan, across
-- departments, so the rules engine sees an employee's full workload.
create function public.shifts_for_validation(p_employee_ids uuid[], p_from timestamptz, p_to timestamptz)
returns table (id uuid, employee_id uuid, department_id uuid, start_at timestamptz, end_at timestamptz,
               break_minutes integer, kind public.shift_kind, status public.shift_status)
language sql stable security definer set search_path = '' as $$
  select s.id, s.employee_id, s.department_id, s.start_at, s.end_at, s.break_minutes, s.kind, s.status
  from public.shift s
  where s.employee_id = any (p_employee_ids)
    and s.archived_at is null
    and s.start_at < p_to and s.end_at > p_from
    and (private.can_on_employee('schedule.view', s.employee_id)
         or private.can_on_employee('schedule.manage', s.employee_id));
$$;
grant execute on function public.shifts_for_validation(uuid[], timestamptz, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- Publishing. Called by the app with the service role after it has checked
-- the caller's permission and validated the period with the rules engine.
-- p_violations: [{shift_id, employee_id, rule_id, code, severity, message,
--                 date, details, source, override_reason}]
-- ---------------------------------------------------------------------------
create function public.publish_schedule(
  p_actor uuid,
  p_department_id uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_from_date date,
  p_to_date date,
  p_violations jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  org uuid;
  pub uuid;
  n integer;
  blocking integer;
  warnings integer;
  v jsonb;
begin
  select organization_id into org from public.department where id = p_department_id;
  if org is null then raise exception 'department not found' using errcode = 'P0002'; end if;
  perform set_config('app.actor_id', p_actor::text, true);

  -- The actor's permissions, evaluated as that user.
  perform set_config('request.jwt.claims', json_build_object('sub', p_actor)::text, true);
  if not private.can_on_department('schedule.publish', p_department_id) then
    raise exception 'not allowed to publish' using errcode = '42501';
  end if;
  select count(*) filter (where x ->> 'severity' = 'BLOCKING'),
         count(*) filter (where x ->> 'severity' = 'WARNING')
    into blocking, warnings
  from jsonb_array_elements(p_violations) x;
  if exists (
    select 1 from jsonb_array_elements(p_violations) x
    where x ->> 'severity' = 'BLOCKING' and length(trim(coalesce(x ->> 'override_reason', ''))) < 5
  ) then
    raise exception 'blocking violations need an override reason' using errcode = '23514';
  end if;
  if blocking > 0 and not private.can_on_department('schedule.override', p_department_id) then
    raise exception 'not allowed to override' using errcode = '42501';
  end if;

  perform set_config('app.publishing', 'on', true);
  update public.shift s set
    published = case when s.archived_at is null then jsonb_build_object(
      'employee_id', s.employee_id, 'start_at', s.start_at, 'end_at', s.end_at,
      'break_minutes', s.break_minutes, 'kind', s.kind, 'label', s.label) end,
    published_at = now(),
    status = 'published'
  where s.department_id = p_department_id
    and s.start_at >= p_from and s.start_at < p_to
    and (s.status = 'draft' or s.archived_at is not null and s.published is not null);
  get diagnostics n = row_count;
  perform set_config('app.publishing', 'off', true);

  insert into public.schedule_publication (organization_id, department_id, from_date, to_date, published_by, shift_count, blocking_count, warning_count)
  values (org, p_department_id, p_from_date, p_to_date, p_actor, n, blocking, warnings)
  returning id into pub;

  for v in select * from jsonb_array_elements(p_violations) loop
    insert into public.rule_violation (organization_id, publication_id, department_id, shift_id, employee_id,
      rule_id, code, severity, message, date, details, source, override_reason, overridden_by)
    values (org, pub, p_department_id, nullif(v ->> 'shift_id', '')::uuid, nullif(v ->> 'employee_id', '')::uuid,
      v ->> 'rule_id', v ->> 'code', v ->> 'severity', v ->> 'message', (v ->> 'date')::date,
      coalesce(v -> 'details', '{}'::jsonb), v ->> 'source', nullif(trim(v ->> 'override_reason'), ''),
      case when v ->> 'severity' = 'BLOCKING' then p_actor end);
  end loop;
  return pub;
end $$;
revoke execute on function public.publish_schedule(uuid, uuid, timestamptz, timestamptz, date, date, jsonb) from public, anon, authenticated;
grant execute on function public.publish_schedule(uuid, uuid, timestamptz, timestamptz, date, date, jsonb) to service_role;

-- Live updates for the schedule views.
alter publication supabase_realtime add table public.shift, public.availability;
