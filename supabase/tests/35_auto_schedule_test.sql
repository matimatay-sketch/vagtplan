-- Built-in proposals need schedule.manage, not the AI assistant.
begin;
select plan(4);

\set org1 20000000-0000-0000-0000-000000000001
\set butik 30000000-0000-0000-0000-000000000001
\set cafe 30000000-0000-0000-0000-000000000002
\set lise 10000000-0000-0000-0000-000000000002
\set mads_user 10000000-0000-0000-0000-000000000003

update public.organization_settings set assistant_enabled = false where organization_id = :'org1';

select tests.login_as(:'lise');
select lives_ok(format($$insert into public.assistant_proposal (organization_id, department_id, week_start, source)
  values (%L, %L, '2026-12-07', 'auto')$$, :'org1', :'butik'),
  'a manager makes a built-in proposal while the assistant is off');
select throws_ok(format($$insert into public.assistant_proposal (organization_id, department_id, week_start)
  values (%L, %L, '2026-12-07')$$, :'org1', :'butik'),
  '42501', null, 'an AI proposal still needs the assistant');
select throws_ok(format($$insert into public.assistant_proposal (organization_id, department_id, week_start, source)
  values (%L, %L, '2026-12-07', 'auto')$$, :'org1', :'cafe'),
  '42501', null, 'not in a department she does not plan');
select tests.logout();

select tests.login_as(:'mads_user');
select throws_ok(format($$insert into public.assistant_proposal (organization_id, department_id, week_start, source)
  values (%L, %L, '2026-12-07', 'auto')$$, :'org1', :'butik'),
  '42501', null, 'an employee cannot make proposals');
select tests.logout();

select * from finish();
rollback;
