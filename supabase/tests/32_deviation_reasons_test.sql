-- Deviation reasons: set up by settings.manage, chosen on registrations.
begin;
select plan(9);

\set org1 20000000-0000-0000-0000-000000000001
\set butik 30000000-0000-0000-0000-000000000001
\set admin 10000000-0000-0000-0000-000000000001
\set mads_user 10000000-0000-0000-0000-000000000003
\set mads 50000000-0000-0000-0000-000000000002

create temp table t_ids (k text, id uuid) on commit drop;
grant all on t_ids to authenticated;

select tests.login_as(:'mads_user');
select throws_ok(format($$insert into public.deviation_reason (organization_id, name, applies_to, treatment)
  values (%L, 'x', '{late_out}', 'none')$$, :'org1'), '42501', null, 'an employee cannot set up reasons');
select tests.logout();

select tests.login_as(:'admin');
with x as (insert into public.deviation_reason (organization_id, name, applies_to, treatment, time_off_mode)
  values (:'org1', 'Afspadsering', '{early_in,late_out,unplanned}', 'time_off', 'agreement') returning id)
insert into t_ids select 'time_off', id from x;
with x as (insert into public.deviation_reason (organization_id, name, applies_to, treatment, absence_type)
  values (:'org1', 'Lægebesøg', '{late_in,early_out}', 'absence', 'sick') returning id)
insert into t_ids select 'absence', id from x;
select throws_ok(format($$insert into public.deviation_reason (organization_id, name, applies_to, treatment)
  values (%L, 'Fravær uden type', '{late_in}', 'absence')$$, :'org1'), '23514', null, 'an absence reason needs a type');
select throws_ok(format($$insert into public.deviation_reason (organization_id, name, applies_to, treatment, time_off_mode)
  values (%L, 'Faktor uden lønart', '{late_out}', 'time_off', 'factor')$$, :'org1'), '23514', null,
  'time off by a factor needs a pay code');
select throws_ok(format($$insert into public.deviation_reason (organization_id, name, applies_to, treatment)
  values (%L, 'Forkert situation', '{whenever}', 'none')$$, :'org1'), '23514', null, 'situations are a fixed list');
select tests.logout();

select tests.login_as(:'mads_user');
select is((select count(*)::int from public.deviation_reason), 2, 'employees see the reasons');
insert into public.time_entry (organization_id, employee_id, department_id, start_at, end_at, status, source, end_reason_id)
values (:'org1', :'mads', :'butik', now() - interval '9 hours', now() - interval '30 minutes', 'pending', 'manual',
        (select id from t_ids where k = 'time_off'));
select is((select count(*)::int from public.time_entry where end_reason_id = (select id from t_ids where k = 'time_off')),
  1, 'an employee chooses a reason on their own registration');
select tests.logout();

select tests.login_as(:'admin');
update public.deviation_reason set archived_at = now() where id = (select id from t_ids where k = 'absence');
select is((select count(*)::int from public.deviation_reason where archived_at is null), 1, 'a reason is deleted (archived)');
select tests.logout();

select tests.login_as(:'mads_user');
select throws_ok($$update public.time_entry set start_reason_id = (select id from t_ids where k = 'absence')
  where end_reason_id is not null$$, '23514', null, 'a deleted reason cannot be chosen');
select lives_ok($$update public.time_entry set note = 'ok' where end_reason_id is not null$$,
  'a registration keeps a reason that was deleted later');
select tests.logout();

select * from finish();
rollback;
