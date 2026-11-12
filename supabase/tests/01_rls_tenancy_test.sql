-- RLS: tenancy and role scoping. Relies on supabase/seed.sql.
begin;
select plan(27);

-- Seed ids
\set org1 20000000-0000-0000-0000-000000000001
\set admin 10000000-0000-0000-0000-000000000001
\set manager 10000000-0000-0000-0000-000000000002
\set emp 10000000-0000-0000-0000-000000000003
\set butik 30000000-0000-0000-0000-000000000001
\set cafe 30000000-0000-0000-0000-000000000002
\set mads 50000000-0000-0000-0000-000000000002
\set carl 50000000-0000-0000-0000-000000000004

-- A second, unrelated organization with its own admin.
select tests.create_user('other-admin@test.dk') as other_admin \gset
select tests.login_as(:'other_admin');
select public.create_organization('Anden Virksomhed A/S') as org2 \gset
select tests.logout();

-- ---------------------------------------------------------------- tenancy
select tests.login_as(:'other_admin');
select is((select count(*) from public.organization), 1::bigint, 'other admin sees only own organization');
select is((select count(*) from public.employee), 0::bigint, 'other admin sees no employees of org1');
select is((select count(*) from public.department), 0::bigint, 'other admin sees no departments of org1');
select is((select count(*) from public.contract), 0::bigint, 'other admin sees no contracts of org1');
select is((select count(*) from public.pay_period_group), 1::bigint, 'create_organization made a default pay period group');
select is((select count(*) from public.agreement where organization_id is null), 2::bigint, 'system agreement templates are readable');
select throws_ok(
  format($$insert into public.department (organization_id, name) values (%L, 'Hack')$$, :'org1'),
  '42501', null, 'other admin cannot create a department in org1');
select lives_ok(
  format($$update public.employee set first_name = 'X' where id = %L$$, :'mads'),
  'update of invisible employee is a silent no-op');
select tests.logout();
select is((select first_name from public.employee where id = :'mads'), 'Mads', 'employee in org1 unchanged');

-- ---------------------------------------------------------------- admin
select tests.login_as(:'admin');
select is((select count(*) from public.employee), 4::bigint, 'admin sees all 4 employees');
select is((select count(*) from public.contract), 4::bigint, 'admin sees all contracts');
select lives_ok(
  format($$insert into public.department (organization_id, name) values (%L, 'Lager')$$, :'org1'),
  'admin can create a department');
select ok((select count(*) from public.audit_log where table_name = 'department' and action = 'INSERT') >= 1,
  'department insert is audited and visible to admin');
select tests.logout();

-- ---------------------------------------------------------------- manager
select tests.login_as(:'manager');
select is(
  (select array_agg(employee_number order by employee_number) from public.employee),
  array['1001', '1002', '1003'],
  'manager sees only employees in managed department (Butik)');
select is((select count(*) from public.employee where id = :'carl'), 0::bigint, 'manager cannot see Café-only employee');
select is((select count(*) from public.department), 3::bigint, 'manager can read department names (incl. Lager created above)');
select throws_ok(
  format($$insert into public.department (organization_id, name) values (%L, 'Nope')$$, :'org1'),
  '42501', null, 'manager cannot create departments');
select lives_ok(
  format($$select public.create_employee(%L, '1099', 'Nina', 'Ny', '2000-01-01')$$, :'butik'),
  'manager can create employee in own department');
select throws_ok(
  format($$select public.create_employee(%L, '2099', 'Ole', 'Ude', '2000-01-01')$$, :'cafe'),
  '42501', 'not allowed', 'manager cannot create employee in other department');
select is((select count(*) from public.audit_log), 0::bigint, 'manager cannot read the audit log');
select tests.logout();

-- ---------------------------------------------------------------- employee
select tests.login_as(:'emp');
select is((select count(*) from public.employee), 1::bigint, 'employee sees only themself');
select is((select employee_number from public.employee), '1002', 'it is their own record');
select is((select count(*) from public.contract), 1::bigint, 'employee sees only own contract');
select lives_ok(
  format($$update public.employee set first_name = 'Hacker' where id = %L$$, :'mads'),
  'employee update of own record is silently filtered');
select tests.logout();
select is((select first_name from public.employee where id = :'mads'), 'Mads', 'employee cannot edit own master data');

-- ---------------------------------------------------------------- audit log immutability
select tests.login_as(:'admin');
select throws_ok('delete from public.audit_log', '42501', null, 'audit log cannot be deleted');
select throws_ok('update public.audit_log set action = ''DELETE''', '42501', null, 'audit log cannot be updated');
select tests.logout();

select * from finish();
rollback;
