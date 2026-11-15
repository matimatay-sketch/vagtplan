-- Pay periods, runs and export templates.
begin;
select plan(12);

\set org1 20000000-0000-0000-0000-000000000001
\set admin 10000000-0000-0000-0000-000000000001
\set manager 10000000-0000-0000-0000-000000000002
\set emp 10000000-0000-0000-0000-000000000003
\set young 10000000-0000-0000-0000-000000000004
\set grp 40000000-0000-0000-0000-000000000002
\set mads 50000000-0000-0000-0000-000000000002
\set ida 50000000-0000-0000-0000-000000000003

select tests.login_as(:'manager');
select throws_ok(format($$insert into public.pay_period (organization_id, group_id, start_date, end_date)
  values (%L, %L, '2027-01-04', '2027-01-17')$$, :'org1', :'grp'), '42501', null, 'managers do not create pay periods');
select tests.logout();

select tests.login_as(:'admin');
insert into public.pay_period (id, organization_id, group_id, start_date, end_date)
values ('91000000-0000-0000-0000-000000000001', :'org1', :'grp', '2027-01-04', '2027-01-17');
select lives_ok(format($$select public.save_pay_run('91000000-0000-0000-0000-000000000001', %L, '1.0.0', '[]', '{}', 0,
  '[{"pay_code": "NORMAL", "label": "Normaltimer", "unit": "hours", "quantity_minutes": 450, "rate_ore": 15000, "amount_ore": 112500, "explanation": {}}]')$$, :'mads'),
  'the admin saves a calculation');
select lives_ok(format($$select public.save_pay_run('91000000-0000-0000-0000-000000000001', %L, '1.0.0', '[]', '{}', 0,
  '[{"pay_code": "NORMAL", "label": "Normaltimer", "unit": "hours", "quantity_minutes": 480, "rate_ore": 15000, "amount_ore": 120000, "explanation": {}}]')$$, :'mads'),
  'and calculates again');
select is((select count(*) from public.pay_run where employee_id = :'mads' and superseded_at is null), 1::bigint, 'only the newest run is current');
update public.pay_line set amount_ore = 1;
select is((select sum(amount_ore) from public.pay_line), 232500::numeric, 'pay lines cannot be changed by users');
select lives_ok($$select public.close_pay_period('91000000-0000-0000-0000-000000000001')$$, 'the admin closes the period');
select throws_ok(format($$select public.save_pay_run('91000000-0000-0000-0000-000000000001', %L, '1.0.0', '[]', '{}', 0, '[]')$$, :'mads'),
  '42501', null, 'a closed period is never calculated again');
select lives_ok(format($$insert into public.export_template (organization_id, name, settings) values (%L, 'Lønsystem', '{"separator": ";"}')$$, :'org1'),
  'the admin creates an export template');
select tests.logout();

select tests.login_as(:'manager');
select is((select quantity_minutes from public.pay_line l join public.pay_run r on r.id = l.pay_run_id
  where r.employee_id = :'mads' and r.superseded_at is null), 480, 'the manager sees pay lines in own departments');
select tests.logout();

select tests.login_as(:'emp');
select is((select count(*) from public.pay_run where superseded_at is null), 1::bigint, 'an employee sees own pay lines');
select tests.logout();

select tests.login_as(:'young');
select is((select count(*) from public.pay_line), 0::bigint, 'but not colleagues''');
select tests.logout();

select throws_ok($$update public.pay_line set amount_ore = 1$$, '42501', null, 'nor by the database owner');

select * from finish();
rollback;
