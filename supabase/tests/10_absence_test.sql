-- Absence requests, decisions and the leave ledger.
begin;
select plan(18);

\set org1 20000000-0000-0000-0000-000000000001
\set admin 10000000-0000-0000-0000-000000000001
\set manager 10000000-0000-0000-0000-000000000002
\set emp 10000000-0000-0000-0000-000000000003
\set young 10000000-0000-0000-0000-000000000004
\set mads 50000000-0000-0000-0000-000000000002
\set lise 50000000-0000-0000-0000-000000000001

select tests.login_as(:'emp');
select lives_ok(format($$insert into public.absence (id, organization_id, employee_id, type_code, from_date, to_date, note)
  values ('80000000-0000-0000-0000-000000000001', %L, %L, 'vacation', '2027-07-05', '2027-07-09', 'Sommerferie')$$, :'org1', :'mads'),
  'an employee requests vacation');
select throws_ok(format($$insert into public.absence (organization_id, employee_id, type_code, from_date, to_date)
  values (%L, %L, 'vacation', '2027-07-08', '2027-07-12')$$, :'org1', :'mads'), '23P01', null, 'overlapping requests are refused');
select throws_ok(format($$insert into public.absence (organization_id, employee_id, type_code, from_date, to_date, status)
  values (%L, %L, 'sick', '2027-08-02', '2027-08-02', 'approved')$$, :'org1', :'mads'), '42501', null, 'nobody inserts an approved absence');
update public.absence set status = 'approved';
select is((select status::text from public.absence where id = '80000000-0000-0000-0000-000000000001'), 'requested',
  'status changes only through the RPCs');
select throws_ok($$select public.decide_absence('80000000-0000-0000-0000-000000000001', true, null, '[]')$$, '42501', null,
  'employees cannot approve');
select throws_ok(format($$select public.post_leave_accruals(%L, '[]')$$, :'mads'), '42501', null,
  'users cannot post accruals');
select tests.logout();

select tests.login_as(:'young');
select is((select count(*) from public.absence), 0::bigint, 'colleagues do not see each other''s absence');
select tests.logout();

select tests.login_as(:'manager');
select is((select count(*) from public.absence where employee_id = :'mads'), 1::bigint, 'the manager sees the request');
select throws_ok($$select public.decide_absence('80000000-0000-0000-0000-000000000001', true, null,
  '[{"account": "extra", "period_start": "2026-09-01", "usable_until": "2027-12-31", "hundredths": -500}]')$$,
  '22023', null, 'usage must be drawn from the right account');
select lives_ok($$select public.decide_absence('80000000-0000-0000-0000-000000000001', true, 'God ferie',
  '[{"account": "vacation", "period_start": "2026-09-01", "usable_until": "2027-12-31", "hundredths": -500}]')$$,
  'the manager approves with usage postings');
select is((select sum(hundredths) from public.leave_posting where employee_id = :'mads' and account = 'vacation'), -500::bigint,
  'the balance is the sum of postings');
update public.leave_posting set hundredths = 1;
select is((select sum(hundredths) from public.leave_posting where employee_id = :'mads' and account = 'vacation'), -500::bigint,
  'users cannot change postings');
select lives_ok($$select public.cancel_absence('80000000-0000-0000-0000-000000000001', 'Aflyst')$$, 'an approved absence is cancelled');
select is((select sum(hundredths) from public.leave_posting where employee_id = :'mads' and account = 'vacation'), 0::bigint,
  'a cancellation reverses the usage with new postings');
select throws_ok(format($$select public.add_leave_posting(%L, 'vacation', 'payout', '2026-09-01', '2027-12-31', -100, 'x')$$, :'mads'),
  '23514', null, 'manual postings need a reason');
select lives_ok(format($$select public.add_leave_posting(%L, 'vacation', 'transfer', '2026-09-01', '2027-12-31', 300, 'Overført efter aftale')$$, :'mads'),
  'a manager posts a transfer');
select tests.logout();
select throws_ok($$update public.leave_posting set note = 'x'$$, '42501', null, 'the ledger is append-only, even for the database owner');
select throws_ok($$update public.absence set status = 'approved'$$, '42501', null, 'absences change only through the RPCs');

select * from finish();
rollback;
