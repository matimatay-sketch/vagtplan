-- Per-employee time approver.
begin;
select plan(10);

\set org1 20000000-0000-0000-0000-000000000001
\set admin 10000000-0000-0000-0000-000000000001
\set manager 10000000-0000-0000-0000-000000000002
\set emp 10000000-0000-0000-0000-000000000003
\set butik 30000000-0000-0000-0000-000000000001
\set ida 50000000-0000-0000-0000-000000000003
\set lise 50000000-0000-0000-0000-000000000001

-- Registrations for Ida and Lise (as superuser).
insert into public.time_entry (organization_id, employee_id, department_id, start_at, end_at, source, status) values
  (:'org1', :'ida', :'butik', now() - interval '3 days', now() - interval '3 days' + interval '4 hours', 'manual', 'pending'),
  (:'org1', :'lise', :'butik', now() - interval '3 days', now() - interval '3 days' + interval '8 hours', 'manual', 'pending');
select id as lise_entry from public.time_entry where employee_id = :'lise' \gset

select tests.login_as(:'manager');
select throws_ok(format($$update public.employee set approver_user_id = %L where id = %L$$, :'manager', :'ida'),
  '42501', null, 'setting an approver requires users.manage');
select tests.logout();

select tests.login_as(:'admin');
select throws_ok(format($$update public.employee set approver_user_id = %L where id = %L$$, '10000000-0000-0000-0000-000000000004', :'ida'),
  '23514', null, 'nobody approves their own time');
select lives_ok(format($$update public.employee set approver_user_id = %L where id = %L$$, :'emp', :'ida'),
  'the admin makes Mads the approver of Ida');
select lives_ok(format($$update public.employee set approver_user_id = %L where id = %L$$, :'admin', :'lise'),
  'a manager can have a manager');
select tests.logout();

select tests.login_as(:'emp');
select throws_ok(format($$select * from public.organization_members(%L)$$, :'org1'), '42501', null,
  'members without users.manage cannot list the users');
select results_eq($$select * from public.time_approvees('20000000-0000-0000-0000-000000000001')$$,
  array['50000000-0000-0000-0000-000000000003'::uuid], 'Mads approves Ida personally');
select is((select count(*) from public.time_entry where employee_id = :'ida'), 1::bigint, 'the approver sees the employee''s time');
select is((select count(*) from public.time_entry where employee_id = :'lise'), 0::bigint, 'but nobody else''s');
select is(public.approve_time_entries(array(select id from public.time_entry where employee_id = :'ida')), 1, 'and approves it');
select throws_ok(format($$select public.approve_time_entries(array[%L::uuid])$$, :'lise_entry'),
  '42501', null, 'other employees'' time cannot be approved');
select tests.logout();

select * from finish();
rollback;
