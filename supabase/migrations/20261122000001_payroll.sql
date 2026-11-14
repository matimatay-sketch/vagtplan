-- Phase 6: pay periods, pay runs and lines, configurable export templates.
--
-- A calculation of one employee in one period is a pay_run with its
-- pay_lines. A new calculation supersedes the previous run. A closed period
-- is never calculated again. Amounts and rates are øre, quantities minutes.

insert into public.permission (key, allowed_scopes, sort_order) values
  ('payroll.view', '{departments,organization}', 230),
  ('payroll.manage', '{organization}', 240);

insert into public.permission_grant (organization_id, profile_id, permission, scope)
select p.organization_id, p.id, k.key, 'organization'
from public.permission_profile p
cross join (values ('payroll.view'), ('payroll.manage')) as k(key)
where p.is_owner
on conflict do nothing;

insert into public.permission_grant (organization_id, profile_id, permission, scope)
select p.organization_id, p.id, 'payroll.view', 'departments'
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
  values (org, 'Leder', 'Medarbejdere, kontrakter, vagtplan, tid, fravær, lønlinjer og projekttimer i de afdelinger, brugeren er ansvarlig for.')
  returning id into m;
  insert into public.permission_grant (organization_id, profile_id, permission, scope)
  select org, m, k, 'departments' from unnest(array[
    'employees.view', 'employees.manage', 'employees.invite', 'contracts.view', 'contracts.manage',
    'schedule.view', 'schedule.manage', 'schedule.publish', 'schedule.override', 'projects.view',
    'time.view', 'time.manage', 'time.approve', 'absence.view', 'absence.manage', 'absence.approve',
    'payroll.view'
  ]) as k;

  insert into public.permission_profile (organization_id, name, description)
  values (org, 'Medarbejder', 'Ser egne oplysninger og den offentliggjorte vagtplan for egne afdelinger. Registrerer egen tid og søger fravær.')
  returning id into e;

  update public.organization set default_profile_id = e where id = org;
  perform set_config('app.bootstrap', 'off', true);
  return query select o, m, e;
end $$;

-- ---------------------------------------------------------------------------
create type public.pay_period_status as enum ('open', 'closed');

create table public.pay_period (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organization (id),
  group_id uuid not null,
  start_date date not null,
  end_date date not null,
  status public.pay_period_status not null default 'open',
  closed_by uuid references auth.users (id),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (group_id, start_date),
  foreign key (organization_id, group_id) references public.pay_period_group (organization_id, id),
  check (end_date >= start_date and end_date - start_date <= 31),
  check ((status = 'closed') = (closed_at is not null))
);

create table public.pay_run (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organization (id),
  pay_period_id uuid not null,
  employee_id uuid not null,
  engine_version text not null,
  notes jsonb not null default '[]'::jsonb check (jsonb_typeof(notes) = 'array'),
  daily_minutes jsonb not null default '{}'::jsonb check (jsonb_typeof(daily_minutes) = 'object'),
  -- Registrations still waiting for approval when calculated (not paid).
  pending_entries integer not null default 0,
  calculated_by uuid references auth.users (id) default auth.uid(),
  calculated_at timestamptz not null default now(),
  superseded_at timestamptz,
  unique (organization_id, id),
  foreign key (organization_id, pay_period_id) references public.pay_period (organization_id, id),
  foreign key (organization_id, employee_id) references public.employee (organization_id, id)
);
create unique index pay_run_current_uniq on public.pay_run (pay_period_id, employee_id) where superseded_at is null;

create table public.pay_line (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organization (id),
  pay_run_id uuid not null,
  employee_id uuid not null,
  position integer not null,
  pay_code text not null,
  label text not null,
  unit text not null check (unit in ('hours', 'time_off_minutes', 'fixed')),
  quantity_minutes integer not null,
  rate_ore integer not null,
  amount_ore bigint not null,
  explanation jsonb not null,
  unique (organization_id, id),
  foreign key (organization_id, pay_run_id) references public.pay_run (organization_id, id),
  foreign key (organization_id, employee_id) references public.employee (organization_id, id)
);
create index pay_line_run_idx on public.pay_line (pay_run_id, position);

-- Export templates: the consultant configures columns, format and pay code mapping.
create table public.export_template (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organization (id),
  name text not null check (length(trim(name)) between 1 and 100),
  settings jsonb not null check (jsonb_typeof(settings) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (organization_id, id)
);
create unique index export_template_name_uniq on public.export_template (organization_id, lower(name)) where archived_at is null;

create table public.export_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organization (id),
  pay_period_id uuid not null,
  template_id uuid not null,
  row_count integer not null,
  sha256 text not null,
  exported_by uuid references auth.users (id) default auth.uid(),
  exported_at timestamptz not null default now(),
  foreign key (organization_id, pay_period_id) references public.pay_period (organization_id, id),
  foreign key (organization_id, template_id) references public.export_template (organization_id, id)
);

