-- Norm percent on shifts: range, defaults, draft detection and the published snapshot.
begin;
select plan(7);

\set org1 20000000-0000-0000-0000-000000000001
\set admin 10000000-0000-0000-0000-000000000001
\set manager 10000000-0000-0000-0000-000000000002
\set butik 30000000-0000-0000-0000-000000000001

select is((select norm_percent_work::int || '/' || norm_percent_on_call || '/' || norm_in_pay_work || '/' || norm_in_pay_on_call
  from public.organization_settings where organization_id = :'org1'),
  '100/0/false/false', 'defaults: work 100 %, on-call 0 %, not used in pay (as before)');

select tests.login_as(:'manager');
select throws_ok(
  format($$insert into public.shift (organization_id, department_id, start_at, end_at, kind, norm_percent)
    values (%L, %L, '2027-03-01 17:00+01', '2027-03-01 23:00+01', 'on_call', 120)$$, :'org1', :'butik'),
  '23514', null, 'the percent is between 0 and 100');
insert into public.shift (id, organization_id, department_id, start_at, end_at, kind, norm_percent, norm_in_pay)
  values ('70000000-0000-0000-0000-0000000000a1', :'org1', :'butik', '2027-03-01 17:00+01', '2027-03-01 23:00+01', 'on_call', 33, true);
select tests.logout();

set local role service_role;
select lives_ok(
  format($$select public.publish_schedule(%L, %L, '2027-03-01', '2027-03-08', '2027-03-01', '2027-03-07', '[]')$$, :'manager', :'butik'),
  'the manager publishes the week');
reset role;
select is((select (published ->> 'norm_percent') || '/' || (published ->> 'norm_in_pay') from public.shift
  where id = '70000000-0000-0000-0000-0000000000a1'), '33/true', 'the snapshot carries the norm fields');

select tests.login_as(:'manager');
update public.shift set norm_percent = 50 where id = '70000000-0000-0000-0000-0000000000a1';
select is((select status::text from public.shift where id = '70000000-0000-0000-0000-0000000000a1'), 'draft',
  'changing the percent makes the shift a draft again');
select is((select published ->> 'norm_percent' from public.shift where id = '70000000-0000-0000-0000-0000000000a1'), '33',
  'the published snapshot is kept until the next publication');
select is((select count(*) from public.organization_settings where organization_id = :'org1' and norm_percent_on_call = 0), 1::bigint,
  'members can read the defaults');
select tests.logout();

select * from finish();
rollback;
