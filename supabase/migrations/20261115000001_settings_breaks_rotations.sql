-- Phase 3b: organization settings, multiple breaks per shift, shift
-- supplements and the turnus tool (week and rotation templates).

-- ---------------------------------------------------------------------------
-- Organization settings
-- ---------------------------------------------------------------------------
create table public.organization_settings (
  organization_id uuid primary key references public.organization (id),
  -- Varsling: overrides the agreement's notice rule for the whole organization.
  notice_publish_hours integer check (notice_publish_hours between 0 and 8760),
  notice_change_hours integer check (notice_change_hours between 0 and 8760),
  -- Per violation code: "block" (needs override with reason) or "allow"
  -- (always flagged, permanently overridden). Missing = engine severity.
  rule_handling jsonb not null default '{}'::jsonb check (jsonb_typeof(rule_handling) = 'object'),
  updated_at timestamptz not null default now()
);

insert into public.organization_settings (organization_id) select id from public.organization;

create function private.create_organization_settings() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.organization_settings (organization_id) values (new.id) on conflict do nothing;
  return new;
end $$;
create trigger organization_settings_create after insert on public.organization
  for each row execute function private.create_organization_settings();

create function private.check_rule_handling() returns trigger
language plpgsql set search_path = '' as $$
begin
  if exists (select 1 from jsonb_each_text(new.rule_handling) e where e.value not in ('block', 'allow')) then
    raise exception 'rule_handling values must be block or allow' using errcode = '23514';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger organization_settings_check before insert or update on public.organization_settings
  for each row execute function private.check_rule_handling();

alter table public.organization_settings enable row level security;
create policy organization_settings_select on public.organization_settings for select to authenticated
  using (private.is_member(organization_id));
create policy organization_settings_update on public.organization_settings for update to authenticated
  using (private.has_org_permission(organization_id, 'settings.manage'))
  with check (private.has_org_permission(organization_id, 'settings.manage'));

-- ---------------------------------------------------------------------------
-- Supplement types (vagttillæg)
-- ---------------------------------------------------------------------------
create type public.supplement_amount_type as enum ('per_hour', 'fixed', 'percent');

create table public.supplement_type (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organization (id),
  name text not null check (length(trim(name)) between 1 and 100),
  pay_code text not null check (pay_code ~ '^[A-Z0-9_]{1,32}$'),
  amount_type public.supplement_amount_type not null,
  -- øre for per_hour/fixed, basis points for percent
  amount integer not null check (amount >= 0),
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (organization_id, id)
);
create unique index supplement_type_name_uniq on public.supplement_type (organization_id, lower(name)) where archived_at is null;

alter table public.supplement_type enable row level security;
create policy supplement_type_select on public.supplement_type for select to authenticated
  using (private.is_member(organization_id));
create policy supplement_type_insert on public.supplement_type for insert to authenticated
  with check (private.has_org_permission(organization_id, 'settings.manage'));
create policy supplement_type_update on public.supplement_type for update to authenticated
  using (private.has_org_permission(organization_id, 'settings.manage'))
  with check (private.has_org_permission(organization_id, 'settings.manage'));

-- ---------------------------------------------------------------------------
-- Breaks and supplements on shifts and templates
-- breaks: [{"start_at": iso|null, "minutes": int, "paid": bool}]   (shift)
--         [{"start_time": "HH:MM"|null, "minutes": int, "paid": bool}] (templates/slots)
-- ---------------------------------------------------------------------------
create function private.valid_breaks(b jsonb, max_minutes integer, time_key text)
returns boolean language sql immutable set search_path = '' as $$
  select jsonb_typeof(b) = 'array'
    and not exists (
      select 1 from jsonb_array_elements(b) e
      where jsonb_typeof(e -> 'minutes') <> 'number'
         or (e ->> 'minutes')::numeric <= 0
         or (e ->> 'minutes')::numeric <> floor((e ->> 'minutes')::numeric)
         or jsonb_typeof(coalesce(e -> 'paid', 'false'::jsonb)) <> 'boolean'
         or (e -> time_key is not null and jsonb_typeof(e -> time_key) not in ('string', 'null'))
    )
    and coalesce((select sum((e ->> 'minutes')::integer) from jsonb_array_elements(b) e), 0) < max_minutes;
$$;

alter table public.shift add column breaks jsonb not null default '[]'::jsonb;
alter table public.shift add column supplement_type_ids uuid[] not null default '{}';
update public.shift set breaks = case when break_minutes > 0
  then jsonb_build_array(jsonb_build_object('start_at', null, 'minutes', break_minutes, 'paid', false))
  else '[]'::jsonb end;
