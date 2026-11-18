-- Posting dimensions (konteringsdimensioner): the consultant defines
-- dimensions (e.g. Omkostningssted, Projekt, Aktivitet) and their values.
-- Values come from the department, the employee or the shift/registration
-- (most specific wins, per dimension). Pay lines are split per posting.
--
-- posting_allocations on a shift or time entry:
--   [{"values": {"<dimension_id>": "<value_id>", ...}, "start_at": iso|null, "end_at": iso|null, "minutes": int|null}]
-- A row is a time span, a number of paid minutes, or "the rest" (neither).
-- department.posting_defaults / employee.posting_defaults: {"<dimension_id>": "<value_id>"}.

insert into public.permission (key, allowed_scopes, sort_order) values
  ('posting.manage', '{organization}', 165);
insert into public.permission_grant (organization_id, profile_id, permission, scope)
select p.organization_id, p.id, 'posting.manage', 'organization'
from public.permission_profile p where p.is_owner
on conflict do nothing;

create table public.posting_dimension (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organization (id),
  key text not null check (key ~ '^[a-z0-9][a-z0-9_]{0,39}$'),
  name text not null check (length(trim(name)) between 1 and 80),
  required boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (organization_id, id)
);
create unique index posting_dimension_key_uniq on public.posting_dimension (organization_id, key) where archived_at is null;

create table public.posting_value (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  dimension_id uuid not null,
  code text not null check (length(trim(code)) between 1 and 40),
  name text not null check (length(trim(name)) between 1 and 120),
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (organization_id, id),
  foreign key (organization_id, dimension_id) references public.posting_dimension (organization_id, id)
);
create unique index posting_value_code_uniq on public.posting_value (organization_id, dimension_id, lower(code)) where archived_at is null;

-- Empty = available in all departments (configuration, may be deleted; audited).
create table public.posting_value_department (
  organization_id uuid not null,
  value_id uuid not null,
  department_id uuid not null,
  primary key (value_id, department_id),
  foreign key (organization_id, value_id) references public.posting_value (organization_id, id),
  foreign key (organization_id, department_id) references public.department (organization_id, id)
);

alter table public.posting_dimension enable row level security;
alter table public.posting_value enable row level security;
alter table public.posting_value_department enable row level security;
create policy posting_dimension_select on public.posting_dimension for select to authenticated
  using (private.is_member(organization_id));
create policy posting_dimension_insert on public.posting_dimension for insert to authenticated
  with check (private.has_org_permission(organization_id, 'posting.manage'));
create policy posting_dimension_update on public.posting_dimension for update to authenticated
  using (private.has_org_permission(organization_id, 'posting.manage'))
  with check (private.has_org_permission(organization_id, 'posting.manage'));
create policy posting_value_select on public.posting_value for select to authenticated
  using (private.is_member(organization_id));
create policy posting_value_insert on public.posting_value for insert to authenticated
  with check (private.has_org_permission(organization_id, 'posting.manage'));
create policy posting_value_update on public.posting_value for update to authenticated
  using (private.has_org_permission(organization_id, 'posting.manage'))
  with check (private.has_org_permission(organization_id, 'posting.manage'));
create policy posting_value_department_select on public.posting_value_department for select to authenticated
  using (private.is_member(organization_id));
create policy posting_value_department_insert on public.posting_value_department for insert to authenticated
  with check (private.has_org_permission(organization_id, 'posting.manage'));
create policy posting_value_department_delete on public.posting_value_department for delete to authenticated
  using (private.has_org_permission(organization_id, 'posting.manage'));

alter table public.department add column posting_defaults jsonb not null default '{}'::jsonb
  check (jsonb_typeof(posting_defaults) = 'object');
alter table public.employee add column posting_defaults jsonb not null default '{}'::jsonb
  check (jsonb_typeof(posting_defaults) = 'object');
alter table public.shift add column posting_allocations jsonb not null default '[]'::jsonb
  check (jsonb_typeof(posting_allocations) = 'array');
alter table public.time_entry add column posting_allocations jsonb not null default '[]'::jsonb
  check (jsonb_typeof(posting_allocations) = 'array');
alter table public.pay_line add column posting jsonb not null default '{}'::jsonb
  check (jsonb_typeof(posting) = 'object');

