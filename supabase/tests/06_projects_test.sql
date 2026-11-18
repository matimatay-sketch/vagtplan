-- Projects (values of the project posting dimension) and project hours on shifts.
begin;
select plan(9);

\set org1 20000000-0000-0000-0000-000000000001
\set admin 10000000-0000-0000-0000-000000000001
\set manager 10000000-0000-0000-0000-000000000002
\set emp 10000000-0000-0000-0000-000000000003
\set butik 30000000-0000-0000-0000-000000000001
\set cafe 30000000-0000-0000-0000-000000000002
\set mads 50000000-0000-0000-0000-000000000002
\set dim 90000000-0000-0000-0000-0000000000d1

select tests.login_as(:'manager');
select throws_ok(format($$insert into public.posting_dimension (organization_id, key, name, is_project) values (%L, 'projekt', 'Projekt', true)$$, :'org1'),
  '42501', null, 'managers cannot create projects by default');
select tests.logout();

select tests.login_as(:'admin');
insert into public.posting_dimension (id, organization_id, key, name, is_project) values (:'dim', :'org1', 'projekt', 'Projekt', true);
select lives_ok(format($$insert into public.posting_value (id, organization_id, dimension_id, code, name, description) values
  ('90000000-0000-0000-0000-000000000001', %L, %L, '1001', 'Ombygning', 'Kunde A'),
  ('90000000-0000-0000-0000-000000000002', %L, %L, '1002', 'Kun café', null)$$, :'org1', :'dim', :'org1', :'dim'), 'admin creates projects');
select lives_ok(format($$insert into public.posting_value_department (organization_id, value_id, department_id)
  values (%L, '90000000-0000-0000-0000-000000000002', %L)$$, :'org1', :'cafe'), 'a project can be limited to a department');
select throws_ok(format($$insert into public.posting_value (organization_id, dimension_id, code, name) values (%L, %L, '1001', 'Dublet')$$, :'org1', :'dim'),
  '23505', null, 'project numbers are unique among active projects');
select tests.logout();

select tests.login_as(:'manager');
select lives_ok(format($$insert into public.shift (id, organization_id, department_id, employee_id, start_at, end_at, posting_allocations)
  values ('60000000-0000-0000-0000-0000000000a1', %L, %L, %L, '2027-02-01 07:00Z', '2027-02-01 15:00Z',
  '[{"values":{"%s":"90000000-0000-0000-0000-000000000001"},"start_at":null,"end_at":null,"minutes":null}]')$$, :'org1', :'butik', :'mads', :'dim'),
  'a shift gets a project');
select throws_ok(format($$insert into public.shift (organization_id, department_id, start_at, end_at, posting_allocations)
  values (%L, %L, '2027-02-01 07:00Z', '2027-02-01 15:00Z', '[{"values":{"%s":"90000000-0000-0000-0000-000000000002"}}]')$$, :'org1', :'butik', :'dim'),
  '23514', null, 'a project limited to Café cannot be used in Butik');
select is((select count(*) from public.project_shifts('2027-01-01', '2027-03-01')), 1::bigint, 'manager sees project hours for own department');
select tests.logout();

select tests.login_as(:'emp');
select is((select count(*) from public.project_shifts('2027-01-01', '2027-03-01')), 0::bigint, 'employees do not see project hours by default');
select tests.logout();

select ok((select count(*) from public.permission_grant g join public.permission_profile p on p.id = g.profile_id
  where p.is_owner and g.permission in ('projects.view', 'projects.manage')) = 2, 'the owner profile has the project permissions');

select * from finish();
rollback;