update public.shift set published = (published - 'break_minutes') || jsonb_build_object(
  'breaks', case when (published ->> 'break_minutes')::int > 0
    then jsonb_build_array(jsonb_build_object('start_at', null, 'minutes', (published ->> 'break_minutes')::int, 'paid', false))
    else '[]'::jsonb end,
  'supplement_type_ids', '[]'::jsonb)
where published is not null;

alter table public.shift_template add column breaks jsonb not null default '[]'::jsonb;
alter table public.shift_template add column supplement_type_ids uuid[] not null default '{}';
update public.shift_template set breaks = case when break_minutes > 0
  then jsonb_build_array(jsonb_build_object('start_time', null, 'minutes', break_minutes, 'paid', false))
  else '[]'::jsonb end;

-- Functions that return break_minutes are replaced below.
drop function public.published_shifts(timestamptz, timestamptz);
drop function public.shifts_for_validation(uuid[], timestamptz, timestamptz);
alter table public.shift drop column break_minutes;
alter table public.shift_template drop column break_minutes;

alter table public.shift add constraint shift_breaks_valid
  check (private.valid_breaks(breaks, (extract(epoch from end_at - start_at) / 60)::integer, 'start_at'));
alter table public.shift_template add constraint shift_template_breaks_valid
  check (private.valid_breaks(breaks, 1440, 'start_time'));

-- Supplements must belong to the same organization.
create function private.check_supplement_ids() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (
    select 1 from unnest(new.supplement_type_ids) sid
    where not exists (select 1 from public.supplement_type t where t.id = sid and t.organization_id = new.organization_id)
  ) then
    raise exception 'unknown supplement type' using errcode = '23503';
  end if;
  return new;
end $$;
create trigger shift_supplements_check before insert or update of supplement_type_ids on public.shift
  for each row execute function private.check_supplement_ids();
create trigger shift_template_supplements_check before insert or update of supplement_type_ids on public.shift_template
  for each row execute function private.check_supplement_ids();

-- Editing breaks or supplements also turns a published shift into a draft.
create or replace function private.shift_before_write() returns trigger
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
      if (new.employee_id, new.start_at, new.end_at, new.breaks, new.supplement_type_ids, new.kind, new.label, new.department_id, new.archived_at)
         is distinct from
         (old.employee_id, old.start_at, old.end_at, old.breaks, old.supplement_type_ids, old.kind, old.label, old.department_id, old.archived_at) then
        new.status := 'draft';
      else
        new.status := old.status;
      end if;
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Turnus: week and rotation templates
-- ---------------------------------------------------------------------------
create table public.rotation (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organization (id),
  department_id uuid not null,
  name text not null check (length(trim(name)) between 1 and 100),
  length_weeks integer not null check (length_weeks between 1 and 52),
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (organization_id, id),
  foreign key (organization_id, department_id) references public.department (organization_id, id)
);

create table public.rotation_line (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  rotation_id uuid not null,
  position integer not null check (position >= 0),
  name text not null check (length(trim(name)) between 1 and 60),
  unique (organization_id, id),
  foreign key (organization_id, rotation_id) references public.rotation (organization_id, id) on delete cascade
);

create table public.rotation_slot (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  rotation_id uuid not null,
  line_id uuid not null,
  week_index integer not null check (week_index between 0 and 51),
  weekday integer not null check (weekday between 1 and 7),
  start_time time not null,
  end_time time not null,
  kind public.shift_kind not null default 'work',
  label text check (label is null or length(label) <= 60),
  breaks jsonb not null default '[]'::jsonb check (private.valid_breaks(breaks, 1440, 'start_time')),
  supplement_type_ids uuid[] not null default '{}',
  unique (organization_id, id),
  foreign key (organization_id, rotation_id) references public.rotation (organization_id, id) on delete cascade,
  foreign key (organization_id, line_id) references public.rotation_line (organization_id, id) on delete cascade,
  check (start_time <> end_time)
);
create index rotation_slot_rotation_idx on public.rotation_slot (rotation_id, week_index, weekday);
create trigger rotation_slot_supplements_check before insert or update of supplement_type_ids on public.rotation_slot
  for each row execute function private.check_supplement_ids();

create table public.rotation_rollout (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  rotation_id uuid not null,
  department_id uuid not null,
  start_date date not null check (extract(isodow from start_date) = 1),
  weeks integer not null check (weeks between 1 and 104),
  -- [{"line_id": uuid, "employee_id": uuid|null, "start_week": int}]
  assignments jsonb not null check (jsonb_typeof(assignments) = 'array'),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, rotation_id) references public.rotation (organization_id, id),
  foreign key (organization_id, department_id) references public.department (organization_id, id)
);