-- A posting {dimension_id: value_id}: every value belongs to its dimension in
-- the organization (and, with a department, is available there).
create function private.check_posting(org uuid, dept uuid, posting jsonb) returns void
language plpgsql stable security definer set search_path = '' as $$
declare
  k text;
  v text;
begin
  if jsonb_typeof(posting) <> 'object' then
    raise exception 'posting must be an object' using errcode = '22023';
  end if;
  for k, v in select key, value #>> '{}' from jsonb_each(posting) loop
    if not exists (select 1 from public.posting_value pv
                   where pv.id = v::uuid and pv.dimension_id = k::uuid and pv.organization_id = org) then
      raise exception 'unknown posting value' using errcode = '23503';
    end if;
    if dept is not null
       and exists (select 1 from public.posting_value_department d where d.value_id = v::uuid)
       and not exists (select 1 from public.posting_value_department d where d.value_id = v::uuid and d.department_id = dept) then
      raise exception 'posting value not available in this department' using errcode = '23514';
    end if;
  end loop;
end $$;

create function private.check_posting_allocations() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  r jsonb;
begin
  for r in select e from jsonb_array_elements(new.posting_allocations) e loop
    perform private.check_posting(new.organization_id, new.department_id, coalesce(r -> 'values', '{}'::jsonb));
  end loop;
  return new;
end $$;
create trigger shift_posting_check before insert or update of posting_allocations, department_id on public.shift
  for each row execute function private.check_posting_allocations();
create trigger time_entry_posting_check before insert or update of posting_allocations, department_id on public.time_entry
  for each row execute function private.check_posting_allocations();

create function private.check_posting_defaults() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.check_posting(new.organization_id,
    case when tg_table_name = 'department' then new.id else null end, new.posting_defaults);
  return new;
end $$;
create trigger department_posting_check before insert or update of posting_defaults on public.department
  for each row execute function private.check_posting_defaults();
create trigger employee_posting_check before insert or update of posting_defaults on public.employee
  for each row execute function private.check_posting_defaults();

do $$
declare
  t text;
