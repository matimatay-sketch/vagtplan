-- Competences (kompetencer og certifikater) and taking open shifts.
--
-- A competence is held by an employee for a period (valid_from–valid_to, e.g.
-- a certificate that expires), optionally with the certificate as a file. A
-- shift (and a template) can require competences. An employee can only take an
-- open shift, or get a shift through a swap, when they hold every required
-- competence on the shift's date. Leaders can still plan anyone; the board
-- warns.
--
-- Open shifts (published without an employee) can be taken by employees of the
-- department: directly, or as a request the department's leader approves
-- (department.open_shift_requires_approval, like swaps). The app checks the
-- working-time rules first and then calls the functions with the service role.

create table public.competence (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organization (id),
  name text not null check (length(btrim(name)) between 1 and 80),
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (organization_id, id)
);
create unique index competence_name_idx on public.competence (organization_id, lower(name))
  where archived_at is null;
create trigger competence_audit after insert or update or delete on public.competence
  for each row execute function private.audit_row();
create trigger competence_org_immutable before update on public.competence
  for each row execute function private.forbid_org_change();
alter table public.competence enable row level security;
create policy competence_select on public.competence for select to authenticated
  using (private.is_member(organization_id));
create policy competence_insert on public.competence for insert to authenticated
  with check (private.has_org_permission(organization_id, 'settings.manage'));
create policy competence_update on public.competence for update to authenticated
  using (private.has_org_permission(organization_id, 'settings.manage'))
  with check (private.has_org_permission(organization_id, 'settings.manage'));

create table public.employee_competence (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organization (id),
  employee_id uuid not null,
  competence_id uuid not null,
  valid_from date not null default current_date,
  valid_to date,
  -- Path in the "certificates" bucket: <organization_id>/<employee_id>/<file>.
  document_path text check (document_path is null or length(document_path) <= 300),
  note text check (note is null or length(note) <= 300),
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  foreign key (organization_id, employee_id) references public.employee (organization_id, id),
  foreign key (organization_id, competence_id) references public.competence (organization_id, id),
  check (valid_to is null or valid_to >= valid_from)
);
create index employee_competence_emp_idx on public.employee_competence (employee_id) where archived_at is null;
create trigger employee_competence_audit after insert or update or delete on public.employee_competence
  for each row execute function private.audit_row();
create trigger employee_competence_org_immutable before update on public.employee_competence
  for each row execute function private.forbid_org_change();
alter table public.employee_competence enable row level security;
create policy employee_competence_select on public.employee_competence for select to authenticated
  using (private.is_self(employee_id)
         or private.can_on_employee('employees.view', employee_id)
         or private.can_on_employee('employees.manage', employee_id)
         or private.can_on_employee('schedule.manage', employee_id));
create policy employee_competence_insert on public.employee_competence for insert to authenticated
  with check (private.can_on_employee('employees.manage', employee_id));
create policy employee_competence_update on public.employee_competence for update to authenticated
  using (private.can_on_employee('employees.manage', employee_id))
  with check (private.can_on_employee('employees.manage', employee_id));

-- Certificates: private bucket, read by those who see the competence, written by employees.manage.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('certificates', 'certificates', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'])
on conflict (id) do nothing;

create function private.certificate_access(path text, write boolean) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.employee e
    where e.id::text = split_part(path, '/', 2)
      and e.organization_id::text = split_part(path, '/', 1)
      and private.is_member(e.organization_id)
      and (private.can_on_employee('employees.manage', e.id)
           or (not write and (private.is_self(e.id)
                              or private.can_on_employee('employees.view', e.id)
                              or private.can_on_employee('schedule.manage', e.id))))
  );
$$;
create policy certificates_select on storage.objects for select to authenticated
  using (bucket_id = 'certificates' and private.certificate_access(name, false));
create policy certificates_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'certificates' and private.certificate_access(name, true));

alter table public.shift add column required_competence_ids uuid[] not null default '{}';
alter table public.shift_template add column required_competence_ids uuid[] not null default '{}';
alter table public.department add column open_shift_requires_approval boolean not null default true;

-- The required competences the employee does not hold on the date.
create function private.missing_competences(emp uuid, d date, required uuid[])
returns uuid[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(c), '{}') from unnest(coalesce(required, '{}')) c
  where not exists (
    select 1 from public.employee_competence ec
    where ec.employee_id = emp and ec.competence_id = c and ec.archived_at is null
      and ec.valid_from <= d and (ec.valid_to is null or ec.valid_to >= d));
$$;

