-- Mileage (kørsel) and expenses (udlæg).
--
-- The consultant enters the km rates per year (a high rate up to a yearly km
-- limit, a low rate above it) with their source; Turnus never assumes a rate.
-- Employees register trips (logbook: date, purpose, route with stops, km) and
-- expenses (category, amount, receipt). They are approved by the same people as
-- time (time.approve on the department or the personal approver) and paid as
-- pay lines in the period of the trip/expense date.
--
-- Distances are integer metres; money is integer øre.

insert into public.permission (key, allowed_scopes, sort_order) values
  ('expenses.manage', '{organization}', 167);
insert into public.permission_grant (organization_id, profile_id, permission, scope)
select p.organization_id, p.id, 'expenses.manage', 'organization'
from public.permission_profile p where p.is_owner
on conflict do nothing;

-- Pay lines: unit 'km' (quantity_minutes then holds metres).
alter table public.pay_line drop constraint pay_line_unit_check;
alter table public.pay_line add constraint pay_line_unit_check
  check (unit in ('hours', 'time_off_minutes', 'fixed', 'km'));
comment on column public.pay_line.quantity_minutes is
  'Minutes; for unit km the distance in metres; 0 for fixed amounts.';

create table public.mileage_rate (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organization (id),
  year integer not null check (year between 2000 and 2100),
  high_rate_ore integer not null check (high_rate_ore >= 0),
  low_rate_ore integer not null check (low_rate_ore >= 0),
  high_limit_km integer not null check (high_limit_km >= 0),
  pay_code_high text not null check (pay_code_high ~ '^[A-Z0-9_]{1,32}$'),
  pay_code_low text not null check (pay_code_low ~ '^[A-Z0-9_]{1,32}$'),
  source text not null check (length(trim(source)) between 1 and 300),
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (organization_id, id)
);
create unique index mileage_rate_year_uniq on public.mileage_rate (organization_id, year) where archived_at is null;

create table public.expense_category (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organization (id),
  name text not null check (length(trim(name)) between 1 and 80),
  pay_code text not null check (pay_code ~ '^[A-Z0-9_]{1,32}$'),
  receipt_required boolean not null default true,
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (organization_id, id)
);
create unique index expense_category_name_uniq on public.expense_category (organization_id, lower(name)) where archived_at is null;

create table public.mileage_trip (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organization (id),
  employee_id uuid not null,
  department_id uuid not null,
  trip_date date not null,
  purpose text not null check (length(trim(purpose)) between 3 and 300),
  from_address text not null check (length(trim(from_address)) between 1 and 200),
  to_address text not null check (length(trim(to_address)) between 1 and 200),
  stops jsonb not null default '[]' check (jsonb_typeof(stops) = 'array' and jsonb_array_length(stops) <= 20),
  meters integer not null check (meters > 0 and meters <= 10000000),
  vehicle text check (vehicle is null or length(vehicle) <= 40),
  posting_values jsonb not null default '{}',
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  decided_by uuid references auth.users (id),
  decided_at timestamptz,
  decision_note text check (decision_note is null or length(decision_note) <= 500),
  created_by uuid default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (organization_id, id),
  foreign key (organization_id, employee_id) references public.employee (organization_id, id),
  foreign key (organization_id, department_id) references public.department (organization_id, id)
);
create index mileage_trip_employee_idx on public.mileage_trip (employee_id, trip_date);

create table public.expense (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organization (id),
  employee_id uuid not null,
  department_id uuid not null,
  expense_date date not null,
  category_id uuid not null,
  description text not null check (length(trim(description)) between 3 and 300),
  amount_ore integer not null check (amount_ore > 0 and amount_ore <= 100000000),
  receipt_path text check (receipt_path is null or length(receipt_path) <= 300),
  posting_values jsonb not null default '{}',
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  decided_by uuid references auth.users (id),
  decided_at timestamptz,
  decision_note text check (decision_note is null or length(decision_note) <= 500),
  created_by uuid default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (organization_id, id),
  foreign key (organization_id, employee_id) references public.employee (organization_id, id),
  foreign key (organization_id, department_id) references public.department (organization_id, id),
  foreign key (organization_id, category_id) references public.expense_category (organization_id, id)
);
create index expense_employee_idx on public.expense (employee_id, expense_date);

-- Who may see or write an employee's trips, expenses and receipts.
create function private.expense_access(emp uuid, dept uuid, write boolean) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_own_employee(emp)
      or private.can_on_department('time.manage', dept)
      or (not write and (private.can_on_department('time.view', dept)
                         or private.can_on_department('time.approve', dept)
                         or private.is_time_approver(emp)));
$$;

