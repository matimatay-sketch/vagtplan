-- Things that could be done but not undone or corrected:
--   * choose an employee's primary department (and keep one when it is removed)
--   * undo an approval of time, mileage or expenses (not in a closed pay period)
--   * edit and delete pay period groups
--   * correct a contract (not where a closed pay period has used it)
--   * delete (archive) an employee, which also removes the login
-- Everything keeps its trail in the audit log.

-- Whether a closed pay period has paid the employee for this date.
create function private.in_closed_period(emp uuid, d date) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.contract c
    join public.pay_period p on p.group_id = c.pay_period_group_id
    where c.employee_id = emp
      and c.valid_from <= d and (c.valid_to is null or d <= c.valid_to)
      and p.start_date <= d and d <= p.end_date
      and p.status = 'closed'
  );
$$;

-- ---------------------------------------------------------------------------
-- Primary department
-- ---------------------------------------------------------------------------
create function public.set_primary_department(p_employee_id uuid, p_department_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.can_on_employee('employees.manage', p_employee_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if not exists (select 1 from public.employee_department
                 where employee_id = p_employee_id and department_id = p_department_id) then
    raise exception 'not in department' using errcode = 'P0002';
  end if;
  update public.employee_department set is_primary = false
  where employee_id = p_employee_id and is_primary and department_id <> p_department_id;
  update public.employee_department set is_primary = true
  where employee_id = p_employee_id and department_id = p_department_id;
end $$;
revoke execute on function public.set_primary_department(uuid, uuid) from public, anon;
grant execute on function public.set_primary_department(uuid, uuid) to authenticated;

-- Removing the primary department makes another one primary (an employee
-- with departments always has a primary one).
create function private.keep_primary_department() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.is_primary and not exists (
    select 1 from public.employee_department where employee_id = old.employee_id and is_primary
  ) then
    update public.employee_department set is_primary = true
    where employee_id = old.employee_id
      and department_id = (select department_id from public.employee_department
                           where employee_id = old.employee_id order by department_id limit 1);
  end if;
  return null;
end $$;
create trigger employee_department_keep_primary after delete on public.employee_department
  for each row execute function private.keep_primary_department();

-- Employees who already lost their primary department get one back.
update public.employee_department ed set is_primary = true
where ed.department_id = (
    select x.department_id from public.employee_department x
    where x.employee_id = ed.employee_id order by x.department_id limit 1)
  and not exists (select 1 from public.employee_department y
                  where y.employee_id = ed.employee_id and y.is_primary);

-- ---------------------------------------------------------------------------
-- Undo approvals
-- ---------------------------------------------------------------------------
create function public.unapprove_time_entries(p_ids uuid[])
returns integer language plpgsql security definer set search_path = '' as $$
declare
  t record;
  n integer := 0;
  tz text;
begin
  for t in select * from public.time_entry where id = any (p_ids) for update loop
    continue when t.status <> 'approved' or t.superseded_at is not null or t.archived_at is not null;
    if not (private.can_on_department('time.approve', t.department_id) or private.is_time_approver(t.employee_id)) then
      raise exception 'not allowed' using errcode = '42501';
    end if;
    if private.is_own_employee(t.employee_id)
       and private.permission_scope(t.organization_id, 'time.approve') <> 'organization' then
      raise exception 'cannot change own registration' using errcode = '42501';
    end if;
    select timezone into tz from public.organization where id = t.organization_id;
    if private.in_closed_period(t.employee_id, (t.start_at at time zone tz)::date) then
      raise exception 'the pay period is closed' using errcode = 'P0001', hint = 'period_closed';
    end if;
    perform set_config('app.time_system', 'on', true);
    update public.time_entry set status = 'pending', approved_by = null, approved_at = null where id = t.id;
    perform set_config('app.time_system', 'off', true);
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.unapprove_time_entries(uuid[]) from public, anon;
grant execute on function public.unapprove_time_entries(uuid[]) to authenticated;

create function public.reopen_expense_items(p_trip_ids uuid[], p_expense_ids uuid[])
returns integer language plpgsql security definer set search_path = '' as $$
declare
  r record;
  n integer := 0;
begin
  for r in
    select 'mileage_trip' as tbl, id, organization_id, employee_id, department_id, status, archived_at,
           trip_date as d
    from public.mileage_trip where id = any (coalesce(p_trip_ids, '{}'))
    union all
    select 'expense', id, organization_id, employee_id, department_id, status, archived_at, expense_date
    from public.expense where id = any (coalesce(p_expense_ids, '{}'))
  loop
    continue when r.status not in ('approved', 'rejected') or r.archived_at is not null;
    if not (private.can_on_department('time.approve', r.department_id) or private.is_time_approver(r.employee_id)) then
      raise exception 'not allowed' using errcode = '42501';
    end if;
    if private.is_own_employee(r.employee_id)
       and private.permission_scope(r.organization_id, 'time.approve') <> 'organization' then
      raise exception 'cannot change own items' using errcode = '42501';
    end if;
    if private.in_closed_period(r.employee_id, r.d) then
      raise exception 'the pay period is closed' using errcode = 'P0001', hint = 'period_closed';
    end if;
    perform set_config('app.expense_system', 'on', true);
    execute format('update public.%I set status = ''pending'', decided_by = null, decided_at = null,
                    decision_note = null where id = $1', r.tbl) using r.id;
    perform set_config('app.expense_system', 'off', true);
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.reopen_expense_items(uuid[], uuid[]) from public, anon;
grant execute on function public.reopen_expense_items(uuid[], uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Pay period groups: edit and delete
-- ---------------------------------------------------------------------------
-- The name can always change. The schedule can change while no period has been
-- calculated or closed; the generated (empty) periods are then made again.
create function public.update_pay_period_group(
  p_id uuid, p_name text, p_frequency public.pay_frequency, p_anchor_date date, p_month_start_day smallint)
returns void language plpgsql security definer set search_path = '' as $$
declare
  g public.pay_period_group;
begin
  select * into g from public.pay_period_group where id = p_id and archived_at is null for update;
  if g.id is null then raise exception 'not found' using errcode = 'P0002'; end if;
  if not private.has_org_permission(g.organization_id, 'settings.manage') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if (g.frequency, g.anchor_date, g.month_start_day) is distinct from (p_frequency, p_anchor_date, p_month_start_day) then
    if exists (select 1 from public.pay_period p where p.group_id = p_id
               and (p.status = 'closed' or exists (select 1 from public.pay_run r where r.pay_period_id = p.id))) then
      raise exception 'the group has calculated periods' using errcode = 'P0001', hint = 'group_in_use';
    end if;
    -- Generated periods without any calculation: made again from the new schedule.
    delete from public.pay_period where group_id = p_id;
  end if;
  update public.pay_period_group
  set name = p_name, frequency = p_frequency, anchor_date = p_anchor_date, month_start_day = p_month_start_day
  where id = p_id;
end $$;
revoke execute on function public.update_pay_period_group(uuid, text, public.pay_frequency, date, smallint) from public, anon;
grant execute on function public.update_pay_period_group(uuid, text, public.pay_frequency, date, smallint) to authenticated;

create function public.archive_pay_period_group(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  g public.pay_period_group;
begin
  select * into g from public.pay_period_group where id = p_id and archived_at is null for update;
  if g.id is null then raise exception 'not found' using errcode = 'P0002'; end if;
  if not private.has_org_permission(g.organization_id, 'settings.manage') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if exists (select 1 from public.contract c where c.pay_period_group_id = p_id
             and (c.valid_to is null or c.valid_to >= current_date)) then
    raise exception 'contracts use the group' using errcode = 'P0001', hint = 'group_has_contracts';
  end if;
  update public.pay_period_group set archived_at = now() where id = p_id;
end $$;
revoke execute on function public.archive_pay_period_group(uuid) from public, anon;
grant execute on function public.archive_pay_period_group(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Contracts: may be corrected, but not where a closed pay period used them
-- ---------------------------------------------------------------------------
create function private.contract_guard_closed() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  last_closed date;
begin
  select max(p.end_date) into last_closed
  from public.pay_period p
  where p.group_id = old.pay_period_group_id and p.status = 'closed'
    and p.end_date >= old.valid_from and (old.valid_to is null or p.start_date <= old.valid_to);
  if last_closed is null then return new; end if;
  -- Terms that a closed period has paid by cannot change.
  if (new.agreement_id, new.local_agreement_id, new.pay_form, new.weekly_norm_minutes, new.pay_period_group_id,
      new.staff_group, new.pay_step, new.valid_from, new.overrides)
     is distinct from
     (old.agreement_id, old.local_agreement_id, old.pay_form, old.weekly_norm_minutes, old.pay_period_group_id,
      old.staff_group, old.pay_step, old.valid_from, old.overrides) then
    raise exception 'a closed pay period used this contract' using errcode = 'P0001', hint = 'contract_in_closed_period';
  end if;
  -- Ending it is fine, but not before the closed periods it paid.
  if new.valid_to is not null and new.valid_to < last_closed then
    raise exception 'a closed pay period used this contract' using errcode = 'P0001', hint = 'contract_in_closed_period';
  end if;
  return new;
end $$;
create trigger contract_guard_closed before update on public.contract
  for each row execute function private.contract_guard_closed();

-- ---------------------------------------------------------------------------
-- Delete an employee: archived (kept for history) and the login is removed
-- ---------------------------------------------------------------------------
create function public.archive_employee(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  e public.employee;
begin
  select * into e from public.employee where id = p_id and archived_at is null for update;
  if e.id is null then raise exception 'not found' using errcode = 'P0002'; end if;
  if not private.can_on_employee('employees.manage', p_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if e.user_id = (select auth.uid()) then
    raise exception 'cannot delete yourself' using errcode = 'P0001', hint = 'self';
  end if;
  if exists (select 1 from public.contract c where c.employee_id = p_id
             and (c.valid_to is null or c.valid_to >= current_date)) then
    raise exception 'the employee has an active contract' using errcode = 'P0001', hint = 'active_contract';
  end if;
  if e.user_id is not null and exists (
    select 1 from public.membership m join public.permission_profile pp on pp.id = m.profile_id
    where m.organization_id = e.organization_id and m.user_id = e.user_id and pp.is_owner
  ) then
    raise exception 'an administrator cannot be deleted here' using errcode = 'P0001', hint = 'is_owner';
  end if;
  update public.employee set archived_at = now(), terminated_on = coalesce(terminated_on, current_date)
  where id = p_id;
  if e.user_id is not null then
    delete from public.membership where organization_id = e.organization_id and user_id = e.user_id;
  end if;
end $$;
revoke execute on function public.archive_employee(uuid) from public, anon;
grant execute on function public.archive_employee(uuid) to authenticated;
