-- Import from CSV files: all rows in one transaction, with the caller's own rights.
begin;
select plan(14);

\set org1 20000000-0000-0000-0000-000000000001
\set butik 30000000-0000-0000-0000-000000000001
\set cafe 30000000-0000-0000-0000-000000000002
\set admin 10000000-0000-0000-0000-000000000001
\set lise 10000000-0000-0000-0000-000000000002
\set mads_user 10000000-0000-0000-0000-000000000003
\set mads 50000000-0000-0000-0000-000000000002
\set detail a0000000-0000-0000-0000-000000000002
\set hourly 40000000-0000-0000-0000-000000000002

-- ---------------------------------------------------------------- rights
select tests.login_as(:'mads_user');
select throws_ok(format($$select public.import_departments(%L, '[{"line":2,"id":null,"name":"Lager"}]')$$, :'org1'),
  '42501', null, 'an employee cannot import departments');
select tests.logout();

-- ---------------------------------------------------------------- departments: all or nothing
select tests.login_as(:'admin');
select throws_ok(format($$select public.import_departments(%L, '[{"line":2,"id":null,"name":"Lager"},{"line":3,"id":null,"name":"Butik"}]')$$, :'org1'),
  '23505', null, 'a name that is taken stops the whole file');
select is((select count(*)::int from public.department where name = 'Lager'), 0, 'and nothing from it is saved');
select is(public.import_departments(:'org1', jsonb_build_array(
  jsonb_build_object('line', 2, 'id', null, 'name', 'Lager'),
  jsonb_build_object('line', 3, 'id', :'cafe', 'new_name', 'Café & Bar'))), 2, 'departments are created and renamed');
select is((select name from public.department where id = :'cafe'), 'Café & Bar', 'the rename is saved');

-- ---------------------------------------------------------------- employees
select is(public.import_employees(:'org1', jsonb_build_array(
  jsonb_build_object('line', 2, 'id', null, 'employee_number', '1010', 'first_name', 'Ole', 'last_name', 'Hansen',
    'birth_date', '1990-02-03', 'email', 'ole@example.dk', 'department_id', :'butik',
    'contract', jsonb_build_object('agreement_id', :'detail', 'pay_period_group_id', :'hourly',
      'weekly_norm_minutes', 2250, 'pay_form', 'hourly', 'valid_from', '2026-12-01')),
  jsonb_build_object('line', 3, 'id', :'mads', 'phone', '87654321', 'department_id', :'cafe'))), 2,
  'a new employee with a contract, and a change to an existing one');
select is((select count(*)::int from public.contract c join public.employee e on e.id = c.employee_id
           where e.employee_number = '1010' and c.weekly_norm_minutes = 2250), 1, 'the contract is created');
select is((select phone || ' ' || first_name from public.employee where id = :'mads'), '87654321 Mads',
  'only the given fields change');
select is((select count(*)::int from public.employee_department where employee_id = :'mads' and department_id = :'cafe'), 1,
  'and the department is added');
select tests.logout();

-- A manager cannot import employees into a department they are not responsible for.
select tests.login_as(:'lise');
select throws_like(format($$select public.import_employees(%L, %L)$$, :'org1', jsonb_build_array(
  jsonb_build_object('line', 7, 'id', null, 'employee_number', '1020', 'first_name', 'X', 'last_name', 'Y',
    'birth_date', '1990-01-01', 'department_id', :'cafe'))),
  '%', 'the manager is refused outside her departments');

-- ---------------------------------------------------------------- shifts
select is(public.import_shifts(:'org1', jsonb_build_array(
  jsonb_build_object('line', 2, 'department_id', :'butik', 'employee_id', :'mads',
    'start_at', '2026-12-07T07:00:00Z', 'end_at', '2026-12-07T15:00:00Z', 'break_minutes', 30, 'kind', 'work', 'label', 'Kasse'))), 1,
  'the manager imports a shift in her department');
select is((select status::text || ' ' || (breaks -> 0 ->> 'minutes') from public.shift where label = 'Kasse' and employee_id = :'mads'),
  'draft 30', 'as a draft with the unpaid break');
select tests.logout();

-- ---------------------------------------------------------------- balances
select tests.login_as(:'admin');
select is(public.import_balances(:'org1', jsonb_build_array(
  jsonb_build_object('line', 2, 'employee_id', :'mads', 'account', 'vacation', 'period_start', '2026-09-01',
    'usable_until', '2027-12-31', 'hundredths', 1250, 'note', 'Saldo fra tidligere system'))), 1,
  'a balance is imported as an adjustment posting');
select is((select kind::text || ' ' || hundredths from public.leave_posting where employee_id = :'mads' and note = 'Saldo fra tidligere system'),
  'adjustment 1250', 'with the reason on the posting');
select tests.logout();

select * from finish();
rollback;
