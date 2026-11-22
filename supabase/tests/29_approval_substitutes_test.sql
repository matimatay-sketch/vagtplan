-- Substitute approvers: while Lise (manager of Butik) is away, Mads approves.
begin;
select plan(15);

\set org1 20000000-0000-0000-0000-000000000001
\set admin 10000000-0000-0000-0000-000000000001
\set lise 10000000-0000-0000-0000-000000000002
\set mads_user 10000000-0000-0000-0000-000000000003
\set ida_user 10000000-0000-0000-0000-000000000004
\set ida 50000000-0000-0000-0000-000000000003
\set carl 50000000-0000-0000-0000-000000000004

create temp table t_ids (id uuid) on commit drop;
grant all on t_ids to authenticated;

-- ---------------------------------------------------------------- before
select tests.login_as(:'mads_user');
select is(private.is_time_approver(:'ida'), false, 'an employee approves no one');
select throws_ok(format($$select public.save_approval_substitute(%L, null, %L, %L, current_date, current_date + 7, '')$$,
  :'org1', :'lise', :'mads_user'),
  '42501', null, 'an employee cannot appoint a substitute for the manager');
select is((select count(*)::int from public.substitute_candidates(:'org1')), 0,
  'and sees no candidates');
select tests.logout();

-- ---------------------------------------------------------------- the manager appoints a substitute
select tests.login_as(:'lise');
select throws_ok(format($$select public.save_approval_substitute(%L, null, %L, %L, current_date, current_date - 1, '')$$,
  :'org1', :'lise', :'mads_user'),
  '22023', null, 'the period must end on or after it starts');
select throws_ok(format($$select public.save_approval_substitute(%L, null, %L, %L, current_date, current_date, '')$$,
  :'org1', :'lise', :'lise'),
  '23514', null, 'a manager cannot substitute for themself');
select throws_ok(format($$select public.save_approval_substitute(%L, null, %L, %L, current_date, current_date, '')$$,
  :'org1', :'admin', :'mads_user'),
  '42501', null, 'a manager cannot appoint a substitute for someone else');
insert into t_ids select public.save_approval_substitute(:'org1', null, :'lise', :'mads_user',
  current_date, current_date + 7, 'Ferie');
select is((select count(*)::int from public.approval_substitute), 1, 'the manager sees the substitution');
select tests.logout();

-- ---------------------------------------------------------------- the substitute approves
select tests.login_as(:'mads_user');
select is(private.is_time_approver(:'ida'), true, 'the substitute approves the manager''s department');
select is(private.is_time_approver(:'carl'), false, 'but not departments the manager is not responsible for');
select ok(:'ida'::uuid in (select public.time_approvees(:'org1')), 'and gets her on the approval page');
select tests.logout();

select tests.login_as(:'ida_user');
select is((select count(*)::int from public.approval_substitute), 0, 'others do not see substitutions');
select tests.logout();

-- ---------------------------------------------------------------- outside the period, and ended early
select tests.login_as(:'lise');
select lives_ok(format($$select public.save_approval_substitute(%L, %L, %L, %L, current_date + 1, current_date + 7, 'Ferie')$$,
  :'org1', (select id from t_ids), :'lise', :'mads_user'), 'the manager moves the period');
select tests.logout();
select tests.login_as(:'mads_user');
select is(private.is_time_approver(:'ida'), false, 'before the period the substitute approves nothing');
select tests.logout();

select tests.login_as(:'admin');
select lives_ok(format($$select public.end_approval_substitute(%L)$$, (select id from t_ids)),
  'an administrator (users.manage) ends the substitution');
select is((select archived_at is not null from public.approval_substitute where id = (select id from t_ids)), true,
  'it is kept, but ended');
select tests.logout();

select * from finish();
rollback;
