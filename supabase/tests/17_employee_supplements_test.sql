-- Supplements on registrations: employees may only add types marked employee_selectable.
begin;
select plan(8);

\set org1 20000000-0000-0000-0000-000000000001
\set admin 10000000-0000-0000-0000-000000000001
\set manager 10000000-0000-0000-0000-000000000002
\set emp 10000000-0000-0000-0000-000000000003
\set butik 30000000-0000-0000-0000-000000000001
\set mads 50000000-0000-0000-0000-000000000002
\set selectable 71000000-0000-0000-0000-000000000001
\set managerOnly 71000000-0000-0000-0000-000000000002
\set entry 72000000-0000-0000-0000-000000000001

select tests.login_as(:'admin');
insert into public.supplement_type (id, organization_id, name, pay_code, amount_type, amount, employee_selectable) values
  (:'selectable', :'org1', 'Smudstillæg', 'SMUDS', 'fixed', 2500, true),
  (:'managerOnly', :'org1', 'Ansvarstillæg', 'ANSVAR', 'fixed', 5000, false);
select tests.logout();

select tests.login_as(:'emp');
select lives_ok(
  format($$insert into public.time_entry (id, organization_id, employee_id, department_id, start_at, end_at, source, status, supplement_type_ids)
    values (%L, %L, %L, %L, '2027-06-01 06:00Z', '2027-06-01 14:00Z', 'manual', 'pending', array[%L]::uuid[])$$,
    :'entry', :'org1', :'mads', :'butik', :'selectable'),
  'an employee can add a supplement marked as selectable');
select throws_ok(
  format($$update public.time_entry set supplement_type_ids = array[%L, %L]::uuid[] where id = %L$$, :'selectable', :'managerOnly', :'entry'),
  '42501', null, 'an employee cannot add a supplement that is not selectable');
select throws_ok(
  format($$update public.time_entry set supplement_type_ids = array['71000000-0000-0000-0000-0000000000ff']::uuid[] where id = %L$$, :'entry'),
  '23503', null, 'an unknown supplement type is rejected');
select lives_ok(
  format($$update public.time_entry set supplement_type_ids = '{}' where id = %L$$, :'entry'),
  'an employee can remove a supplement again');
select tests.logout();

-- The manager (time.manage) may add any of the organization's supplements.
select tests.login_as(:'manager');
select lives_ok(
  format($$update public.time_entry set supplement_type_ids = array[%L]::uuid[] where id = %L$$, :'managerOnly', :'entry'),
  'a manager can add any supplement');
select tests.logout();

-- The employee may keep a supplement the manager added while editing other fields.
select tests.login_as(:'emp');
select lives_ok(
  format($$update public.time_entry set supplement_type_ids = array[%L, %L]::uuid[], note = 'x' where id = %L$$, :'managerOnly', :'selectable', :'entry'),
  'existing supplements are kept when the employee adds a selectable one');
select tests.logout();

-- Approval locks the supplements with the time; a correction carries them on.
select tests.login_as(:'manager');
select public.approve_time_entries(array[:'entry'::uuid]);
select throws_ok(
  format($$update public.time_entry set supplement_type_ids = '{}' where id = %L$$, :'entry'),
  '42501', null, 'approved supplements cannot be changed');
select public.correct_time_entry(:'entry', '2027-06-01 06:00Z', '2027-06-01 15:00Z', '[]', '[]', 'Ret sluttid', '[]') as corrected \gset
select is(
  (select cardinality(supplement_type_ids) from public.time_entry where id = :'corrected'),
  2, 'a correction keeps the supplements unless new ones are given');
select tests.logout();

select * from finish();
rollback;
