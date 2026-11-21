-- Undo and correct: primary department, approvals, pay period groups, contracts, employees.
begin;
select plan(14);

\set org1 20000000-0000-0000-0000-000000000001
\set admin 10000000-0000-0000-0000-000000000001
\set manager 10000000-0000-0000-0000-000000000002
\set emp 10000000-0000-0000-0000-000000000003
\set butik 30000000-0000-0000-0000-000000000001
\set cafe 30000000-0000-0000-0000-000000000002
\set mads 50000000-0000-0000-0000-000000000002
\set monthly 40000000-0000-0000-0000-000000000001
\set biweekly 40000000-0000-0000-0000-000000000002

-- Primary department -------------------------------------------------------
select tests.login_as(:'manager');
select lives_ok(format($$select public.set_primary_department(%L, %L)$$, :'mads', :'cafe'),
  'a manager chooses the primary department');
select is((select string_agg(department_id::text || '=' || is_primary, ',' order by department_id)
           from public.employee_department where employee_id = :'mads'),
  :'butik' || '=false,' || :'cafe' || '=true', 'only one department is primary');
select tests.logout();

select tests.login_as(:'admin');
delete from public.employee_department where employee_id = :'mads' and department_id = :'cafe';
select is((select department_id::text from public.employee_department where employee_id = :'mads' and is_primary),
  :'butik', 'removing the primary department makes another one primary');
select tests.logout();

-- Undo approval of time ----------------------------------------------------
set local app.time_system = 'on';
insert into public.time_entry (id, organization_id, employee_id, department_id, start_at, end_at, source, status, approved_at, approved_by)
values ('71000000-0000-0000-0000-000000000001', :'org1', :'mads', :'butik', '2026-10-05 08:00+02', '2026-10-05 16:00+02', 'manual', 'approved', now(), :'manager'),
       ('71000000-0000-0000-0000-000000000002', :'org1', :'mads', :'butik', '2026-09-08 08:00+02', '2026-09-08 16:00+02', 'manual', 'approved', now(), :'manager');
-- 7–20 September is closed (paid).
insert into public.pay_period (organization_id, group_id, start_date, end_date, status, closed_at)
values (:'org1', :'biweekly', '2026-09-07', '2026-09-20', 'closed', now());
reset app.time_system;

select tests.login_as(:'emp');
select throws_ok($$select public.unapprove_time_entries(array['71000000-0000-0000-0000-000000000001'::uuid])$$,
  '42501', null, 'an employee cannot undo an approval');
select tests.logout();

select tests.login_as(:'manager');
select is((select public.unapprove_time_entries(array['71000000-0000-0000-0000-000000000001'::uuid])), 1,
  'the manager undoes an approval');
select is((select status::text || '/' || coalesce(approved_by::text, '-') from public.time_entry
           where id = '71000000-0000-0000-0000-000000000001'), 'pending/-', 'it waits for approval again');
select throws_ok($$select public.unapprove_time_entries(array['71000000-0000-0000-0000-000000000002'::uuid])$$,
  'P0001', 'the pay period is closed', 'but not when the pay period is closed');
select tests.logout();

-- Pay period groups -----------------------------------------------------------
select tests.login_as(:'admin');
select lives_ok(format($$select public.update_pay_period_group(%L, 'Månedsløn', 'monthly', null, 1::smallint)$$, :'monthly'),
  'a group can be renamed');
select throws_ok(format($$select public.update_pay_period_group(%L, 'Timeløn', 'weekly', '2026-01-05', null)$$, :'biweekly'),
  'P0001', 'the group has calculated periods', 'the schedule cannot change once a period is closed');
select throws_ok(format($$select public.archive_pay_period_group(%L)$$, :'biweekly'),
  'P0001', 'contracts use the group', 'a group in use by contracts cannot be deleted');

-- Contracts -------------------------------------------------------------------
select throws_ok(format($$update public.contract set weekly_norm_minutes = 1800 where employee_id = %L$$, :'mads'),
  'P0001', 'a closed pay period used this contract', 'paid terms of a contract cannot change');
select lives_ok(format($$update public.contract set valid_to = '2027-01-31' where employee_id = %L$$, :'mads'),
  'but it can still be ended after the closed periods');

-- Employees -------------------------------------------------------------------
select throws_ok(format($$select public.archive_employee(%L)$$, :'mads'),
  'P0001', 'the employee has an active contract', 'an employee with an active contract is not deleted');
select tests.logout();

select tests.login_as(:'manager');
select throws_ok(format($$select public.update_pay_period_group(%L, 'X', 'monthly', null, 1::smallint)$$, :'monthly'),
  '42501', null, 'only settings.manage edits pay period groups');
select tests.logout();

select * from finish();
rollback;
