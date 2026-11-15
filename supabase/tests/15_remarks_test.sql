-- Remarks: INFO violations are stored with a publication, need no override
-- reason and are not counted as blocking or warnings.
begin;
select plan(4);

\set org1 20000000-0000-0000-0000-000000000001
\set manager 10000000-0000-0000-0000-000000000002
\set butik 30000000-0000-0000-0000-000000000001
\set mads 50000000-0000-0000-0000-000000000002

select tests.login_as(:'manager');
insert into public.shift (id, organization_id, department_id, employee_id, start_at, end_at, label)
  values ('60000000-0000-0000-0000-0000000000f1', :'org1', :'butik', :'mads', '2027-03-01 06:00Z', '2027-03-01 17:00Z', 'Lang');
select tests.logout();

set local role service_role;
select lives_ok(
  format($$select public.publish_schedule(%L, %L, '2027-03-01', '2027-03-08', '2027-03-01', '2027-03-07',
    '[{"shift_id":"60000000-0000-0000-0000-0000000000f1","employee_id":"%s","rule_id":"anm-lang","code":"ANM_LANG","severity":"INFO","message":"Vagt over 10 timer (11 t)","date":"2027-03-01"}]')$$,
    :'manager', :'butik', :'mads'),
  'an INFO remark is published without an override reason');
select throws_ok(
  $$insert into public.rule_violation (organization_id, publication_id, department_id, rule_id, code, severity, message, date)
    select organization_id, id, department_id, 'x', 'X', 'NOTICE', 'x', '2027-03-01' from public.schedule_publication limit 1$$,
  '23514', null, 'unknown severities are rejected');
reset role;
select is((select severity from public.rule_violation where code = 'ANM_LANG'), 'INFO', 'the remark is stored as INFO');
select is(
  (select blocking_count || '/' || warning_count from public.schedule_publication p
    where exists (select 1 from public.rule_violation v where v.publication_id = p.id and v.code = 'ANM_LANG')),
  '0/0', 'INFO is neither blocking nor a warning');

select * from finish();
rollback;
