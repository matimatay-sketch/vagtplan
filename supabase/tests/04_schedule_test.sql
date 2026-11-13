-- Schedule: RLS, draft/published snapshot and publishing.
begin;
select plan(22);

\set org1 20000000-0000-0000-0000-000000000001
\set admin 10000000-0000-0000-0000-000000000001
\set manager 10000000-0000-0000-0000-000000000002
\set emp 10000000-0000-0000-0000-000000000003
\set young 10000000-0000-0000-0000-000000000004
\set butik 30000000-0000-0000-0000-000000000001
\set cafe 30000000-0000-0000-0000-000000000002
\set mads 50000000-0000-0000-0000-000000000002
\set ida 50000000-0000-0000-0000-000000000003
\set carl 50000000-0000-0000-0000-000000000004

-- ------------------------------------------------ manager plans in own department
select tests.login_as(:'manager');
select lives_ok(
  format($$insert into public.shift (id, organization_id, department_id, employee_id, start_at, end_at, breaks, label)
    values ('60000000-0000-0000-0000-000000000001', %L, %L, %L, '2026-12-07 07:00Z', '2026-12-07 15:00Z', '[{"start_at":null,"minutes":30,"paid":false}]', 'Kasse')$$,
    :'org1', :'butik', :'mads'),
  'manager can create a shift in own department');
select throws_ok(
  format($$insert into public.shift (organization_id, department_id, employee_id, start_at, end_at)
    values (%L, %L, %L, '2026-12-07 07:00Z', '2026-12-07 15:00Z')$$, :'org1', :'cafe', :'carl'),
  '42501', null, 'manager cannot create a shift in another department');
select is((select status::text from public.shift where id = '60000000-0000-0000-0000-000000000001'), 'draft',
  'new shifts are drafts');
select lives_ok(
  $$update public.shift set published = '{"x":1}', status = 'published' where id = '60000000-0000-0000-0000-000000000001'$$,
  'trying to publish directly does not fail ...');
select is((select (published is null and status = 'draft') from public.shift where id = '60000000-0000-0000-0000-000000000001'), true,
  '... but has no effect (only publish_schedule may publish)');
select throws_ok(
  format($$select public.publish_schedule(%L, %L, '2026-12-07', '2026-12-14', '2026-12-07', '2026-12-13', '[]')$$, :'manager', :'butik'),
  '42501', null, 'publish_schedule cannot be called by users directly');
select throws_ok(
  format($$insert into public.shift (organization_id, department_id, start_at, end_at)
    values (%L, %L, '2026-12-07 07:00Z', '2026-12-08 08:00Z')$$, :'org1', :'butik'),
  '23514', null, 'shifts longer than 24 hours are rejected');
select tests.logout();

-- ------------------------------------------------ employees only see published snapshots
select tests.login_as(:'emp');
select is((select count(*) from public.shift), 0::bigint, 'employees cannot read the shift working copy');
select is((select count(*) from public.published_shifts('2026-12-01', '2026-12-31')), 0::bigint, 'drafts are invisible to employees');
select tests.logout();

-- ------------------------------------------------ publish (service role, as the manager)
set local role service_role;
select throws_ok(
  format($$select public.publish_schedule(%L, %L, '2026-12-07', '2026-12-14', '2026-12-07', '2026-12-13',
    '[{"employee_id":"%s","rule_id":"hviletid","code":"REST_DAILY","severity":"BLOCKING","message":"x","date":"2026-12-07"}]')$$,
    :'manager', :'butik', :'mads'),
  '23514', null, 'blocking violations require an override reason');
select throws_ok(
  format($$select public.publish_schedule(%L, %L, '2026-12-07', '2026-12-14', '2026-12-07', '2026-12-13', '[]')$$, :'emp', :'butik'),
  '42501', null, 'an employee cannot publish');
select lives_ok(
  format($$select public.publish_schedule(%L, %L, '2026-12-07', '2026-12-14', '2026-12-07', '2026-12-13',
    '[{"shift_id":"60000000-0000-0000-0000-000000000001","employee_id":"%s","rule_id":"hviletid","code":"REST_DAILY","severity":"BLOCKING","message":"For kort hvile","date":"2026-12-07","override_reason":"Aftalt med medarbejderen"},
      {"employee_id":"%s","rule_id":"pause","code":"BREAK_MISSING","severity":"WARNING","message":"Pause","date":"2026-12-07"}]')$$,
    :'manager', :'butik', :'mads', :'mads'),
  'manager publishes with an override reason');
reset role;
select is((select status::text from public.shift where id = '60000000-0000-0000-0000-000000000001'), 'published', 'shift is published');
select is((select count(*) from public.rule_violation where override_reason = 'Aftalt med medarbejderen' and overridden_by = :'manager'), 1::bigint,
  'the override and its reason are stored');
select is((select blocking_count || '/' || warning_count from public.schedule_publication), '1/1', 'publication counts violations');
select ok(exists (select 1 from public.audit_log where table_name = 'shift' and action = 'UPDATE' and actor_id = :'manager'),
  'publishing is audited with the manager as actor');

select tests.login_as(:'emp');
select is((select start_at from public.published_shifts('2026-12-01', '2026-12-31')), '2026-12-07 07:00Z'::timestamptz,
  'the employee sees the published shift');
select tests.logout();

-- ------------------------------------------------ editing a published shift
select tests.login_as(:'manager');
update public.shift set start_at = '2026-12-07 09:00Z' where id = '60000000-0000-0000-0000-000000000001';
select is((select status::text from public.shift where id = '60000000-0000-0000-0000-000000000001'), 'draft', 'editing makes it a draft again');
select tests.logout();
select tests.login_as(:'emp');
select is((select start_at from public.published_shifts('2026-12-01', '2026-12-31')), '2026-12-07 07:00Z'::timestamptz,
  'employees keep seeing the published version until the next publish');
select tests.logout();

-- ------------------------------------------------ availability
select tests.login_as(:'emp');
select lives_ok(format($$insert into public.availability (organization_id, employee_id, date, kind) values (%L, %L, '2026-12-08', 'wish_off')$$, :'org1', :'mads'),
  'an employee registers own availability');
select throws_ok(format($$insert into public.availability (organization_id, employee_id, date, kind) values (%L, %L, '2026-12-08', 'unavailable')$$, :'org1', :'ida'),
  '42501', null, 'but not for colleagues');
select tests.logout();
select tests.login_as(:'manager');
select is((select count(*) from public.availability where employee_id = :'mads'), 1::bigint, 'the manager sees availability of own employees');
select tests.logout();

select * from finish();
rollback;