begin
  foreach t in array array['posting_dimension', 'posting_value', 'posting_value_department'] loop
    execute format('create trigger %I after insert or update or delete on public.%I
      for each row execute function private.audit_row()', t || '_audit', t);
  end loop;
  foreach t in array array['posting_dimension', 'posting_value'] loop
    execute format('create trigger %I before update on public.%I
      for each row execute function private.forbid_org_change()', t || '_org_immutable', t);
  end loop;
end $$;

-- Functions that copy or return allocations now carry posting_allocations too.

-- Draft detection includes posting.
CREATE OR REPLACE FUNCTION private.shift_before_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if coalesce(current_setting('app.publishing', true), '') <> 'on' then
    if tg_op = 'INSERT' then
      new.status := 'draft';
      new.published := null;
      new.published_at := null;
    else
      new.published := old.published;
      new.published_at := old.published_at;
      if (new.employee_id, new.start_at, new.end_at, new.breaks, new.supplement_type_ids, new.project_allocations, new.posting_allocations, new.kind, new.label, new.department_id, new.archived_at)
         is distinct from
         (old.employee_id, old.start_at, old.end_at, old.breaks, old.supplement_type_ids, old.project_allocations, old.posting_allocations, old.kind, old.label, old.department_id, old.archived_at) then
        new.status := 'draft';
      else
        new.status := old.status;
      end if;
    end if;
  end if;
  new.updated_at := now();
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.complete_as_planned(p_shift_ids uuid[])
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
      breaks, project_allocations, posting_allocations, kind, source, status)
    values (s.organization_id, emp, s.department_id, s.id,
      (s.published ->> 'start_at')::timestamptz, (s.published ->> 'end_at')::timestamptz,
      coalesce(s.published -> 'breaks', '[]'::jsonb), coalesce(s.published -> 'project_allocations', '[]'::jsonb),
      coalesce(s.published -> 'posting_allocations', '[]'::jsonb),
      (s.published ->> 'kind')::public.time_entry_kind, 'planned', 'pending');
    n := n + 1;
  end loop;
  return n;
end $function$;

drop function public.correct_time_entry(uuid, timestamptz, timestamptz, jsonb, jsonb, text);
CREATE FUNCTION public.correct_time_entry(p_id uuid, p_start_at timestamp with time zone, p_end_at timestamp with time zone, p_breaks jsonb, p_project_allocations jsonb, p_reason text, p_posting_allocations jsonb DEFAULT '[]'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    breaks, project_allocations, posting_allocations, kind, source, status, note, deviation_reason, supersedes_id)
  values (old.organization_id, old.employee_id, old.department_id, old.shift_id, p_start_at, p_end_at,
    p_breaks, p_project_allocations, coalesce(p_posting_allocations, '[]'::jsonb), old.kind, 'manual', 'pending', old.note, trim(p_reason), old.id)
  returning id into new_id;
  return new_id;
end $function$;
grant execute on function public.correct_time_entry(uuid, timestamptz, timestamptz, jsonb, jsonb, text, jsonb) to authenticated;

CREATE OR REPLACE FUNCTION public.publish_schedule(p_actor uuid, p_department_id uuid, p_from timestamp with time zone, p_to timestamp with time zone, p_from_date date, p_to_date date, p_violations jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  org uuid;
  pub uuid;
  n integer;
  blocking integer;
  needs_override integer;
  warnings integer;
  v jsonb;
begin
  select organization_id into org from public.department where id = p_department_id;
  if org is null then raise exception 'department not found' using errcode = 'P0002'; end if;
  perform set_config('app.actor_id', p_actor::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_actor)::text, true);
  if not private.can_on_department('schedule.publish', p_department_id) then
    raise exception 'not allowed to publish' using errcode = '42501';
  end if;
  select count(*) filter (where x ->> 'severity' = 'BLOCKING'),
         count(*) filter (where x ->> 'severity' = 'BLOCKING' and not coalesce((x ->> 'auto_override')::boolean, false)),
         count(*) filter (where x ->> 'severity' = 'WARNING')
    into blocking, needs_override, warnings
  from jsonb_array_elements(p_violations) x;
  if exists (
    select 1 from jsonb_array_elements(p_violations) x
    where x ->> 'severity' = 'BLOCKING' and length(trim(coalesce(x ->> 'override_reason', ''))) < 5
  ) then
    raise exception 'blocking violations need an override reason' using errcode = '23514';
  end if;
  if needs_override > 0 and not private.can_on_department('schedule.override', p_department_id) then
    raise exception 'not allowed to override' using errcode = '42501';
  end if;

  perform set_config('app.publishing', 'on', true);
  update public.shift s set
    published = case when s.archived_at is null then jsonb_build_object(
      'employee_id', s.employee_id, 'start_at', s.start_at, 'end_at', s.end_at,
      'breaks', s.breaks, 'supplement_type_ids', to_jsonb(s.supplement_type_ids),
      'project_allocations', s.project_allocations,
      'posting_allocations', s.posting_allocations,
      'kind', s.kind, 'label', s.label) end,
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
      coalesce(v -> 'details', '{}'::jsonb) || jsonb_build_object('auto_override', coalesce((v ->> 'auto_override')::boolean, false)),
      v ->> 'source', nullif(trim(v ->> 'override_reason'), ''),
      case when v ->> 'severity' = 'BLOCKING' and not coalesce((v ->> 'auto_override')::boolean, false) then p_actor end);
  end loop;
  return pub;
end $function$;

