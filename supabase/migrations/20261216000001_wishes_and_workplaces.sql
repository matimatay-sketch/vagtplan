-- Two settings for the employees:
--
-- 1. Wishes (availability) can be switched off: for the organization, and per
--    department (null = follow the organization). An employee can make new
--    wishes when at least one of their departments allows them. Wishes already
--    made are kept, and planning ignores them while they are off.
--
-- 2. Stamping only at the workplace: with geofence_enabled, the app sends the
--    device's position when stamping, and `stamp` turns the stamp down when it
--    is not within the radius of a workplace the employee belongs to
--    (workplaces linked to their departments, plus workplaces with no
--    departments). Only the nearest workplace and the distance are stored,
--    never the coordinates. Employees with stamp_anywhere (e.g. drivers) and
--    stamps through the API (terminals) are not checked.
--    TODO(jura): position registration is a control measure; employees must be
--    told in advance (docs/jura-todo.md nr. 43).

-- ---------------------------------------------------------------------------
-- Wishes on/off.

alter table public.organization_settings
  add column availability_enabled boolean not null default true,
  add column geofence_enabled boolean not null default false;

alter table public.department add column availability_enabled boolean;

-- Whether the employee may make new wishes.
create function private.availability_allowed(emp uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select case
    when exists (select 1 from public.employee_department ed where ed.employee_id = emp) then
      exists (
        select 1
        from public.employee_department ed
        join public.department d on d.id = ed.department_id
        join public.organization_settings s on s.organization_id = d.organization_id
        where ed.employee_id = emp and d.archived_at is null
          and coalesce(d.availability_enabled, s.availability_enabled))
    else coalesce((select s.availability_enabled
                   from public.employee e
                   join public.organization_settings s on s.organization_id = e.organization_id
                   where e.id = emp), true)
  end;
$$;
grant execute on function private.availability_allowed(uuid) to authenticated;

-- For the app: whether the employee may make wishes (themselves, or a planner of theirs).
create function public.availability_allowed(p_employee_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select case when private.is_self(p_employee_id)
                or private.can_on_employee('schedule.view', p_employee_id)
                or private.can_on_employee('schedule.manage', p_employee_id)
         then private.availability_allowed(p_employee_id) end;
$$;
revoke execute on function public.availability_allowed(uuid) from public, anon;
grant execute on function public.availability_allowed(uuid) to authenticated;

drop policy availability_insert on public.availability;
create policy availability_insert on public.availability for insert to authenticated
  with check (private.is_self(employee_id) and private.availability_allowed(employee_id));

-- ---------------------------------------------------------------------------
-- Workplaces.

create table public.workplace (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organization (id),
  name text not null check (length(btrim(name)) between 1 and 100),
  address text check (address is null or length(address) <= 200),
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  radius_m integer not null default 200 check (radius_m between 25 and 5000),
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (organization_id, id)
);
create index workplace_org_idx on public.workplace (organization_id) where archived_at is null;
create trigger workplace_audit after insert or update or delete on public.workplace
  for each row execute function private.audit_row();
create trigger workplace_org_immutable before update on public.workplace
  for each row execute function private.forbid_org_change();
alter table public.workplace enable row level security;
create policy workplace_select on public.workplace for select to authenticated
  using (private.is_member(organization_id));
create policy workplace_insert on public.workplace for insert to authenticated
  with check (private.has_org_permission(organization_id, 'settings.manage'));
create policy workplace_update on public.workplace for update to authenticated
  using (private.has_org_permission(organization_id, 'settings.manage'))
  with check (private.has_org_permission(organization_id, 'settings.manage'));

-- Configuration: links may be deleted (audited).
create table public.workplace_department (
  organization_id uuid not null references public.organization (id),
  workplace_id uuid not null,
  department_id uuid not null,
  primary key (workplace_id, department_id),
  foreign key (organization_id, workplace_id) references public.workplace (organization_id, id),
  foreign key (organization_id, department_id) references public.department (organization_id, id)
);
create index workplace_department_dept_idx on public.workplace_department (department_id);
create trigger workplace_department_audit after insert or update or delete on public.workplace_department
  for each row execute function private.audit_row();
alter table public.workplace_department enable row level security;
create policy workplace_department_select on public.workplace_department for select to authenticated
  using (private.is_member(organization_id));
create policy workplace_department_insert on public.workplace_department for insert to authenticated
  with check (private.has_org_permission(organization_id, 'settings.manage'));
create policy workplace_department_delete on public.workplace_department for delete to authenticated
  using (private.has_org_permission(organization_id, 'settings.manage'));

-- Saves a workplace and its departments in one go (security invoker: RLS applies).
create function public.save_workplace(p_organization_id uuid, p_name text,
  p_latitude double precision, p_longitude double precision, p_radius_m integer,
  p_department_ids uuid[] default '{}', p_id uuid default null, p_address text default null)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  wid uuid := p_id;
begin
  if wid is null then
    insert into public.workplace (organization_id, name, address, latitude, longitude, radius_m)
    values (p_organization_id, btrim(p_name), nullif(btrim(coalesce(p_address, '')), ''),
            p_latitude, p_longitude, p_radius_m)
    returning id into wid;
  else
    update public.workplace set name = btrim(p_name), address = nullif(btrim(coalesce(p_address, '')), ''),
      latitude = p_latitude, longitude = p_longitude, radius_m = p_radius_m
    where id = wid and organization_id = p_organization_id and archived_at is null;
    if not found then raise exception 'workplace not found' using errcode = '42501'; end if;
    delete from public.workplace_department
    where workplace_id = wid and not (department_id = any (coalesce(p_department_ids, '{}')));
  end if;
  insert into public.workplace_department (organization_id, workplace_id, department_id)
  select p_organization_id, wid, d from unnest(coalesce(p_department_ids, '{}')) d
  on conflict do nothing;
  return wid;
end $$;
revoke execute on function public.save_workplace(uuid, text, double precision, double precision, integer, uuid[], uuid, text) from public, anon;
grant execute on function public.save_workplace(uuid, text, double precision, double precision, integer, uuid[], uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Stamping with position.

alter table public.employee add column stamp_anywhere boolean not null default false;

alter table public.time_entry
  add column start_workplace_id uuid references public.workplace (id),
  add column start_distance_m integer check (start_distance_m >= 0),
  add column end_workplace_id uuid references public.workplace (id),
  add column end_distance_m integer check (end_distance_m >= 0);

-- Only `stamp` sets where a stamp was made.
create function private.time_entry_location_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if coalesce(current_setting('app.stamp_location', true), '') <> 'on' and (
       (tg_op = 'INSERT' and (new.start_workplace_id is not null or new.start_distance_m is not null
                              or new.end_workplace_id is not null or new.end_distance_m is not null))
    or (tg_op = 'UPDATE' and (new.start_workplace_id is distinct from old.start_workplace_id
                              or new.start_distance_m is distinct from old.start_distance_m
                              or new.end_workplace_id is distinct from old.end_workplace_id
                              or new.end_distance_m is distinct from old.end_distance_m))) then
    raise exception 'the stamp location is set by stamping only' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger time_entry_location_guard before insert or update on public.time_entry
  for each row execute function private.time_entry_location_guard();

-- Great-circle distance in metres.
create function private.distance_m(lat1 double precision, lon1 double precision,
  lat2 double precision, lon2 double precision)
returns double precision language sql immutable set search_path = '' as $$
  select 2 * 6371008.8 * asin(least(1, sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2)
    + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lon2 - lon1) / 2), 2))));