-- ---------------------------------------------------------------------------
-- Guards: periods close only through close_pay_period; runs and lines are
-- written only by save_pay_run and never changed.
create function private.payroll_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if coalesce(current_setting('app.payroll', true), '') <> 'on' then
    raise exception '% changes only through the payroll functions', tg_table_name using errcode = '42501';
  end if;
  return coalesce(new, old);
end $$;
create trigger pay_period_guard before update or delete on public.pay_period
  for each row execute function private.payroll_guard();
create trigger pay_run_guard before insert or update or delete on public.pay_run
  for each row execute function private.payroll_guard();
create trigger pay_line_guard before insert or update or delete on public.pay_line
  for each row execute function private.payroll_guard();
create trigger export_log_guard before update or delete on public.export_log
  for each row execute function private.forbid_change();

alter table public.pay_period enable row level security;
alter table public.pay_run enable row level security;
alter table public.pay_line enable row level security;
alter table public.export_template enable row level security;
alter table public.export_log enable row level security;

create function private.can_see_pay(emp uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_own_employee(emp) or private.can_on_employee('payroll.view', emp)
    or private.can_on_employee('payroll.manage', emp);
$$;

create policy pay_period_select on public.pay_period for select to authenticated
  using (private.is_member(organization_id));
create policy pay_period_insert on public.pay_period for insert to authenticated
  with check (status = 'open' and private.has_org_permission(organization_id, 'payroll.manage'));
create policy pay_run_select on public.pay_run for select to authenticated
  using (private.can_see_pay(employee_id));
create policy pay_line_select on public.pay_line for select to authenticated
  using (private.can_see_pay(employee_id));
create policy export_template_select on public.export_template for select to authenticated
  using (private.has_org_permission(organization_id, 'payroll.manage')
         or private.permission_scope(organization_id, 'payroll.view') is not null);
create policy export_template_insert on public.export_template for insert to authenticated
  with check (private.has_org_permission(organization_id, 'payroll.manage'));
create policy export_template_update on public.export_template for update to authenticated
  using (private.has_org_permission(organization_id, 'payroll.manage'))
  with check (private.has_org_permission(organization_id, 'payroll.manage'));
create policy export_log_select on public.export_log for select to authenticated
  using (private.has_org_permission(organization_id, 'payroll.manage'));
create policy export_log_insert on public.export_log for insert to authenticated
  with check (private.has_org_permission(organization_id, 'payroll.manage'));

do $$
declare
  t text;
begin
  foreach t in array array['pay_period', 'pay_run', 'pay_line', 'export_template', 'export_log'] loop
    execute format('create trigger %I after insert or update or delete on public.%I
      for each row execute function private.audit_row()', t || '_audit', t);
  end loop;
  foreach t in array array['pay_period', 'export_template'] loop
    execute format('create trigger %I before update on public.%I
      for each row execute function private.forbid_org_change()', t || '_org_immutable', t);
  end loop;
end $$;

-- Saves a calculation: a new run with its lines; the previous run is superseded.
-- p_lines: [{pay_code, label, unit, quantity_minutes, rate_ore, amount_ore, explanation}]
create function public.save_pay_run(
  p_period_id uuid, p_employee_id uuid, p_engine_version text, p_notes jsonb, p_daily jsonb,
  p_pending integer, p_lines jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
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
    quantity_minutes, rate_ore, amount_ore, explanation)
  select per.organization_id, run, p_employee_id, (x.ord)::int, x.l ->> 'pay_code', x.l ->> 'label', x.l ->> 'unit',
    (x.l ->> 'quantity_minutes')::int, (x.l ->> 'rate_ore')::int, (x.l ->> 'amount_ore')::bigint, x.l -> 'explanation'
  from jsonb_array_elements(p_lines) with ordinality as x(l, ord);
  perform set_config('app.payroll', 'off', true);
  return run;
end $$;
grant execute on function public.save_pay_run(uuid, uuid, text, jsonb, jsonb, integer, jsonb) to authenticated;

create function public.close_pay_period(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  per public.pay_period;
begin
  select * into per from public.pay_period where id = p_id for update;
  if per.id is null then raise exception 'period not found' using errcode = 'P0002'; end if;
  if not private.has_org_permission(per.organization_id, 'payroll.manage') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if per.status = 'closed' then raise exception 'already closed' using errcode = '22023'; end if;
  perform set_config('app.payroll', 'on', true);
  update public.pay_period set status = 'closed', closed_by = (select auth.uid()), closed_at = now() where id = p_id;
  perform set_config('app.payroll', 'off', true);
end $$;
grant execute on function public.close_pay_period(uuid) to authenticated;

revoke execute on function public.save_pay_run(uuid, uuid, text, jsonb, jsonb, integer, jsonb),
  public.close_pay_period(uuid) from public, anon;