CREATE OR REPLACE FUNCTION public.save_pay_run(p_period_id uuid, p_employee_id uuid, p_engine_version text, p_notes jsonb, p_daily jsonb, p_pending integer, p_lines jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  per public.pay_period;
  run uuid;
begin
  select * into per from public.pay_period where id = p_period_id for update;
  if per.id is null then raise exception 'period not found' using errcode = 'P0002'; end if;
  if not private.has_org_permission(per.organization_id, 'payroll.manage') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if per.status = 'closed' then
    raise exception 'the period is closed and cannot be calculated again' using errcode = '42501';
  end if;
  if not exists (select 1 from public.employee e where e.id = p_employee_id and e.organization_id = per.organization_id) then
    raise exception 'employee not found' using errcode = 'P0002';
  end if;
  perform set_config('app.payroll', 'on', true);
  update public.pay_run set superseded_at = now()
  where pay_period_id = p_period_id and employee_id = p_employee_id and superseded_at is null;
  insert into public.pay_run (organization_id, pay_period_id, employee_id, engine_version, notes, daily_minutes, pending_entries)
  values (per.organization_id, p_period_id, p_employee_id, p_engine_version, coalesce(p_notes, '[]'),
    coalesce(p_daily, '{}'), coalesce(p_pending, 0))
  returning id into run;
  insert into public.pay_line (organization_id, pay_run_id, employee_id, position, pay_code, label, unit,
    quantity_minutes, rate_ore, amount_ore, explanation, posting)
  select per.organization_id, run, p_employee_id, (x.ord)::int, x.l ->> 'pay_code', x.l ->> 'label', x.l ->> 'unit',
    (x.l ->> 'quantity_minutes')::int, (x.l ->> 'rate_ore')::int, (x.l ->> 'amount_ore')::bigint, x.l -> 'explanation',
    coalesce(x.l -> 'posting', '{}'::jsonb)
  from jsonb_array_elements(p_lines) with ordinality as x(l, ord);
  perform set_config('app.payroll', 'off', true);
  return run;
end $function$;

drop function public.time_overview(timestamptz, timestamptz);
CREATE FUNCTION public.time_overview(p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS TABLE(row_kind text, entry_id uuid, shift_id uuid, employee_id uuid, employee_name text, employee_number text, department_id uuid, department_name text, start_at timestamp with time zone, end_at timestamp with time zone, breaks jsonb, project_allocations jsonb, posting_allocations jsonb, status time_entry_status, source time_entry_source, deviation_reason text, note text, offline boolean, approved_at timestamp with time zone, approved_by_email text, version integer, is_mine boolean, plan_start timestamp with time zone, plan_end timestamp with time zone, plan_breaks jsonb, kind time_entry_kind)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with visible_department as (
    select d.id, d.name from public.department d
    where private.is_member(d.organization_id)
  )
  select 'entry', t.id, t.shift_id, t.employee_id, trim(e.first_name || ' ' || e.last_name), e.employee_number,
         t.department_id, vd.name, t.start_at, t.end_at, t.breaks, t.project_allocations, t.posting_allocations, t.status, t.source,
         t.deviation_reason, t.note, t.offline, t.approved_at, u.email::text,
         (with recursive chain as (
            select x.id, x.supersedes_id from public.time_entry x where x.id = t.id
            union all
            select y.id, y.supersedes_id from public.time_entry y join chain c on y.id = c.supersedes_id)
          select count(*)::int from chain),
         private.is_own_employee(t.employee_id),
         (s.published ->> 'start_at')::timestamptz, (s.published ->> 'end_at')::timestamptz, s.published -> 'breaks',
         t.kind
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
         (s.published ->> 'end_at')::timestamptz, s.published -> 'breaks', s.published -> 'project_allocations', coalesce(s.published -> 'posting_allocations', '[]'::jsonb),
         null, null, null, null, false, null, null, 0, private.is_own_employee(e.id),
         (s.published ->> 'start_at')::timestamptz, (s.published ->> 'end_at')::timestamptz, s.published -> 'breaks',
         (s.published ->> 'kind')::public.time_entry_kind
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
$function$;
grant execute on function public.time_overview(timestamptz, timestamptz) to authenticated;

-- Stamping can carry the employee's choice of posting.
drop function public.stamp(uuid, uuid, text, timestamptz);
CREATE FUNCTION public.stamp(p_organization_id uuid, p_client_id uuid, p_action text, p_at timestamp with time zone, p_posting_allocations jsonb DEFAULT NULL::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
      breaks, project_allocations, posting_allocations, kind, source, status, client_id, offline)
    values (p_organization_id, emp, dept, sh.id, at,
      coalesce(sh.published -> 'breaks', '[]'::jsonb), coalesce(sh.published -> 'project_allocations', '[]'::jsonb),
      coalesce(p_posting_allocations, sh.published -> 'posting_allocations', '[]'::jsonb),
      coalesce(sh.published ->> 'kind', 'work')::public.time_entry_kind, 'stamp', 'open', p_client_id, late)
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
      offline = offline or late,
      posting_allocations = coalesce(p_posting_allocations, posting_allocations)
    where id = open_entry.id;
    return open_entry.id;
  end if;
  raise exception 'unknown action' using errcode = '22023';
end $function$;
grant execute on function public.stamp(uuid, uuid, text, timestamptz, jsonb) to authenticated;

-- The recreated functions keep the earlier privileges: authenticated only.
revoke execute on function public.stamp(uuid, uuid, text, timestamptz, jsonb),
  public.correct_time_entry(uuid, timestamptz, timestamptz, jsonb, jsonb, text, jsonb),
  public.time_overview(timestamptz, timestamptz)
  from public, anon;
