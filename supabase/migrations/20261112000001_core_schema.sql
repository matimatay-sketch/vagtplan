-- Phase 1: core schema (organizations, roles, departments, employees,
-- agreements, pay period groups, contracts).
--
-- Conventions
--   * Every business table carries organization_id; RLS enforces tenancy.
--   * Timestamps are timestamptz (UTC). Calendar dates (contract validity,
--     birth dates) are plain `date` interpreted in the organization's
--     timezone (Europe/Copenhagen by default).
--   * Nothing is hard-deleted from business tables; use archived_at.

create extension if not exists btree_gist with schema extensions;

-- Private schema for helper functions; not exposed through the API.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

create type public.app_role as enum ('admin', 'manager', 'employee');
create type public.agreement_kind as enum ('base', 'agreement', 'local');
create type public.agreement_version_status as enum ('draft', 'published', 'archived');
create type public.pay_frequency as enum ('weekly', 'biweekly', 'monthly');
create type public.pay_form as enum ('hourly', 'monthly');

-- ---------------------------------------------------------------------------
-- Organizations and memberships
-- ---------------------------------------------------------------------------
create table public.organization (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 200),
  timezone text not null default 'Europe/Copenhagen',
  created_at timestamptz not null default now()
);

create table public.membership (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organization (id),
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (organization_id, user_id)
);
create index membership_user_idx on public.membership (user_id);

-- ---------------------------------------------------------------------------
-- Departments
-- ---------------------------------------------------------------------------
create table public.department (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organization (id),
  name text not null check (length(trim(name)) between 1 and 200),
  created_at timestamptz not null default now(),
  archived_at timestamptz
);
create unique index department_name_uniq
  on public.department (organization_id, lower(name))
  where archived_at is null;
-- Composite key target so child tables can enforce same-organization FKs.
alter table public.department add unique (organization_id, id);

create table public.department_manager (
  organization_id uuid not null,
  department_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (department_id, user_id),
  foreign key (organization_id, department_id) references public.department (organization_id, id)
);
create index department_manager_user_idx on public.department_manager (user_id);

-- ---------------------------------------------------------------------------
-- Employees
-- ---------------------------------------------------------------------------
create table public.employee (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organization (id),
  employee_number text not null check (length(trim(employee_number)) between 1 and 50),
  first_name text not null check (length(trim(first_name)) between 1 and 100),
  last_name text not null check (length(trim(last_name)) between 1 and 100),
  email text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone text,
  birth_date date not null check (birth_date > date '1900-01-01'),
  -- Compulsory schooling ("undervisningspligt"). Drives the stricter rules
  -- for young workers. `school_obligation_ends_on` is optional; when set the
  -- flag stops applying after that date.
  school_obligated boolean not null default false,
  school_obligation_ends_on date,
  hired_on date,
  terminated_on date,
  user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (organization_id, employee_number),
  unique (organization_id, id),
  check (terminated_on is null or hired_on is null or terminated_on >= hired_on),
  check (school_obligation_ends_on is null or school_obligated)
);
create unique index employee_user_uniq on public.employee (organization_id, user_id)
  where user_id is not null;

create table public.employee_department (
  organization_id uuid not null,
  employee_id uuid not null,
  department_id uuid not null,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (employee_id, department_id),
  foreign key (organization_id, employee_id) references public.employee (organization_id, id),
  foreign key (organization_id, department_id) references public.department (organization_id, id)
);
create index employee_department_dept_idx on public.employee_department (department_id);
create unique index employee_department_one_primary
  on public.employee_department (employee_id) where is_primary;

