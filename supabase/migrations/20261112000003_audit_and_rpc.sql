-- Phase 1: audit log, integrity triggers and RPC functions.

-- ---------------------------------------------------------------------------
-- Audit log: append-only, written by trigger on every mutable table.
-- ---------------------------------------------------------------------------
create table public.audit_log (
  id bigint generated always as identity primary key,
  organization_id uuid references public.organization (id),
  actor_id uuid,
  table_name text not null,
  row_id text not null,
  action text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_org_created_idx on public.audit_log (organization_id, created_at desc);
create index audit_log_row_idx on public.audit_log (table_name, row_id);

alter table public.audit_log enable row level security;
create policy audit_log_select on public.audit_log for select to authenticated
  using (organization_id is not null and private.is_admin(organization_id));
-- No insert/update/delete policies: only the trigger (security definer) writes.
revoke insert, update, delete, truncate on public.audit_log from authenticated, anon;

create function private.audit_row() returns trigger
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
  insert into public.audit_log (organization_id, actor_id, table_name, row_id, action, before, after)
  values (
    org,
    auth.uid(),
    tg_table_name,
    rid,
    tg_op,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );
  return coalesce(new, old);
end $$;

-- organization_id is immutable on every business table.
create function private.forbid_org_change() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.organization_id is distinct from old.organization_id then
    raise exception 'organization_id cannot be changed' using errcode = '42501';
  end if;
  return new;
end $$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'organization', 'membership', 'department', 'department_manager', 'employee',
    'employee_department', 'agreement', 'agreement_version', 'pay_period_group', 'contract'
  ] loop
    execute format(
      'create trigger %I after insert or update or delete on public.%I
         for each row execute function private.audit_row()',
      t || '_audit', t
    );
  end loop;
  foreach t in array array[
    'membership', 'department', 'department_manager', 'employee',
    'employee_department', 'agreement', 'pay_period_group', 'contract'
  ] loop
    execute format(
      'create trigger %I before update on public.%I
         for each row execute function private.forbid_org_change()',
      t || '_org_immutable', t
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- RPC: create an organization; the caller becomes its admin and a default
-- pay period group is created.
-- ---------------------------------------------------------------------------
create function public.create_organization(org_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  org uuid;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  insert into public.organization (name) values (trim(org_name)) returning id into org;
  insert into public.membership (organization_id, user_id, role) values (org, uid, 'admin');
  insert into public.pay_period_group (organization_id, name, frequency, month_start_day)
  values (org, 'Månedslønnede', 'monthly', 1);
  return org;
end $$;
revoke execute on function public.create_organization(text) from public, anon;
grant execute on function public.create_organization(text) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: create an employee and attach them to a department atomically.
-- Allowed for admins and for managers of that department.
-- ---------------------------------------------------------------------------
create function public.create_employee(
  p_department_id uuid,
  p_employee_number text,
  p_first_name text,
  p_last_name text,
  p_birth_date date,
  p_email text default null,
  p_phone text default null,
  p_school_obligated boolean default false,
  p_school_obligation_ends_on date default null,
  p_hired_on date default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  org uuid;
  emp uuid;
begin
  select organization_id into org from public.department
  where id = p_department_id and archived_at is null;
  if org is null then
    raise exception 'department not found' using errcode = 'P0002';
  end if;
  if not (private.is_admin(org) or private.manages_department(p_department_id)) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  insert into public.employee (
    organization_id, employee_number, first_name, last_name, birth_date, email, phone,
    school_obligated, school_obligation_ends_on, hired_on
  ) values (
    org, trim(p_employee_number), trim(p_first_name), trim(p_last_name), p_birth_date,
    nullif(trim(p_email), ''), nullif(trim(p_phone), ''),
    p_school_obligated, p_school_obligation_ends_on, p_hired_on
  ) returning id into emp;
  insert into public.employee_department (organization_id, employee_id, department_id, is_primary)
  values (org, emp, p_department_id, true);
  return emp;
end $$;
revoke execute on function public.create_employee from public, anon;
grant execute on function public.create_employee to authenticated;
