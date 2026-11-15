-- Contract and agreement integrity.
begin;
select plan(9);

\set org1 20000000-0000-0000-0000-000000000001
\set admin 10000000-0000-0000-0000-000000000001
\set mads 50000000-0000-0000-0000-000000000002
\set detail a0000000-0000-0000-0000-000000000002
\set biweekly 40000000-0000-0000-0000-000000000002

select tests.login_as(:'admin');

-- Mads has an open-ended contract from 2023-08-15.
select throws_ok(
  format($$insert into public.contract (organization_id, employee_id, agreement_id, pay_form,
      weekly_norm_minutes, pay_period_group_id, valid_from)
    values (%L, %L, %L, 'hourly', 1500, %L, '2026-12-01')$$, :'org1', :'mads', :'detail', :'biweekly'),
  '23P01', null, 'overlapping contracts are rejected');

-- Close the old contract and start a new one the next day (switch mid-period).
select lives_ok(
  format($$update public.contract set valid_to = '2026-11-30' where employee_id = %L$$, :'mads'),
  'admin can end a contract');
select lives_ok(
  format($$insert into public.contract (organization_id, employee_id, agreement_id, pay_form,
      weekly_norm_minutes, pay_period_group_id, valid_from)
    values (%L, %L, %L, 'hourly', 1800, %L, '2026-12-01')$$, :'org1', :'mads', :'detail', :'biweekly'),
  'a consecutive contract is accepted');

select throws_ok(
  format($$insert into public.contract (organization_id, employee_id, agreement_id, pay_form,
      weekly_norm_minutes, pay_period_group_id, valid_from, valid_to)
    values (%L, %L, %L, 'hourly', 1800, %L, '2027-02-01', '2027-01-01')$$, :'org1', :'mads', :'detail', :'biweekly'),
  '23514', null, 'valid_to before valid_from is rejected');

select throws_ok(
  format($$insert into public.contract (organization_id, employee_id, agreement_id, pay_form,
      weekly_norm_minutes, pay_period_group_id, valid_from, exempt_from_registration)
    values (%L, %L, %L, 'monthly', 2220, %L, '2030-01-01', true)$$, :'org1', :'mads', :'detail', :'biweekly'),
  '23514', null, 'exemption from registration requires reason and date');

select throws_ok(
  format($$insert into public.pay_period_group (organization_id, name, frequency, anchor_date)
    values (%L, 'Tirsdag', 'weekly', '2026-01-06')$$, :'org1'),
  '23514', null, 'weekly pay periods must start on a Monday');

select throws_ok(
  format($$update public.employee set organization_id = gen_random_uuid() where id = %L$$, :'mads'),
  '42501', null, 'organization_id is immutable');

select ok(
  (select count(*) from public.audit_log where table_name = 'contract' and action = 'UPDATE'
     and before ->> 'valid_to' is null and after ->> 'valid_to' = '2026-11-30') = 1,
  'contract change is audited with before/after');

select tests.logout();
select tests.login_as('10000000-0000-0000-0000-000000000003');
select throws_ok(
  format($$insert into public.contract (organization_id, employee_id, agreement_id, pay_form,
      weekly_norm_minutes, pay_period_group_id, valid_from)
    values (%L, %L, %L, 'hourly', 2220, %L, '2031-01-01')$$, :'org1', :'mads', :'detail', :'biweekly'),
  '42501', null, 'employee cannot create contracts for themself');
select tests.logout();

select * from finish();
rollback;
