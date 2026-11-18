-- Projects become a posting dimension ("Projekt").
--
-- Each organization gets at most one dimension marked is_project. Projects are
-- its values (code = project number, description = customer), with the same
-- ids as the old projects, so references stay valid. Project allocations on
-- shifts (incl. the published snapshot), time entries (incl. approved ones),
-- templates and rotation slots are moved into posting. Pay lines are then
-- split per project like any other dimension.
--
-- The old tables and columns (project, project_department, project_allocations,
-- project_id) are kept for history but no longer written by the app.

alter table public.posting_dimension add column is_project boolean not null default false;
create unique index posting_dimension_project_uniq on public.posting_dimension (organization_id)
  where is_project and archived_at is null;
alter table public.posting_value add column description text
  check (description is null or length(description) <= 120);

create function private.project_dimension(org uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select id from public.posting_dimension
  where organization_id = org and is_project and archived_at is null;
$$;

-- projects.manage may maintain the project dimension and its values; posting.manage all.
create function private.can_manage_dimension(org uuid, dim uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.has_org_permission(org, 'posting.manage')
      or (private.has_org_permission(org, 'projects.manage')
          and exists (select 1 from public.posting_dimension d
                      where d.id = dim and d.organization_id = org and d.is_project));
$$;

drop policy posting_dimension_insert on public.posting_dimension;
drop policy posting_dimension_update on public.posting_dimension;
create policy posting_dimension_insert on public.posting_dimension for insert to authenticated
  with check (private.has_org_permission(organization_id, 'posting.manage')
              or (is_project and private.has_org_permission(organization_id, 'projects.manage')));
create policy posting_dimension_update on public.posting_dimension for update to authenticated
  using (private.can_manage_dimension(organization_id, id))
  with check (private.can_manage_dimension(organization_id, id));

drop policy posting_value_insert on public.posting_value;
drop policy posting_value_update on public.posting_value;
create policy posting_value_insert on public.posting_value for insert to authenticated
  with check (private.can_manage_dimension(organization_id, dimension_id));
create policy posting_value_update on public.posting_value for update to authenticated
  using (private.can_manage_dimension(organization_id, dimension_id))
  with check (private.can_manage_dimension(organization_id, dimension_id));

drop policy posting_value_department_insert on public.posting_value_department;
drop policy posting_value_department_delete on public.posting_value_department;
create policy posting_value_department_insert on public.posting_value_department for insert to authenticated
  with check (private.can_manage_dimension(organization_id,
    (select v.dimension_id from public.posting_value v where v.id = value_id)));
create policy posting_value_department_delete on public.posting_value_department for delete to authenticated
  using (private.can_manage_dimension(organization_id,
    (select v.dimension_id from public.posting_value v where v.id = value_id)));

-- Templates and rotation slots: default posting for the whole shift.
alter table public.shift_template add column posting_values jsonb not null default '{}'::jsonb
  check (jsonb_typeof(posting_values) = 'object');
alter table public.rotation_slot add column posting_values jsonb not null default '{}'::jsonb
  check (jsonb_typeof(posting_values) = 'object');
create function private.check_posting_values() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.check_posting(new.organization_id,
    (to_jsonb(new) ->> 'department_id')::uuid, new.posting_values);
  return new;
end $$;
create trigger shift_template_posting_check before insert or update of posting_values on public.shift_template
  for each row execute function private.check_posting_values();
create trigger rotation_slot_posting_check before insert or update of posting_values on public.rotation_slot
  for each row execute function private.check_posting_values();

-- ---------------------------------------------------------------------------
-- Data migration.

-- project_allocations → posting rows, combined with an existing posting.
-- A posting that is a single "rest" row is merged into every project row (and
-- kept for the time without a project); anything more complex is left as it is.
create function private.projects_to_posting(proj jsonb, posting jsonb, dim uuid) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare
  base jsonb := '{}'::jsonb;
  rows jsonb;
begin
  if dim is null or proj is null or jsonb_array_length(proj) = 0 then
    return coalesce(posting, '[]'::jsonb);
  end if;
  if jsonb_array_length(coalesce(posting, '[]'::jsonb)) > 0 then
    if jsonb_array_length(posting) = 1
       and posting -> 0 ->> 'start_at' is null and posting -> 0 ->> 'end_at' is null
       and posting -> 0 ->> 'minutes' is null then
      base := coalesce(posting -> 0 -> 'values', '{}'::jsonb);
    else
      raise notice 'kept posting, projects not merged: %', posting;
      return posting;
    end if;
  end if;
  select jsonb_agg(jsonb_build_object(
           'values', base || jsonb_build_object(dim::text, p ->> 'project_id'),
           'start_at', p -> 'start_at', 'end_at', p -> 'end_at', 'minutes', p -> 'minutes'))
    into rows
  from jsonb_array_elements(proj) p;
  if base <> '{}'::jsonb and not exists (
    select 1 from jsonb_array_elements(proj) p
    where p ->> 'start_at' is null and p ->> 'end_at' is null and p ->> 'minutes' is null
  ) then
    rows := rows || jsonb_build_array(jsonb_build_object(
      'values', base, 'start_at', null, 'end_at', null, 'minutes', null));
  end if;
  return rows;
end $$;

do $$
declare
  org uuid;
  dim uuid;
begin
  perform set_config('app.publishing', 'on', true);
  perform set_config('app.time_system', 'on', true);
  for org in select distinct organization_id from public.project loop
    select id into dim from public.posting_dimension
      where organization_id = org and key = 'projekt' and archived_at is null;
    if dim is null then
      insert into public.posting_dimension (organization_id, key, name, is_project, sort_order)
      values (org, 'projekt', 'Projekt', true, -1) returning id into dim;
    else
      update public.posting_dimension set is_project = true where id = dim;
    end if;

    insert into public.posting_value (id, organization_id, dimension_id, code, name, description, created_at, archived_at)
    select p.id, p.organization_id, dim, p.number, p.name, p.customer, p.created_at, p.archived_at
    from public.project p where p.organization_id = org
    on conflict (id) do nothing;
    insert into public.posting_value_department (organization_id, value_id, department_id)
    select pd.organization_id, pd.project_id, pd.department_id
    from public.project_department pd where pd.organization_id = org
    on conflict do nothing;

    update public.shift s set
      posting_allocations = private.projects_to_posting(s.project_allocations, s.posting_allocations, dim),
      published = case when s.published is null then null else s.published || jsonb_build_object(
        'posting_allocations', private.projects_to_posting(
          s.published -> 'project_allocations', coalesce(s.published -> 'posting_allocations', '[]'::jsonb), dim)) end
    where s.organization_id = org
      and (jsonb_array_length(s.project_allocations) > 0
           or jsonb_array_length(coalesce(s.published -> 'project_allocations', '[]'::jsonb)) > 0);

    update public.time_entry t set
      posting_allocations = private.projects_to_posting(t.project_allocations, t.posting_allocations, dim)
    where t.organization_id = org and jsonb_array_length(t.project_allocations) > 0;

    update public.shift_template set posting_values = posting_values || jsonb_build_object(dim::text, project_id)
    where organization_id = org and project_id is not null;
    update public.rotation_slot set posting_values = posting_values || jsonb_build_object(dim::text, project_id)
    where organization_id = org and project_id is not null;
  end loop;
  perform set_config('app.publishing', 'off', true);
  perform set_config('app.time_system', 'off', true);
end $$;

-- ---------------------------------------------------------------------------
-- The project overview reads posting rows of the project dimension.

drop function public.project_shifts(timestamptz, timestamptz);
create function public.project_shifts(p_from timestamptz, p_to timestamptz)
returns table (id uuid, department_id uuid, department_name text, employee_id uuid,
               employee_number text, employee_name text, start_at timestamptz, end_at timestamptz,
               breaks jsonb, posting_allocations jsonb, status public.shift_status, kind public.shift_kind)
language sql stable security definer set search_path = '' as $$
  select s.id, s.department_id, d.name, s.employee_id, e.employee_number,
         nullif(trim(coalesce(e.first_name, '') || ' ' || coalesce(e.last_name, '')), ''),
         s.start_at, s.end_at, s.breaks, s.posting_allocations, s.status, s.kind
  from public.shift s
  join public.department d on d.id = s.department_id
  left join public.employee e on e.id = s.employee_id
  where s.archived_at is null
    and exists (select 1 from jsonb_array_elements(s.posting_allocations) r
                where r -> 'values' ? private.project_dimension(s.organization_id)::text)
    and s.start_at >= p_from and s.start_at < p_to
    and private.can_on_department('projects.view', s.department_id);
$$;

drop function public.project_time_entries(timestamptz, timestamptz);
create function public.project_time_entries(p_from timestamptz, p_to timestamptz)
returns table (id uuid, department_id uuid, department_name text, employee_id uuid,
               employee_number text, employee_name text, start_at timestamptz, end_at timestamptz,
               breaks jsonb, posting_allocations jsonb, status public.time_entry_status)
language sql stable security definer set search_path = '' as $$
  select t.id, t.department_id, d.name, t.employee_id, e.employee_number,
         trim(e.first_name || ' ' || e.last_name), t.start_at, t.end_at, t.breaks, t.posting_allocations, t.status
  from public.time_entry t
  join public.department d on d.id = t.department_id
  join public.employee e on e.id = t.employee_id
  where t.superseded_at is null and t.archived_at is null and t.end_at is not null
    and exists (select 1 from jsonb_array_elements(t.posting_allocations) r
                where r -> 'values' ? private.project_dimension(t.organization_id)::text)
    and t.start_at >= p_from and t.start_at < p_to
    and private.can_on_department('projects.view', t.department_id);
$$;

revoke execute on function public.project_shifts(timestamptz, timestamptz),
  public.project_time_entries(timestamptz, timestamptz) from public, anon;
grant execute on function public.project_shifts(timestamptz, timestamptz),
  public.project_time_entries(timestamptz, timestamptz) to authenticated;