-- For the app: what an employee lacks for a shift (the employee or their planners).
create function public.missing_competences(p_employee_id uuid, p_shift_id uuid)
returns uuid[] language sql stable security definer set search_path = '' as $$
  select case when private.is_self(p_employee_id)
                or private.can_on_employee('schedule.manage', p_employee_id)
         then private.missing_competences(p_employee_id,
                (s.start_at at time zone 'Europe/Copenhagen')::date, s.required_competence_ids) end
  from public.shift s where s.id = p_shift_id;
$$;
revoke execute on function public.missing_competences(uuid, uuid) from public, anon;
grant execute on function public.missing_competences(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Swaps: the one who gets a shift must hold its competences.

create or replace function private.execute_swap(w public.shift_swap) returns void
language plpgsql security definer set search_path = '' as $$
declare
  s public.shift;
  ts public.shift;
begin
  select * into s from public.shift where id = w.shift_id for update;
  if not private.swappable(s, w.requester_employee_id) then
    raise exception 'the shift has changed' using errcode = 'P0001', hint = 'shift_changed';
  end if;
  if cardinality(private.missing_competences(w.target_employee_id,
       (s.start_at at time zone 'Europe/Copenhagen')::date, s.required_competence_ids)) > 0 then
    raise exception 'missing competence' using errcode = 'P0001', hint = 'missing_competence';
  end if;
  if w.target_shift_id is not null then
    select * into ts from public.shift where id = w.target_shift_id for update;
    if not private.swappable(ts, w.target_employee_id) then
      raise exception 'the shift has changed' using errcode = 'P0001', hint = 'shift_changed';
    end if;
    if cardinality(private.missing_competences(w.requester_employee_id,
         (ts.start_at at time zone 'Europe/Copenhagen')::date, ts.required_competence_ids)) > 0 then
      raise exception 'missing competence' using errcode = 'P0001', hint = 'missing_competence';
    end if;
  end if;
  perform set_config('app.publishing', 'on', true);
  perform set_config('app.swapping', 'on', true);
  update public.shift set employee_id = w.target_employee_id,
    published = published || jsonb_build_object('employee_id', w.target_employee_id), published_at = now()
  where id = w.shift_id;
  if w.target_shift_id is not null then
    update public.shift set employee_id = w.requester_employee_id,
      published = published || jsonb_build_object('employee_id', w.requester_employee_id), published_at = now()
    where id = w.target_shift_id;
  end if;
  perform set_config('app.swapping', 'off', true);
  perform set_config('app.publishing', 'off', true);
  update public.shift_swap set status = 'completed', completed_at = now() where id = w.id;
end $$;

-- ---------------------------------------------------------------------------
-- Open shifts.

create type public.open_shift_request_status as enum ('requested', 'approved', 'rejected', 'withdrawn');

create table public.open_shift_request (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organization (id),
  department_id uuid not null,
  shift_id uuid not null references public.shift (id),
  employee_id uuid not null,
  status public.open_shift_request_status not null default 'requested',
  decided_by uuid references auth.users (id),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (organization_id, employee_id) references public.employee (organization_id, id),
  foreign key (organization_id, department_id) references public.department (organization_id, id)
);
create unique index open_shift_request_open_idx on public.open_shift_request (shift_id, employee_id)
  where status = 'requested';
create index open_shift_request_dept_idx on public.open_shift_request (department_id, status);
create trigger open_shift_request_audit after insert or update or delete on public.open_shift_request
  for each row execute function private.audit_row();
alter table public.open_shift_request enable row level security;
-- Written only by the functions below.
create policy open_shift_request_select on public.open_shift_request for select to authenticated
  using (private.is_self(employee_id) or private.can_on_department('schedule.manage', department_id));

-- A published shift without an employee, not started, in a department of the employee.
create function private.open_for(s public.shift, emp uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select s.archived_at is null and s.status = 'published' and s.published is not null
     and s.employee_id is null and (s.published ->> 'employee_id') is null
     and s.start_at > now() and private.in_department_emp(emp, s.department_id);
$$;

create function private.assign_open_shift(s public.shift, emp uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('app.publishing', 'on', true);
  perform set_config('app.swapping', 'on', true);
  update public.shift set employee_id = emp,
    published = published || jsonb_build_object('employee_id', emp), published_at = now()
  where id = s.id;
  perform set_config('app.swapping', 'off', true);
  perform set_config('app.publishing', 'off', true);
  -- Others who asked for it are told no.
  update public.open_shift_request set status = 'rejected', decided_at = now()
  where shift_id = s.id and status = 'requested' and employee_id <> emp;
end $$;

-- Service role, after the app has checked the working-time rules. Returns
-- 'taken' or 'requested'.
create function public.take_open_shift(p_actor uuid, p_shift_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  s public.shift;
  me uuid;
  approval boolean;
begin
  perform set_config('app.actor_id', p_actor::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_actor)::text, true);
  select * into s from public.shift where id = p_shift_id for update;
  if s.id is null then raise exception 'shift not found' using errcode = 'P0002'; end if;
  me := private.my_employee_id(s.organization_id);
  if me is null or not private.open_for(s, me) then
    raise exception 'the shift is not open' using errcode = 'P0001', hint = 'shift_not_open';
  end if;
  if cardinality(private.missing_competences(me, (s.start_at at time zone 'Europe/Copenhagen')::date,
                                             s.required_competence_ids)) > 0 then
    raise exception 'missing competence' using errcode = 'P0001', hint = 'missing_competence';
  end if;
  select open_shift_requires_approval into approval from public.department where id = s.department_id;
  if approval then
    if exists (select 1 from public.open_shift_request r
               where r.shift_id = s.id and r.employee_id = me and r.status = 'requested') then
      raise exception 'already requested' using errcode = 'P0001', hint = 'already_requested';
    end if;
    insert into public.open_shift_request (organization_id, department_id, shift_id, employee_id)
    values (s.organization_id, s.department_id, s.id, me);
    return 'requested';
  end if;
  perform private.assign_open_shift(s, me);
  insert into public.open_shift_request (organization_id, department_id, shift_id, employee_id, status,
                                         decided_by, decided_at)
  values (s.organization_id, s.department_id, s.id, me, 'approved', p_actor, now());
  return 'taken';
end $$;
revoke execute on function public.take_open_shift(uuid, uuid) from public, anon, authenticated;
grant execute on function public.take_open_shift(uuid, uuid) to service_role;

-- Service role, after the app has checked the rules for the employee.
create function public.decide_open_shift_request(p_actor uuid, p_id uuid, p_approve boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
  r public.open_shift_request;
  s public.shift;
begin
  perform set_config('app.actor_id', p_actor::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_actor)::text, true);
  select * into r from public.open_shift_request where id = p_id for update;
  if r.id is null or not private.can_on_department('schedule.manage', r.department_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if r.status <> 'requested' then
    raise exception 'the request is closed' using errcode = 'P0001', hint = 'request_closed';
  end if;
  if p_approve then
    select * into s from public.shift where id = r.shift_id for update;
    if not private.open_for(s, r.employee_id) then
      raise exception 'the shift is not open' using errcode = 'P0001', hint = 'shift_not_open';
    end if;
    if cardinality(private.missing_competences(r.employee_id,
         (s.start_at at time zone 'Europe/Copenhagen')::date, s.required_competence_ids)) > 0 then
      raise exception 'missing competence' using errcode = 'P0001', hint = 'missing_competence';
    end if;
    perform private.assign_open_shift(s, r.employee_id);
  end if;
  update public.open_shift_request set status = case when p_approve then 'approved'::public.open_shift_request_status
                                                     else 'rejected' end,
    decided_by = p_actor, decided_at = now()
  where id = p_id;
end $$;
revoke execute on function public.decide_open_shift_request(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.decide_open_shift_request(uuid, uuid, boolean) to service_role;

-- The employee takes back their own request.
create function public.withdraw_open_shift_request(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.open_shift_request set status = 'withdrawn', decided_at = now()
  where id = p_id and status = 'requested' and private.is_own_employee(employee_id);
  if not found then raise exception 'not allowed' using errcode = '42501'; end if;
end $$;
revoke execute on function public.withdraw_open_shift_request(uuid) from public, anon;
grant execute on function public.withdraw_open_shift_request(uuid) to authenticated;

-- The open shifts the signed-in employee can see (their departments), with
-- what they lack and their own request, if any.
create function public.open_shifts_for_me(p_organization_id uuid, p_from timestamptz, p_to timestamptz)
returns table (shift_id uuid, department_id uuid, department_name text, start_at timestamptz,
               end_at timestamptz, label text, required_competence_ids uuid[], missing_competence_ids uuid[],
               request_id uuid, requires_approval boolean)
language sql stable security definer set search_path = '' as $$
  with me as (select private.my_employee_id(p_organization_id) as id)
  select s.id, s.department_id, d.name, s.start_at, s.end_at, s.published ->> 'label',
         s.required_competence_ids,
         private.missing_competences(me.id, (s.start_at at time zone 'Europe/Copenhagen')::date,
                                     s.required_competence_ids),
         (select r.id from public.open_shift_request r
          where r.shift_id = s.id and r.employee_id = me.id and r.status = 'requested'),
         d.open_shift_requires_approval
  from me
  join public.shift s on s.organization_id = p_organization_id
  join public.department d on d.id = s.department_id
  where me.id is not null and private.open_for(s, me.id)
    and s.start_at >= greatest(p_from, now()) and s.start_at < p_to
  order by s.start_at;
$$;
revoke execute on function public.open_shifts_for_me(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.open_shifts_for_me(uuid, timestamptz, timestamptz) to authenticated;
