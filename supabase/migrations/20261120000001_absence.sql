-- Phase 5: absence, vacation ledger and call-outs.
--
-- absence: requests and registrations (status requested → approved/rejected,
-- or cancelled). leave_posting: an insert-only ledger of days in hundredths
-- (accrual, usage, reversal, transfer, payout, adjustment). Balances are
-- always the sum of postings; a correction is a new posting.

insert into public.permission (key, allowed_scopes, sort_order) values
  ('absence.view', '{departments,organization}', 200),
  ('absence.manage', '{departments,organization}', 210),
  ('absence.approve', '{departments,organization}', 220);

insert into public.permission_grant (organization_id, profile_id, permission, scope)
select p.organization_id, p.id, k.key, 'organization'
from public.permission_profile p
cross join (values ('absence.view'), ('absence.manage'), ('absence.approve')) as k(key)
where p.is_owner
on conflict do nothing;

insert into public.permission_grant (organization_id, profile_id, permission, scope)
select p.organization_id, p.id, k.key, 'departments'
from public.permission_profile p
cross join (values ('absence.view'), ('absence.manage'), ('absence.approve')) as k(key)
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
  values (org, 'Leder', 'Medarbejdere, kontrakter, vagtplan, tid, fravær og projekttimer i de afdelinger, brugeren er ansvarlig for.')
  returning id into m;
  insert into public.permission_grant (organization_id, profile_id, permission, scope)
  select org, m, k, 'departments' from unnest(array[
    'employees.view', 'employees.manage', 'employees.invite', 'contracts.view', 'contracts.manage',
    'schedule.view', 'schedule.manage', 'schedule.publish', 'schedule.override', 'projects.view',
    'time.view', 'time.manage', 'time.approve', 'absence.view', 'absence.manage', 'absence.approve'
  ]) as k;

  insert into public.permission_profile (organization_id, name, description)
  values (org, 'Medarbejder', 'Ser egne oplysninger og den offentliggjorte vagtplan for egne afdelinger. Registrerer egen tid og søger fravær.')
  returning id into e;

  update public.organization set default_profile_id = e where id = org;
  perform set_config('app.bootstrap', 'off', true);
  return query select o, m, e;
end $$;

-- ---------------------------------------------------------------------------
create type public.absence_status as enum ('requested', 'approved', 'rejected', 'cancelled');

create table public.absence (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organization (id),
  employee_id uuid not null,
  -- "vacation", "extra" (feriefridage) or an absence type code from the agreement.
  type_code text not null check (type_code ~ '^[a-z_]+$'),
  from_date date not null,
  to_date date not null,
  status public.absence_status not null default 'requested',
  note text check (note is null or length(note) <= 500),
  decision_note text check (decision_note is null or length(decision_note) <= 500),
  -- Leave days drawn from the balance (hundredths), set at approval.
  days_hundredths integer,
  requested_by uuid references auth.users (id) default auth.uid(),
  decided_by uuid references auth.users (id),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, employee_id) references public.employee (organization_id, id),
  check (to_date >= from_date and to_date - from_date <= 366)
);
create index absence_employee_idx on public.absence (employee_id, from_date);
alter table public.absence add constraint absence_no_overlap
  exclude using gist (employee_id with =, daterange(from_date, to_date, '[]') with &&)
  where (status in ('requested', 'approved'));

create type public.leave_posting_kind as enum ('accrual', 'usage', 'reversal', 'transfer', 'payout', 'adjustment');

create table public.leave_posting (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organization (id),
  employee_id uuid not null,
  account text not null check (account ~ '^[a-z_]+$'),
  kind public.leave_posting_kind not null,
  period_start date not null,
  usable_until date not null,
  hundredths integer not null check (hundredths <> 0),
  posted_on date not null,
  absence_id uuid,
  note text check (note is null or length(note) <= 500),
  created_by uuid references auth.users (id) default auth.uid(),
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, employee_id) references public.employee (organization_id, id),
  foreign key (organization_id, absence_id) references public.absence (organization_id, id),
  check (usable_until >= period_start)
);
create index leave_posting_employee_idx on public.leave_posting (employee_id, account, period_start);
-- The accrual job can run again without double postings.
create unique index leave_posting_accrual_uniq on public.leave_posting (employee_id, account, period_start, posted_on)
  where kind = 'accrual';

create function private.forbid_change() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception '% is append-only; add a correcting posting', tg_table_name using errcode = '42501';
end $$;
create trigger leave_posting_append_only before update or delete on public.leave_posting
  for each row execute function private.forbid_change();

create function private.absence_before_write() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and coalesce(current_setting('app.absence_system', true), '') <> 'on' then
    raise exception 'absences change through decide_absence and cancel_absence' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' and new.status <> 'requested' then
    raise exception 'new absences start as requests' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger absence_before_write before insert or update on public.absence
  for each row execute function private.absence_before_write();

