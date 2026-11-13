-- Time registration: stamping, completed-as-planned, approval and corrections.
begin;
select plan(25);

\set org1 20000000-0000-0000-0000-000000000001
\set manager 10000000-0000-0000-0000-000000000002
\set emp 10000000-0000-0000-0000-000000000003
\set young 10000000-0000-0000-0000-000000000004
\set butik 30000000-0000-0000-0000-000000000001
\set mads 50000000-0000-0000-0000-000000000002
\set lise 50000000-0000-0000-0000-000000000001

-- A published shift for Mads a week ago.
select set_config('app.publishing', 'on', true);
insert into public.shift (id, organization_id, department_id, employee_id, start_at, end_at, breaks, status, published, published_at)
values ('60000000-0000-0000-0000-0000000000f1', :'org1', :'butik', :'mads', now() - interval '7 days', now() - interval '7 days' + interval '8 hours',
  '[{"start_at": null, "minutes": 30, "paid": false}]', 'published',
  jsonb_build_object('employee_id', :'mads', 'start_at', now() - interval '7 days', 'end_at', now() - interval '7 days' + interval '8 hours',
    'breaks', '[{"start_at": null, "minutes": 30, "paid": false}]'::jsonb, 'project_allocations', '[]'::jsonb, 'kind', 'work', 'label', null), now());
select set_config('app.publishing', 'off', true);

select tests.login_as(:'emp');
select is((select row_kind from public.time_overview(now() - interval '30 days', now() + interval '1 day') where shift_id = '60000000-0000-0000-0000-0000000000f1'),
  'missing', 'an ended published shift without registration is missing');
select lives_ok(format($$select public.stamp(%L, '70000000-0000-0000-0000-000000000001', 'in', now())$$, :'org1'), 'an employee stamps in');
select is((select status::text from public.time_entry where client_id = '70000000-0000-0000-0000-000000000001'), 'open', 'the registration is open');
select is(public.stamp(:'org1', '70000000-0000-0000-0000-000000000001', 'in', now()),
  (select id from public.time_entry where client_id = '70000000-0000-0000-0000-000000000001'), 'a replayed stamp returns the same registration');
select is((select count(*) from public.time_entry), 1::bigint, 'no duplicate from the replay');
select throws_ok(format($$select public.stamp(%L, '70000000-0000-0000-0000-000000000002', 'in', now())$$, :'org1'), 'P0001', null,
  'stamping in twice is refused');
select lives_ok(format($$select public.stamp(%L, '70000000-0000-0000-0000-000000000003', 'out', now())$$, :'org1'), 'the employee stamps out');
select is((select status::text from public.time_entry where client_id = '70000000-0000-0000-0000-000000000001'), 'pending', 'stamped out: awaiting approval');
select is(public.complete_as_planned(array['60000000-0000-0000-0000-0000000000f1'::uuid]), 1, 'completed as planned');
select is(public.complete_as_planned(array['60000000-0000-0000-0000-0000000000f1'::uuid]), 0, 'only once per shift');
select is((select breaks from public.time_entry where shift_id = '60000000-0000-0000-0000-0000000000f1'),
  '[{"start_at": null, "minutes": 30, "paid": false}]'::jsonb, 'the planned breaks are inherited');
select throws_ok(format($$insert into public.time_entry (organization_id, employee_id, department_id, start_at, end_at, source, status, approved_at)
  values (%L, %L, %L, now() - interval '3 days', now() - interval '3 days' + interval '1 hour', 'manual', 'approved', now())$$, :'org1', :'mads', :'butik'),
  '42501', null, 'employees cannot approve their own time');
select throws_ok($$select public.approve_time_entries(array(select id from public.time_entry))$$, '42501', null,
  'employees cannot approve');
select tests.logout();

select tests.login_as(:'young');
select is((select count(*) from public.time_entry), 0::bigint, 'colleagues do not see each other''s time');
select is((select count(*) from public.time_overview(now() - interval '30 days', now() + interval '1 day')), 0::bigint,
  'nor in the overview');
select tests.logout();

select tests.login_as(:'manager');
select is(public.approve_time_entries(array(select id from public.time_entry where employee_id = :'mads')), 2, 'the manager approves');
select tests.logout();

select tests.login_as(:'emp');
select throws_ok(format($$update public.time_entry set end_at = end_at + interval '1 hour' where shift_id = %L$$, '60000000-0000-0000-0000-0000000000f1'),
  '42501', null, 'an approved registration cannot be changed');
select tests.logout();

select tests.login_as(:'manager');
select throws_ok($$select public.correct_time_entry((select id from public.time_entry where shift_id = '60000000-0000-0000-0000-0000000000f1'),
  now() - interval '7 days', now() - interval '7 days' + interval '9 hours', '[]', '[]', 'kort')$$, '23514', null, 'a correction needs a reason');
select lives_ok($$select public.correct_time_entry((select id from public.time_entry where shift_id = '60000000-0000-0000-0000-0000000000f1'),
  now() - interval '7 days', now() - interval '7 days' + interval '9 hours', '[]', '[]', 'Blev en time længere')$$, 'a correction is a new version');
select is((select count(*) from public.time_entry where shift_id = '60000000-0000-0000-0000-0000000000f1' and superseded_at is null), 1::bigint,
  'only the new version is current');
select is((select status::text from public.time_entry where shift_id = '60000000-0000-0000-0000-0000000000f1' and superseded_at is null), 'pending',
  'the correction must be approved again');
select is((select version from public.time_overview(now() - interval '30 days', now() + interval '1 day') where shift_id = '60000000-0000-0000-0000-0000000000f1'), 2,
  'the overview shows the version number');
select is((select count(*) from public.time_entry_history((select id from public.time_entry where shift_id = '60000000-0000-0000-0000-0000000000f1' and superseded_at is null))),
  2::bigint, 'the history has both versions');
select lives_ok(format($$insert into public.time_entry (organization_id, employee_id, department_id, start_at, end_at, source, status)
  values (%L, %L, %L, now() - interval '2 days', now() - interval '2 days' + interval '1 hour', 'manual', 'pending')$$, :'org1', :'lise', :'butik'),
  'a manager registers own time');
select throws_ok(format($$select public.approve_time_entries(array(select id from public.time_entry where employee_id = %L))$$, :'lise'),
  '42501', null, 'managers with department scope cannot approve their own time');
select tests.logout();

select * from finish();
rollback;
