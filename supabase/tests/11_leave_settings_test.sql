-- Organization leave rules and planned work dates.
begin;
select plan(4);

\set org1 20000000-0000-0000-0000-000000000001
\set admin 10000000-0000-0000-0000-000000000001
\set manager 10000000-0000-0000-0000-000000000002
\set young 10000000-0000-0000-0000-000000000004
\set butik 30000000-0000-0000-0000-000000000001
\set mads 50000000-0000-0000-0000-000000000002

select set_config('app.publishing', 'on', true);
insert into public.shift (organization_id, department_id, employee_id, start_at, end_at, status, published, published_at)
values (:'org1', :'butik', :'mads', '2027-03-02 07:00Z', '2027-03-02 15:00Z', 'published',
  jsonb_build_object('employee_id', :'mads', 'start_at', '2027-03-02 07:00Z', 'end_at', '2027-03-02 15:00Z',
    'breaks', '[]'::jsonb, 'kind', 'work'), now());
select set_config('app.publishing', 'off', true);

select tests.login_as(:'manager');
update public.organization_settings set leave_rules = '{"on_call_counts_as_rest": false}';
select is((select leave_rules from public.organization_settings), '{}'::jsonb, 'managers cannot change the organization''s leave rules');
select results_eq(format($$select * from public.planned_work_dates(%L, '2027-03-01', '2027-03-07')$$, :'mads'),
  array['2027-03-02'::date], 'the manager gets the planned work dates');
select tests.logout();

select tests.login_as(:'young');
select is((select count(*) from public.planned_work_dates(:'mads', '2027-03-01', '2027-03-07')), 0::bigint,
  'colleagues do not');
select tests.logout();

select tests.login_as(:'admin');
update public.organization_settings set leave_rules = '{"on_call_counts_as_rest": false}';
select is((select leave_rules ->> 'on_call_counts_as_rest' from public.organization_settings), 'false', 'the admin sets them');
select tests.logout();

select * from finish();
rollback;