-- ---------------------------------------------------------------------------
-- Agreements (overenskomster) – versioned documents. organization_id null
-- means a system template (basis-dk, examples) readable by everyone.
-- ---------------------------------------------------------------------------
create table public.agreement (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organization (id),
  key text not null check (key ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  name text not null,
  kind public.agreement_kind not null,
  is_example boolean not null default false,
  description text,
  created_at timestamptz not null default now()
);
create unique index agreement_key_uniq
  on public.agreement (coalesce(organization_id, '00000000-0000-0000-0000-000000000000'::uuid), key);

create table public.agreement_version (
  id uuid primary key default gen_random_uuid(),
  agreement_id uuid not null references public.agreement (id),
  version integer not null check (version > 0),
  valid_from date not null,
  valid_to date,
  status public.agreement_version_status not null default 'draft',
  document jsonb not null,
  published_at timestamptz,
  published_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  unique (agreement_id, version),
  check (valid_to is null or valid_to >= valid_from),
  check (status <> 'published' or published_at is not null)
);
-- Published versions of the same agreement may not overlap in time.
alter table public.agreement_version add constraint agreement_version_no_overlap
  exclude using gist (
    agreement_id with =,
    daterange(valid_from, valid_to, '[]') with &&
  ) where (status = 'published');

-- ---------------------------------------------------------------------------
-- Pay period groups (lønperiode-grupper)
-- ---------------------------------------------------------------------------
create table public.pay_period_group (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organization (id),
  name text not null check (length(trim(name)) between 1 and 100),
  frequency public.pay_frequency not null,
  -- weekly/biweekly: first day of a period (any period start; must be a Monday).
  anchor_date date,
  -- monthly: day of month the period starts (1 = calendar month; e.g. 21 for
  -- a shifted period 21st–20th).
  month_start_day smallint check (month_start_day between 1 and 28),
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (organization_id, id),
  check (
    (frequency = 'monthly' and month_start_day is not null and anchor_date is null)
    or (frequency in ('weekly', 'biweekly') and anchor_date is not null
        and month_start_day is null and extract(isodow from anchor_date) = 1)
  )
);
create unique index pay_period_group_name_uniq
  on public.pay_period_group (organization_id, lower(name)) where archived_at is null;

-- ---------------------------------------------------------------------------
-- Contracts: employee → agreement (+ optional local agreement + contract
-- layer overrides). A change mid-period is modelled as two contracts.
-- ---------------------------------------------------------------------------
create table public.contract (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  employee_id uuid not null,
  agreement_id uuid not null references public.agreement (id),
  local_agreement_id uuid references public.agreement (id),
  -- Contract-level layer: partial agreement document merged last.
  overrides jsonb not null default '{}'::jsonb,
  staff_group text,
  pay_step text,
  seniority_date date,
  pay_form public.pay_form not null,
  weekly_norm_minutes integer not null check (weekly_norm_minutes between 0 and 4800),
  pay_period_group_id uuid not null,
  exempt_from_registration boolean not null default false,
  exemption_reason text,
  exemption_since date,
  valid_from date not null,
  valid_to date,
  created_at timestamptz not null default now(),
  foreign key (organization_id, employee_id) references public.employee (organization_id, id),
  foreign key (organization_id, pay_period_group_id) references public.pay_period_group (organization_id, id),
  check (valid_to is null or valid_to >= valid_from),
  check (
    not exempt_from_registration
    or (exemption_reason is not null and length(trim(exemption_reason)) > 0 and exemption_since is not null)
  ),
  check (jsonb_typeof(overrides) = 'object')
);
alter table public.contract add constraint contract_no_overlap
  exclude using gist (
    employee_id with =,
    daterange(valid_from, valid_to, '[]') with &&
  );
create index contract_employee_idx on public.contract (employee_id);

-- Agreements referenced by a contract must be visible to the contract's
-- organization (own agreement or system template) and of the right kind.
create function private.check_contract_agreements() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  a record;
begin
  select organization_id, kind into a from public.agreement where id = new.agreement_id;
  if a.kind = 'local' then
    raise exception 'contract.agreement_id must not be a local agreement' using errcode = '23514';
  end if;
  if a.organization_id is not null and a.organization_id <> new.organization_id then
    raise exception 'agreement belongs to another organization' using errcode = '23514';
  end if;
  if new.local_agreement_id is not null then
    select organization_id, kind into a from public.agreement where id = new.local_agreement_id;
    if a.kind <> 'local' or a.organization_id is distinct from new.organization_id then
      raise exception 'local_agreement_id must be a local agreement of the same organization'
        using errcode = '23514';
    end if;
  end if;
  return new;
end $$;

create trigger contract_check_agreements
  before insert or update on public.contract
  for each row execute function private.check_contract_agreements();