-- Integrity: decisions only through decide_expense_items; decided rows are locked;
-- the employee must be in the department; the receipt lies in the employee's folder.
create function private.expense_item_before_write() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(current_setting('app.expense_system', true), '') = 'on' then
    new.updated_at := now();
    return new;
  end if;
  if tg_op = 'UPDATE' then
    if old.status <> 'pending' then
      raise exception 'a decided item cannot be changed' using errcode = '42501';
    end if;
    if new.employee_id <> old.employee_id or new.created_by is distinct from old.created_by then
      raise exception 'immutable field' using errcode = '42501';
    end if;
  end if;
  if new.status <> 'pending' or new.decided_by is not null or new.decided_at is not null
     or new.decision_note is not null then
    raise exception 'items are decided with decide_expense_items' using errcode = '42501';
  end if;
  if not exists (select 1 from public.employee_department ed
                 where ed.employee_id = new.employee_id and ed.department_id = new.department_id) then
    raise exception 'employee is not in this department' using errcode = '23514';
  end if;
  perform private.check_posting(new.organization_id, new.department_id, new.posting_values);
  if tg_table_name = 'mileage_trip' then
    if exists (select 1 from jsonb_array_elements(new.stops) s
               where jsonb_typeof(s) <> 'string' or length(s #>> '{}') not between 1 and 200) then
      raise exception 'stops must be addresses' using errcode = '22023';
    end if;
  else
    if new.receipt_path is not null
       and new.receipt_path not like new.organization_id::text || '/' || new.employee_id::text || '/%' then
      raise exception 'the receipt must be in the employee''s folder' using errcode = '22023';
    end if;
    if new.receipt_path is null and exists (
      select 1 from public.expense_category c where c.id = new.category_id and c.receipt_required) then
      raise exception 'this category needs a receipt' using errcode = '23514';
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;

do $$
declare
  t text;
begin
  foreach t in array array['mileage_trip', 'expense'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format($p$create policy %I on public.%I for select to authenticated
      using (private.expense_access(employee_id, department_id, false))$p$, t || '_select', t);
    execute format($p$create policy %I on public.%I for insert to authenticated
      with check (private.expense_access(employee_id, department_id, true))$p$, t || '_insert', t);
    execute format($p$create policy %I on public.%I for update to authenticated
      using (private.expense_access(employee_id, department_id, true))
      with check (private.expense_access(employee_id, department_id, true))$p$, t || '_update', t);
    execute format('create trigger %I before insert or update on public.%I
      for each row execute function private.expense_item_before_write()', t || '_before_write', t);
  end loop;
  foreach t in array array['mileage_rate', 'expense_category'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format($p$create policy %I on public.%I for select to authenticated
      using (private.is_member(organization_id))$p$, t || '_select', t);
    execute format($p$create policy %I on public.%I for insert to authenticated
      with check (private.has_org_permission(organization_id, 'expenses.manage'))$p$, t || '_insert', t);
    execute format($p$create policy %I on public.%I for update to authenticated
      using (private.has_org_permission(organization_id, 'expenses.manage'))
      with check (private.has_org_permission(organization_id, 'expenses.manage'))$p$, t || '_update', t);
  end loop;
  foreach t in array array['mileage_rate', 'expense_category', 'mileage_trip', 'expense'] loop
    execute format('create trigger %I after insert or update or delete on public.%I
      for each row execute function private.audit_row()', t || '_audit', t);
    execute format('create trigger %I before update on public.%I
      for each row execute function private.forbid_org_change()', t || '_org_immutable', t);
  end loop;
end $$;

-- Approve or reject trips and expenses (same approvers as time).
create function public.decide_expense_items(
  p_trip_ids uuid[], p_expense_ids uuid[], p_decision text, p_note text default null)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  r record;
  n integer := 0;
begin
  if p_decision not in ('approved', 'rejected') then
    raise exception 'unknown decision' using errcode = '22023';
  end if;
  if p_decision = 'rejected' and length(trim(coalesce(p_note, ''))) < 3 then
    raise exception 'a rejection needs a reason' using errcode = '23514';
  end if;
  for r in
    select 'mileage_trip' as tbl, id, organization_id, employee_id, department_id, status, archived_at
    from public.mileage_trip where id = any (coalesce(p_trip_ids, '{}'))
    union all
    select 'expense', id, organization_id, employee_id, department_id, status, archived_at
    from public.expense where id = any (coalesce(p_expense_ids, '{}'))
  loop
    continue when r.status <> 'pending' or r.archived_at is not null;
    if not (private.can_on_department('time.approve', r.department_id) or private.is_time_approver(r.employee_id)) then
      raise exception 'not allowed to approve' using errcode = '42501';
    end if;
    if private.is_own_employee(r.employee_id)
       and private.permission_scope(r.organization_id, 'time.approve') <> 'organization' then
      raise exception 'cannot approve own items' using errcode = '42501';
    end if;
    perform set_config('app.expense_system', 'on', true);
    execute format('update public.%I set status = $1, decided_by = $2, decided_at = now(), decision_note = $3
                    where id = $4', r.tbl)
      using p_decision, (select auth.uid()), nullif(trim(coalesce(p_note, '')), ''), r.id;
    perform set_config('app.expense_system', 'off', true);
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.decide_expense_items(uuid[], uuid[], text, text) from public, anon;
grant execute on function public.decide_expense_items(uuid[], uuid[], text, text) to authenticated;

-- Receipts: private bucket; path <organization_id>/<employee_id>/<file>.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'])
on conflict (id) do nothing;

create function private.receipt_access(path text, write boolean) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.employee e
    join public.employee_department ed on ed.employee_id = e.id
    where e.id::text = split_part(path, '/', 2)
      and e.organization_id::text = split_part(path, '/', 1)
      and private.is_member(e.organization_id)
      and private.expense_access(e.id, ed.department_id, write)
  );
$$;

create policy receipts_select on storage.objects for select to authenticated
  using (bucket_id = 'receipts' and private.receipt_access(name, false));
create policy receipts_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'receipts' and private.receipt_access(name, true));
