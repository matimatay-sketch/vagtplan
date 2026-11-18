-- AI assistant: off by default, needs assistant.use; proposals need schedule.manage.
begin;
select plan(7);

\set org1 20000000-0000-0000-0000-000000000001
\set admin 10000000-0000-0000-0000-000000000001
\set manager 10000000-0000-0000-0000-000000000002
\set butik 30000000-0000-0000-0000-000000000001

select tests.login_as(:'admin');
select throws_ok(
  format($$insert into public.assistant_request (organization_id, kind, model, outcome) values (%L, 'pay_explanation', 'm', 'ok')$$, :'org1'),
  '42501', null, 'the assistant is off by default');
update public.organization_settings set assistant_enabled = true where organization_id = :'org1';
select lives_ok(
  format($$insert into public.assistant_request (organization_id, kind, model, outcome, input_tokens) values (%L, 'pay_explanation', 'm', 'ok', 10)$$, :'org1'),
  'with the assistant on, the owner may use it (usage is logged)');
select lives_ok(
  format($$insert into public.assistant_proposal (organization_id, department_id, week_start) values (%L, %L, '2027-03-01')$$, :'org1', :'butik'),
  'a proposal can be created with schedule.manage');
select tests.logout();

-- The manager (profile Leder) does not have assistant.use by default.
select tests.login_as(:'manager');
select throws_ok(
  format($$insert into public.assistant_request (organization_id, kind, model, outcome) values (%L, 'schedule_proposal', 'm', 'ok')$$, :'org1'),
  '42501', null, 'without assistant.use the assistant cannot be used');
select throws_ok(
  format($$insert into public.assistant_proposal (organization_id, department_id, week_start) values (%L, %L, '2027-03-01')$$, :'org1', :'butik'),
  '42501', null, 'nor can proposals be created');
select is((select count(*) from public.assistant_request), 0::bigint, 'others'' usage is not visible');
select tests.logout();

select ok((select count(*) from public.permission_grant g join public.permission_profile p on p.id = g.profile_id
  where p.is_owner and g.permission = 'assistant.use') >= 1, 'owners have assistant.use');

select * from finish();
rollback;
