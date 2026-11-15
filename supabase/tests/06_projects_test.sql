-- Projects and project allocations on shifts.
begin;
select plan(9);

\set org1 20000000-0000-0000-0000-000000000001
\set admin 10000000-0000-0000-0000-000000000001
\set manager 10000000-0000-0000-0000-000000000002
\set emp 10000000-0000-0000-0000-000000000003
\set butik 30000000-0000-0000-0000-000000000001
\set cafe 30000000-0000-0000-0000-000000000002
\set mads 50000000-0000-0000-0000-000000000002

select tests.login_as(:'manager');
select throws_ok(format($$insert into public.project (organization_id, number, name) values (%L, 'P1', 'X')$$, :'org1'),
  '42501', null, 'managers cannot create projects by default');
select tests.logout();

select tests.login_as(:'admin');
select lives_ok(format($$insert into public.project (id, organization_id, number, name, customer) values
  ('90000000-0000-0000-0000-000000000001', %L, '1001', 'Ombygning', 'Kunde A'),
  ('90000000-0000-0000-0000-000000000002', %L, '1002', 'Kun café', null)$$, :'org1', :'org1'), 'admin creates projects');
select lives_ok(format($$insert into public.project_department (organization_id, project_id, department_id)
  values (%L, '90000000-0000-0000-0000-000000000002', %L)$$, :'org1', :'cafe'), 'a project can be limited to a department');
select throws_ok(format($$insert into public.project (organization_id, number, name) values (%L, '1001', 'Dublet')$$, :'org1'),
  '23505', null, 'project numbers are unique among active projects');
select tests.logout();

select tests.login_as(:'manager');
select lives_ok(format($$insert into public.shift (id, organization_id, department_id, employee_id, start_at, end_at, project_allocations)
  values ('60000000-0000-0000-0000-0000000000a1', %L, %L, %L, '2027-02-01 07:00Z', '2027-02-01 15:00Z',
  '[{"project_id":"90000000-0000-0000-0000-000000000001","start_at":null,"end_at":null,"minutes":null}]')$$, :'org1', :'butik', :'mads'),
  'a shift gets a project');
select throws_ok(format($$insert into public.shift (organization_id, department_id, start_at, end_at, project_allocations)
  values (%L, %L, '2027-02-01 07:00Z', '2027-02-01 15:00Z', '[{"project_id":"90000000-0000-0000-0000-000000000002"}]')$$, :'org1', :'butik'),
  '23514', null, 'a project limited to Café cannot be used in Butik');
select is((select count(*) from public.project_shifts('2027-01-01', '2027-03-01')), 1::bigint, 'manager sees project hours for own department');
select tests.logout();

select tests.login_as(:'emp');
select is((select count(*) from public.project_shifts('2027-01-01', '2027-03-01')), 0::bigint, 'employees do not see project hours by default');
select tests.logout();

select ok((select count(*) from public.permission_grant g join public.permission_profile p on p.id = g.profile_id
  where p.is_owner and g.permission in ('projects.view', 'projects.manage')) = 2, 'the owner profile has the new permissions');

select * from finish();
rollback;