-- Who may decide on an employee's absence: absence.approve, or the personal approver.
create function private.can_approve_absence(emp uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.can_on_employee('absence.approve', emp) or private.is_time_approver(emp);
$$;

create function private.can_see_absence(emp uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_own_employee(emp) or private.is_time_approver(emp)
    or private.can_on_employee('absence.view', emp) or private.can_on_employee('absence.manage', emp)
    or private.can_on_employee('absence.approve', emp)
    or private.can_on_employee('schedule.view', emp) or private.can_on_employee('schedule.manage', emp);
$$;

alter table public.absence enable row level security;
alter table public.leave_posting enable row level security;
create policy absence_select on public.absence for select to authenticated
  using (private.can_see_absence(employee_id));
create policy absence_insert on public.absence for insert to authenticated
  with check (status = 'requested'
              and (private.is_own_employee(employee_id) or private.can_on_employee('absence.manage', employee_id)));
-- Balances are not visible to planners, only to the employee and absence roles.
create policy leave_posting_select on public.leave_posting for select to authenticated
  using (private.is_own_employee(employee_id) or private.is_time_approver(employee_id)
         or private.can_on_employee('absence.view', employee_id)
         or private.can_on_employee('absence.manage', employee_id)
         or private.can_on_employee('absence.approve', employee_id));

do $$
declare
  t text;
begin
  foreach t in array array['absence', 'leave_posting'] loop
    execute format('create trigger %I after insert or update or delete on public.%I
      for each row execute function private.audit_row()', t || '_audit', t);
    execute format('create trigger %I before update on public.%I
      for each row execute function private.forbid_org_change()', t || '_org_immutable', t);
  end loop;
end $$;

-- The ledger account an absence type draws from.
create function private.leave_account(type_code text)
returns text language sql immutable set search_path = '' as $$
  select type_code;
$$;

-- Approve (with the usage postings computed by the app from the agreement) or reject.
-- p_usage: [{"account", "period_start", "usable_until", "hundredths" (< 0)}]
create function public.decide_absence(p_id uuid, p_approve boolean, p_note text, p_usage jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  a public.absence;
  u jsonb;
  total integer := 0;
begin
  select * into a from public.absence where id = p_id for update;
  if a.id is null then raise exception 'not found' using errcode = 'P0002'; end if;
  if not private.can_approve_absence(a.employee_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if private.is_own_employee(a.employee_id)
     and coalesce(private.permission_scope(a.organization_id, 'absence.approve'), 'departments') <> 'organization' then
    raise exception 'cannot decide on own absence' using errcode = '42501';
  end if;
  if a.status <> 'requested' then
    raise exception 'already decided' using errcode = '22023';
  end if;
  if p_approve then
    for u in select * from jsonb_array_elements(coalesce(p_usage, '[]'::jsonb)) loop
      if u ->> 'account' <> private.leave_account(a.type_code) or (u ->> 'hundredths')::int >= 0 then
        raise exception 'invalid usage posting' using errcode = '22023';
      end if;
      insert into public.leave_posting (organization_id, employee_id, account, kind, period_start, usable_until,
        hundredths, posted_on, absence_id, note)
      values (a.organization_id, a.employee_id, u ->> 'account', 'usage', (u ->> 'period_start')::date,
        (u ->> 'usable_until')::date, (u ->> 'hundredths')::int, a.from_date, a.id, nullif(trim(coalesce(p_note, '')), ''));
      total := total - (u ->> 'hundredths')::int;
    end loop;
    if total > (a.to_date - a.from_date + 1) * 100 then
      raise exception 'more leave days than calendar days' using errcode = '22023';
    end if;
  end if;
  perform set_config('app.absence_system', 'on', true);
  update public.absence set
    status = case when p_approve then 'approved' else 'rejected' end::public.absence_status,
    decision_note = nullif(trim(coalesce(p_note, '')), ''),
    days_hundredths = case when p_approve then total end,
    decided_by = (select auth.uid()), decided_at = now()
  where id = a.id;
  perform set_config('app.absence_system', 'off', true);
end $$;
grant execute on function public.decide_absence(uuid, boolean, text, jsonb) to authenticated;

-- Cancel a request (the employee or a manager) or an approved absence (a
-- manager); usage is reversed with new postings.
create function public.cancel_absence(p_id uuid, p_note text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  a public.absence;
begin
  select * into a from public.absence where id = p_id for update;
  if a.id is null then raise exception 'not found' using errcode = 'P0002'; end if;
  if a.status = 'requested' then
    if not (private.is_own_employee(a.employee_id) or private.can_on_employee('absence.manage', a.employee_id)
            or private.can_approve_absence(a.employee_id)) then
      raise exception 'not allowed' using errcode = '42501';
    end if;
  elsif a.status = 'approved' then
    if not (private.can_on_employee('absence.manage', a.employee_id) or private.can_approve_absence(a.employee_id)) then
      raise exception 'not allowed' using errcode = '42501';
    end if;
    insert into public.leave_posting (organization_id, employee_id, account, kind, period_start, usable_until,
      hundredths, posted_on, absence_id, note)
    select p.organization_id, p.employee_id, p.account, 'reversal', p.period_start, p.usable_until,
      -p.hundredths, current_date, p.absence_id, 'Annulleret fravær'
    from public.leave_posting p where p.absence_id = a.id and p.kind = 'usage';
  else
    raise exception 'cannot cancel' using errcode = '22023';
  end if;
  perform set_config('app.absence_system', 'on', true);
  update public.absence set status = 'cancelled', decision_note = coalesce(nullif(trim(coalesce(p_note, '')), ''), decision_note),
    decided_by = (select auth.uid()), decided_at = now()
  where id = a.id;
  perform set_config('app.absence_system', 'off', true);
end $$;
grant execute on function public.cancel_absence(uuid, text) to authenticated;

-- Manual postings: transfer, payout or adjustment (absence.manage, with a reason).
create function public.add_leave_posting(
  p_employee_id uuid, p_account text, p_kind public.leave_posting_kind, p_period_start date,
  p_usable_until date, p_hundredths integer, p_note text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  org uuid;
  pid uuid;
begin
  if p_kind not in ('transfer', 'payout', 'adjustment') then
    raise exception 'only transfers, payouts and adjustments are posted manually' using errcode = '22023';
  end if;
  if not private.can_on_employee('absence.manage', p_employee_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_note, ''))) < 5 then
    raise exception 'a posting needs a reason' using errcode = '23514';
  end if;
  select organization_id into org from public.employee where id = p_employee_id;
  insert into public.leave_posting (organization_id, employee_id, account, kind, period_start, usable_until,
    hundredths, posted_on, note)
  values (org, p_employee_id, p_account, p_kind, p_period_start, p_usable_until, p_hundredths, current_date, trim(p_note))
  returning id into pid;
  return pid;
end $$;
grant execute on function public.add_leave_posting(uuid, text, public.leave_posting_kind, date, date, integer, text) to authenticated;

-- Accrual job: the app computes the postings with the rules engine and sends
-- them through the service role (never callable by users).
create function public.post_leave_accruals(p_employee_id uuid, p_postings jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  org uuid;
  n integer;
begin
  select organization_id into org from public.employee where id = p_employee_id;
  if org is null then raise exception 'employee not found' using errcode = 'P0002'; end if;
  insert into public.leave_posting (organization_id, employee_id, account, kind, period_start, usable_until,
    hundredths, posted_on, note, created_by)
  select org, p_employee_id, x ->> 'account', 'accrual', (x ->> 'period_start')::date, (x ->> 'usable_until')::date,
    (x ->> 'hundredths')::int, (x ->> 'posted_on')::date, x ->> 'note', null
  from jsonb_array_elements(p_postings) x
  where (x ->> 'hundredths')::int > 0
  on conflict (employee_id, account, period_start, posted_on) where kind = 'accrual' do nothing;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.post_leave_accruals(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.post_leave_accruals(uuid, jsonb) to service_role;

revoke execute on function public.decide_absence(uuid, boolean, text, jsonb), public.cancel_absence(uuid, text),
  public.add_leave_posting(uuid, text, public.leave_posting_kind, date, date, integer, text) from public, anon;

-- Call-outs (tilkald) are registered as time entries of kind call_out.
alter type public.shift_kind add value 'call_out';

drop function public.time_overview(timestamptz, timestamptz);
create function public.time_overview(p_from timestamptz, p_to timestamptz)
returns table (
  row_kind text, entry_id uuid, shift_id uuid, employee_id uuid, employee_name text, employee_number text,
  department_id uuid, department_name text, start_at timestamptz, end_at timestamptz, breaks jsonb,
  project_allocations jsonb, status public.time_entry_status, source public.time_entry_source,
  deviation_reason text, note text, offline boolean, approved_at timestamptz, approved_by_email text,
  version integer, is_mine boolean, plan_start timestamptz, plan_end timestamptz, plan_breaks jsonb,
  kind public.shift_kind
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
         (s.published ->> 'end_at')::timestamptz, s.published -> 'breaks', s.published -> 'project_allocations',
         null, null, null, null, false, null, null, 0, private.is_own_employee(e.id),
         (s.published ->> 'start_at')::timestamptz, (s.published ->> 'end_at')::timestamptz, s.published -> 'breaks',
         (s.published ->> 'kind')::public.shift_kind
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
$$;
grant execute on function public.time_overview(timestamptz, timestamptz) to authenticated;
revoke execute on function public.time_overview(timestamptz, timestamptz) from public, anon;

alter publication supabase_realtime add table public.absence;
