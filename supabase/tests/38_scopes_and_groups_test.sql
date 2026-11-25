-- "Gælder for" on deviation reasons and supplement types; employee groups.
begin;
select plan(13);

\set org1 20000000-0000-0000-0000-000000000001
\set butik 30000000-0000-0000-0000-000000000001
\set cafe 30000000-0000-0000-0000-000000000002
\set detail a0000000-0000-0000-0000-000000000002
\set other a0000000-0000-0000-0000-000000000001
\set admin 10000000-0000-0000-0000-000000000001
\set lise 10000000-0000-0000-0000-000000000002
\set mads_user 10000000-0000-0000-0000-000000000003
\set mads 50000000-0000-0000-0000-000000000002
\set lise_emp 50000000-0000-0000-0000-000000000001

-- ---------------------------------------------------------------- groups
select tests.login_as(:'admin');
select lives_ok(format($$insert into public.employee_group (id, organization_id, name)
  values ('ab000000-0000-0000-0000-000000000001', %L, 'Chauffører')$$, :'org1'),
  'an administrator creates an employee group');
select throws_ok(format($$insert into public.employee_group (organization_id, name) values (%L, 'chauffører')$$, :'org1'),
  '23505', null, 'names are unique (case does not matter)');
select lives_ok(format($$update public.employee set employee_group_id = 'ab000000-0000-0000-0000-000000000001' where id = %L$$, :'mads'),
  'and puts an employee in it');
select tests.logout();

select tests.login_as(:'mads_user');
select throws_ok(format($$insert into public.employee_group (organization_id, name) values (%L, 'Mine')$$, :'org1'),
  '42501', null, 'an employee cannot create groups');
select tests.logout();

-- ---------------------------------------------------------------- in_scope
select is(private.in_scope(:'mads', current_date, null, '{}', '{}', '{}'), true, 'empty lists mean everyone');
select is(private.in_scope(:'mads', current_date, null, array[:'cafe']::uuid[], '{}', '{}'), true,
  'one of the employee''s departments is enough');
select is(private.in_scope(:'mads', current_date, :'butik', array[:'cafe']::uuid[], '{}', '{}'), false,
  'with a department given, that department must be in the list');
select is(private.in_scope(:'mads', current_date, null, '{}', array[:'detail']::uuid[], '{}'), true,
  'the agreement of the contract');
select is(private.in_scope(:'mads', current_date, null, '{}', array[:'other']::uuid[], '{}'), false,
  'another agreement');
select is(private.in_scope(:'mads', current_date, null, '{}', '{}', array['ab000000-0000-0000-0000-000000000001']::uuid[]), true,
  'the employee group');
select is(private.in_scope(:'lise_emp', current_date, null, '{}', '{}', array['ab000000-0000-0000-0000-000000000001']::uuid[]), false,
  'an employee outside the group');

-- ---------------------------------------------------------------- enforcement
insert into public.deviation_reason (id, organization_id, name, applies_to, treatment, employee_group_ids)
values ('ac000000-0000-0000-0000-000000000001', :'org1', 'Kørsel', '{unplanned}', 'none',
        array['ab000000-0000-0000-0000-000000000001']::uuid[]);
insert into public.supplement_type (id, organization_id, name, pay_code, amount_type, amount, employee_selectable, department_ids)
values ('ad000000-0000-0000-0000-000000000001', :'org1', 'Café-tillæg', 'CAFE', 'per_hour', 1000, true, array[:'cafe']::uuid[]);

select tests.login_as(:'lise');
select throws_ok(format($$insert into public.time_entry (organization_id, employee_id, department_id, start_at, end_at, source, status, start_reason_id)
  values (%L, %L, %L, now() - interval '30 days', now() - interval '30 days' + interval '1 hour', 'manual', 'pending', 'ac000000-0000-0000-0000-000000000001')$$,
  :'org1', :'lise_emp', :'butik'),
  '23514', null, 'a reason for another group cannot be chosen');
select tests.logout();

select tests.login_as(:'mads_user');
select throws_ok(format($$insert into public.time_entry (organization_id, employee_id, department_id, start_at, end_at, source, status, supplement_type_ids)
  values (%L, %L, %L, now() - interval '31 days', now() - interval '31 days' + interval '1 hour', 'manual', 'pending', array['ad000000-0000-0000-0000-000000000001']::uuid[])$$,
  :'org1', :'mads', :'butik'),
  '42501', null, 'an employee cannot add a supplement of another department');
select tests.logout();

select * from finish();
rollback;
