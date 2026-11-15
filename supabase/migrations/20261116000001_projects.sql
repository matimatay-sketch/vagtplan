-- Project registration on shifts.
--
-- project_allocations on a shift:
--   [{"project_id": uuid, "start_at": iso|null, "end_at": iso|null, "minutes": int|null}]
-- A row is a time span, a number of minutes, or "the rest of the shift".
-- Templates and rotation slots carry a default project for the whole shift.

insert into public.permission (key, allowed_scopes, sort_order) values
  ('projects.view', '{departments,organization}', 150),
  ('projects.manage', '{organization}', 160);

insert into public.permission_grant (organization_id, profile_id, permission, scope)
select p.organization_id, p.id, k.key, 'organization'
from public.permission_profile p
cross join (values ('projects.view'), ('projects.manage')) as k(key)
where p.is_owner
on conflict do nothing;

insert into public.permission_grant (organization_id, profile_id, permission, scope)
select p.organization_id, p.id, 'projects.view', 'departments'
from public.permission_profile p
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
  values (org, 'Leder', 'Medarbejdere, kontrakter, vagtplan og projekttimer i de afdelinger, brugeren er ansvarlig for.')
  returning id into m;
  insert into public.permission_grant (organization_id, profile_id, permission, scope)
  select org, m, k, 'departments' from unnest(array[
    'employees.view', 'employees.manage', 'employees.invite', 'contracts.view', 'contracts.manage',
    'schedule.view', 'schedule.manage', 'schedule.publish', 'schedule.override', 'projects.view'
  ]) as k;

  insert into public.permission_profile (organization_id, name, description)
  values (org, 'Medarbejder', 'Ser egne oplysninger og den offentliggjorte vagtplan for egne afdelinger.')
  returning id into e;

  update public.organization set default_profile_id = e where id = org;
  perform set_config('app.bootstrap', 'off', true);
  return query select o, m, e;
end $$;

-- ---------------------------------------------------------------------------
create table public.project (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organization (id),
  number text not null check (length(trim(number)) between 1 and 40),
  name text not null check (length(trim(name)) between 1 and 120),
  customer text check (customer is null or length(customer) <= 120),
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (organization_id, id)
);
create unique index project_number_uniq on public.project (organization_id, lower(number)) where archived_at is null;

-- Empty = available in all departments.
create table public.project_department (
  organization_id uuid not null,
  project_id uuid not null,
  department_id uuid not null,
  primary key (project_id, department_id),
  foreign key (organization_id, project_id) references public.project (organization_id, id),
  foreign key (organization_id, department_id) references public.department (organization_id, id)
);

alter table public.project enable row level security;
alter table public.project_department enable row level security;
create policy project_select on public.project for select to authenticated
  using (private.is_member(organization_id));
create policy project_insert on public.project for insert to authenticated
  with check (private.has_org_permission(organization_id, 'projects.manage'));
create policy project_update on public.project for update to authenticated
  using (private.has_org_permission(organization_id, 'projects.manage'))
  with check (private.has_org_permission(organization_id, 'projects.manage'));
create policy project_department_select on public.project_department for select to authenticated
  using (private.is_member(organization_id));
create policy project_department_insert on public.project_department for insert to authenticated
  with check (private.has_org_permission(organization_id, 'projects.manage'));
create policy project_department_delete on public.project_department for delete to authenticated
  using (private.has_org_permission(organization_id, 'projects.manage'));

-- ---------------------------------------------------------------------------
alter table public.shift add column project_allocations jsonb not null default '[]'::jsonb
  check (jsonb_typeof(project_allocations) = 'array');
alter table public.shift_template add column project_id uuid;
alter table public.shift_template add constraint shift_template_project_fk
  foreign key (organization_id, project_id) references public.project (organization_id, id);
alter table public.rotation_slot add column project_id uuid;
alter table public.rotation_slot add constraint rotation_slot_project_fk
  foreign key (organization_id, project_id) references public.project (organization_id, id);

-- Projects on a shift must belong to the organization and be allowed in the
-- shift's department (when the project is limited to departments).
create function private.check_project_allocations() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  pid uuid;
begin
  for pid in select (e ->> 'project_id')::uuid from jsonb_array_elements(new.project_allocations) e loop
    if not exists (select 1 from public.project p where p.id = pid and p.organization_id = new.organization_id) then
      raise exception 'unknown project' using errcode = '23503';
    end if;
    if exists (select 1 from public.project_department pd where pd.project_id = pid)
       and not exists (select 1 from public.project_department pd where pd.project_id = pid and pd.department_id = new.department_id) then
      raise exception 'project not available in this department' using errcode = '23514';
    end if;
  end loop;
  return new;
end $$;
create trigger shift_projects_check before insert or update of project_allocations, department_id on public.shift
  for each row execute function private.check_project_allocations();

-- Project changes also turn a published shift into a draft.
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
      if (new.employee_id, new.start_at, new.end_at, new.breaks, new.supplement_type_ids, new.project_allocations, new.kind, new.label, new.department_id, new.archived_at)
         is distinct from
         (old.employee_id, old.start_at, old.end_at, old.breaks, old.supplement_type_ids, old.project_allocations, old.kind, old.label, old.department_id, old.archived_at) then
        new.status := 'draft';
      else
        new.status := old.status;
      end if;
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;

do $$
declare
  t text;
begin
  foreach t in array array['project', 'project_department'] loop
    execute format('create trigger %I after insert or update or delete on public.%I
      for each row execute function private.audit_row()', t || '_audit', t);
  end loop;
  execute 'create trigger project_org_immutable before update on public.project
    for each row execute function private.forbid_org_change()';
end $$;

-- Planned shifts with project data for the project overview (working copy,
-- in departments the caller may see project hours for). Returns the names
-- needed for the report, since projects.view does not imply employees.view.
create function public.project_shifts(p_from timestamptz, p_to timestamptz)
returns table (id uuid, department_id uuid, department_name text, employee_id uuid,
               employee_number text, employee_name text, start_at timestamptz, end_at timestamptz,
               breaks jsonb, project_allocations jsonb, status public.shift_status, kind public.shift_kind)
language sql stable security definer set search_path = '' as $$
  select s.id, s.department_id, d.name, s.employee_id, e.employee_number,
         nullif(trim(coalesce(e.first_name, '') || ' ' || coalesce(e.last_name, '')), ''),
         s.start_at, s.end_at, s.breaks, s.project_allocations, s.status, s.kind
  from public.shift s
  join public.department d on d.id = s.department_id
  left join public.employee e on e.id = s.employee_id
  where s.archived_at is null
    and jsonb_array_length(s.project_allocations) > 0
    and s.start_at >= p_from and s.start_at < p_to
    and private.can_on_department('projects.view', s.department_id);
$$;
grant execute on function public.project_shifts(timestamptz, timestamptz) to authenticated;

-- Publish snapshot including projects.
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
      'project_allocations', s.project_allocations,
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