alter table public.shift add column rollout_id uuid;
alter table public.shift add column rotation_slot_id uuid;
alter table public.shift add constraint shift_rollout_fk foreign key (organization_id, rollout_id)
  references public.rotation_rollout (organization_id, id);
create index shift_rollout_idx on public.shift (rollout_id);

create function private.rotation_department(rot uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select department_id from public.rotation where id = rot;
$$;
grant execute on function private.rotation_department(uuid) to authenticated;

alter table public.rotation enable row level security;
alter table public.rotation_line enable row level security;
alter table public.rotation_slot enable row level security;
alter table public.rotation_rollout enable row level security;

create policy rotation_select on public.rotation for select to authenticated
  using (private.can_on_department('schedule.view', department_id) or private.can_on_department('schedule.manage', department_id));
create policy rotation_insert on public.rotation for insert to authenticated
  with check (private.can_on_department('schedule.manage', department_id));
create policy rotation_update on public.rotation for update to authenticated
  using (private.can_on_department('schedule.manage', department_id))
  with check (private.can_on_department('schedule.manage', department_id));

-- Lines and slots are template configuration: they may be deleted (audited).
do $$
declare
  t text;
begin
  foreach t in array array['rotation_line', 'rotation_slot'] loop
    execute format($f$
      create policy %1$s_select on public.%1$s for select to authenticated
        using (private.can_on_department('schedule.view', private.rotation_department(rotation_id))
            or private.can_on_department('schedule.manage', private.rotation_department(rotation_id)));
      create policy %1$s_insert on public.%1$s for insert to authenticated
        with check (private.can_on_department('schedule.manage', private.rotation_department(rotation_id)));
      create policy %1$s_update on public.%1$s for update to authenticated
        using (private.can_on_department('schedule.manage', private.rotation_department(rotation_id)))
        with check (private.can_on_department('schedule.manage', private.rotation_department(rotation_id)));
      create policy %1$s_delete on public.%1$s for delete to authenticated
        using (private.can_on_department('schedule.manage', private.rotation_department(rotation_id)));
    $f$, t);
  end loop;
end $$;

create policy rotation_rollout_select on public.rotation_rollout for select to authenticated
  using (private.can_on_department('schedule.view', department_id) or private.can_on_department('schedule.manage', department_id));
create policy rotation_rollout_insert on public.rotation_rollout for insert to authenticated
  with check (private.can_on_department('schedule.manage', department_id)
              and private.rotation_department(rotation_id) = department_id);

do $$
declare
  t text;
begin
  foreach t in array array['organization_settings', 'supplement_type', 'rotation', 'rotation_line', 'rotation_slot', 'rotation_rollout'] loop
    execute format('create trigger %I after insert or update or delete on public.%I
      for each row execute function private.audit_row()', t || '_audit', t);
  end loop;
  foreach t in array array['supplement_type', 'rotation', 'rotation_line', 'rotation_slot'] loop
    execute format('create trigger %I before update on public.%I
      for each row execute function private.forbid_org_change()', t || '_org_immutable', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- RPCs updated for breaks/supplements
-- ---------------------------------------------------------------------------
create function public.published_shifts(p_from timestamptz, p_to timestamptz)
returns table (
  id uuid, department_id uuid, department_name text, employee_id uuid, employee_name text,
  start_at timestamptz, end_at timestamptz, breaks jsonb, kind public.shift_kind,
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
         coalesce(s.published -> 'breaks', '[]'::jsonb), (s.published ->> 'kind')::public.shift_kind,
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

create function public.shifts_for_validation(p_employee_ids uuid[], p_from timestamptz, p_to timestamptz)
returns table (id uuid, employee_id uuid, department_id uuid, start_at timestamptz, end_at timestamptz,
               breaks jsonb, kind public.shift_kind, status public.shift_status)
language sql stable security definer set search_path = '' as $$
  select s.id, s.employee_id, s.department_id, s.start_at, s.end_at, s.breaks, s.kind, s.status
  from public.shift s
  where s.employee_id = any (p_employee_ids)
    and s.archived_at is null
    and s.start_at < p_to and s.end_at > p_from
    and (private.can_on_employee('schedule.view', s.employee_id)
         or private.can_on_employee('schedule.manage', s.employee_id));
$$;
grant execute on function public.shifts_for_validation(uuid[], timestamptz, timestamptz) to authenticated;

-- Publishing: snapshot includes breaks and supplements; violations that the
-- organization overrides permanently ("auto_override") do not require the
-- schedule.override permission.
create or replace function public.publish_schedule(
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
end $$;

alter publication supabase_realtime add table public.rotation_slot;