$$;

-- The workplace the stamp is made at. Raises when the organization requires
-- stamping at the workplace and the position is missing or too far away.
-- The device's stated accuracy is allowed on top of the radius, up to 100 m.
create function private.stamp_location(p_organization_id uuid, emp uuid,
  p_latitude double precision, p_longitude double precision, p_accuracy double precision,
  out workplace_id uuid, out distance_m integer)
language plpgsql stable security definer set search_path = '' as $$
declare
  w record;
  slack double precision := least(greatest(coalesce(p_accuracy, 0), 0), 100);
begin
  if not coalesce((select s.geofence_enabled from public.organization_settings s
                   where s.organization_id = p_organization_id), false)
     or coalesce((select e.stamp_anywhere from public.employee e where e.id = emp), false) then
    return;
  end if;
  if p_latitude is null or p_longitude is null
     or p_latitude not between -90 and 90 or p_longitude not between -180 and 180 then
    raise exception 'position required' using errcode = 'P0001', hint = 'location_required';
  end if;
  select x.id, x.radius_m,
         private.distance_m(p_latitude, p_longitude, x.latitude, x.longitude) as dist
  into w
  from public.workplace x
  where x.organization_id = p_organization_id and x.archived_at is null
    and (not exists (select 1 from public.workplace_department wd where wd.workplace_id = x.id)
         or exists (select 1 from public.workplace_department wd
                    join public.employee_department ed on ed.department_id = wd.department_id
                    where wd.workplace_id = x.id and ed.employee_id = emp))
  order by private.distance_m(p_latitude, p_longitude, x.latitude, x.longitude) - x.radius_m
  limit 1;
  if w.id is null then
    raise exception 'no workplace' using errcode = 'P0001', hint = 'no_workplace';
  end if;
  if w.dist - slack > w.radius_m then
    raise exception 'outside the workplace' using errcode = 'P0001', hint = 'outside_workplace';
  end if;
  workplace_id := w.id;
  distance_m := round(w.dist)::integer;
end $$;

drop function public.stamp(uuid, uuid, text, timestamptz, jsonb);
create function public.stamp(p_organization_id uuid, p_client_id uuid, p_action text,
  p_at timestamptz, p_posting_allocations jsonb default null,
  p_latitude double precision default null, p_longitude double precision default null,
  p_accuracy double precision default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  emp uuid;
  existing uuid;
  loc record;
  entry uuid;
begin
  select e.id into emp from public.employee e
  where e.organization_id = p_organization_id and e.user_id = (select auth.uid()) and e.archived_at is null;
  if emp is null or not private.is_member(p_organization_id) then
    raise exception 'not an employee' using errcode = '42501';
  end if;
  -- A replay of a stamp already received returns it without checking again.
  select id into existing from public.time_entry
  where organization_id = p_organization_id and (client_id = p_client_id or end_client_id = p_client_id);
  if existing is not null then return existing; end if;

  select * into loc from private.stamp_location(p_organization_id, emp, p_latitude, p_longitude, p_accuracy);
  entry := private.stamp_for(p_organization_id, emp, p_client_id, p_action, p_at, p_posting_allocations);
  if loc.workplace_id is not null then
    perform set_config('app.stamp_location', 'on', true);
    if p_action = 'in' then
      update public.time_entry set start_workplace_id = loc.workplace_id, start_distance_m = loc.distance_m
      where id = entry;
    else
      update public.time_entry set end_workplace_id = loc.workplace_id, end_distance_m = loc.distance_m
      where id = entry;
    end if;
    perform set_config('app.stamp_location', 'off', true);
  end if;
  return entry;
end $$;
revoke execute on function public.stamp(uuid, uuid, text, timestamptz, jsonb, double precision, double precision, double precision) from public, anon;
grant execute on function public.stamp(uuid, uuid, text, timestamptz, jsonb, double precision, double precision, double precision) to authenticated;
