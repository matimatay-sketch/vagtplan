-- Import from CSV files: departments, employees, shifts and leave balances.
--
-- The app reads and checks the file and resolves names to ids (see
-- src/lib/import/plan.ts). These functions then write all rows in ONE
-- transaction: a file is imported whole or not at all. They run with the
-- caller's own rights (security invoker), so RLS and the RPCs' own permission
-- checks decide exactly as when the same changes are made by hand. A failing
-- row is reported with its line in the file (hint "import_line:<n>").

create function public.import_departments(p_org uuid, p_rows jsonb)
returns integer language plpgsql security invoker set search_path = '' as $$
declare
  r jsonb;
  n integer := 0;
begin
  if not private.is_member(p_org) then raise exception 'not allowed' using errcode = '42501'; end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    begin
      if r ->> 'id' is null then
        insert into public.department (organization_id, name) values (p_org, trim(r ->> 'name'));
      else
        update public.department set name = trim(r ->> 'new_name')
        where id = (r ->> 'id')::uuid and organization_id = p_org and archived_at is null;
        if not found then raise exception 'not allowed' using errcode = '42501'; end if;
      end if;
      n := n + 1;
    exception when others then
      raise exception '%', sqlerrm using errcode = sqlstate, hint = 'import_line:' || (r ->> 'line');
    end;
  end loop;
  return n;
end $$;

-- Rows: {line, id (null = new), employee_number, first_name, last_name, birth_date,
-- email, phone, hired_on, department_id, contract: {agreement_id, pay_period_group_id,
-- weekly_norm_minutes, pay_form, valid_from} | null}. On a change, null = unchanged.
create function public.import_employees(p_org uuid, p_rows jsonb)
returns integer language plpgsql security invoker set search_path = '' as $$
declare
  r jsonb;
  c jsonb;
  emp uuid;
  n integer := 0;
begin
  if not private.is_member(p_org) then raise exception 'not allowed' using errcode = '42501'; end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    begin
      if r ->> 'id' is null then
        emp := public.create_employee(
          (r ->> 'department_id')::uuid, r ->> 'employee_number', r ->> 'first_name', r ->> 'last_name',
          (r ->> 'birth_date')::date, r ->> 'email', r ->> 'phone', false, null, (r ->> 'hired_on')::date);
      else
        emp := (r ->> 'id')::uuid;
        update public.employee set
          first_name = coalesce(r ->> 'first_name', first_name),
          last_name = coalesce(r ->> 'last_name', last_name),
          birth_date = coalesce((r ->> 'birth_date')::date, birth_date),
          email = coalesce(r ->> 'email', email),
          phone = coalesce(r ->> 'phone', phone),
          hired_on = coalesce((r ->> 'hired_on')::date, hired_on)
        where id = emp and organization_id = p_org and archived_at is null;
        if not found then raise exception 'not allowed' using errcode = '42501'; end if;
        if r ->> 'department_id' is not null and not exists (
          select 1 from public.employee_department
          where employee_id = emp and department_id = (r ->> 'department_id')::uuid) then
          insert into public.employee_department (organization_id, employee_id, department_id, is_primary)
          values (p_org, emp, (r ->> 'department_id')::uuid,
                  not exists (select 1 from public.employee_department where employee_id = emp));
        end if;
      end if;
      c := r -> 'contract';
      if c is not null and jsonb_typeof(c) = 'object' then
        insert into public.contract (organization_id, employee_id, agreement_id, pay_period_group_id,
          weekly_norm_minutes, pay_form, valid_from)
        values (p_org, emp, (c ->> 'agreement_id')::uuid, (c ->> 'pay_period_group_id')::uuid,
          (c ->> 'weekly_norm_minutes')::integer, (c ->> 'pay_form')::public.pay_form, (c ->> 'valid_from')::date);
      end if;
      n := n + 1;
    exception when others then
      raise exception '%', sqlerrm using errcode = sqlstate, hint = 'import_line:' || (r ->> 'line');
    end;
  end loop;
  return n;
end $$;

-- Rows: {line, department_id, employee_id | null, start_at, end_at, break_minutes, kind, label}.
-- Shifts are created as drafts and published as usual (the rules are checked then).
create function public.import_shifts(p_org uuid, p_rows jsonb)
returns integer language plpgsql security invoker set search_path = '' as $$
declare
  r jsonb;
  n integer := 0;
begin
  if not private.is_member(p_org) then raise exception 'not allowed' using errcode = '42501'; end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    begin
      insert into public.shift (organization_id, department_id, employee_id, start_at, end_at, breaks, kind, label)
      values (p_org, (r ->> 'department_id')::uuid, (r ->> 'employee_id')::uuid,
        (r ->> 'start_at')::timestamptz, (r ->> 'end_at')::timestamptz,
        case when coalesce((r ->> 'break_minutes')::integer, 0) > 0
          then jsonb_build_array(jsonb_build_object('start_at', null, 'minutes', (r ->> 'break_minutes')::integer, 'paid', false))
          else '[]'::jsonb end,
        coalesce(r ->> 'kind', 'work')::public.shift_kind, nullif(trim(coalesce(r ->> 'label', '')), ''));
      n := n + 1;
    exception when others then
      raise exception '%', sqlerrm using errcode = sqlstate, hint = 'import_line:' || (r ->> 'line');
    end;
  end loop;
  return n;
end $$;

-- Rows: {line, employee_id, account, period_start, usable_until, hundredths, note}.
-- Each row is an adjustment posting (balances are never edited, only posted to).
create function public.import_balances(p_org uuid, p_rows jsonb)
returns integer language plpgsql security invoker set search_path = '' as $$
declare
  r jsonb;
  n integer := 0;
begin
  if not private.is_member(p_org) then raise exception 'not allowed' using errcode = '42501'; end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    begin
      if not exists (select 1 from public.employee where id = (r ->> 'employee_id')::uuid and organization_id = p_org) then
        raise exception 'employee not found' using errcode = 'P0002';
      end if;
      perform public.add_leave_posting((r ->> 'employee_id')::uuid, r ->> 'account', 'adjustment',
        (r ->> 'period_start')::date, (r ->> 'usable_until')::date, (r ->> 'hundredths')::integer, r ->> 'note');
      n := n + 1;
    exception when others then
      raise exception '%', sqlerrm using errcode = sqlstate, hint = 'import_line:' || (r ->> 'line');
    end;
  end loop;
  return n;
end $$;

revoke execute on function public.import_departments(uuid, jsonb) from public, anon;
revoke execute on function public.import_employees(uuid, jsonb) from public, anon;
revoke execute on function public.import_shifts(uuid, jsonb) from public, anon;
revoke execute on function public.import_balances(uuid, jsonb) from public, anon;
grant execute on function public.import_departments(uuid, jsonb) to authenticated;
grant execute on function public.import_employees(uuid, jsonb) to authenticated;
grant execute on function public.import_shifts(uuid, jsonb) to authenticated;
grant execute on function public.import_balances(uuid, jsonb) to authenticated;
