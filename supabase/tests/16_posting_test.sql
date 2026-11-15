-- Posting dimensions: RLS, validation of values and departments, snapshot.
begin;
select plan(11);

\set org1 20000000-0000-0000-0000-000000000001
\set admin 10000000-0000-0000-0000-000000000001
\set manager 10000000-0000-0000-0000-000000000002
\set emp 10000000-0000-0000-0000-000000000003
\set butik 30000000-0000-0000-0000-000000000001
\set cafe 30000000-0000-0000-0000-000000000002
\set mads 50000000-0000-0000-0000-000000000002
\set dim 70000000-0000-0000-0000-0000000000d1
\set v1100 70000000-0000-0000-0000-000000001100
\set v1200 70000000-0000-0000-0000-000000001200

-- The owner (posting.manage) sets up a dimension with two values; 1200 only in Café.
select tests.login_as(:'admin');
select lives_ok(
  format($$insert into public.posting_dimension (id, organization_id, key, name) values (%L, %L, 'omkostningssted', 'Omkostningssted')$$, :'dim', :'org1'),
  'the owner can create a dimension');
select lives_ok(
  format($$insert into public.posting_value (id, organization_id, dimension_id, code, name) values
    (%L, %L, %L, '1100', 'Butik'), (%L, %L, %L, '1200', 'Café')$$, :'v1100', :'org1', :'dim', :'v1200', :'org1', :'dim'),
  'the owner can create values');
select lives_ok(
  format($$insert into public.posting_value_department (organization_id, value_id, department_id) values (%L, %L, %L)$$, :'org1', :'v1200', :'cafe'),
  'a value can be limited to departments');
select tests.logout();

-- A manager without posting.manage can read but not create.
select tests.login_as(:'manager');
select throws_ok(
  format($$insert into public.posting_value (organization_id, dimension_id, code, name) values (%L, %L, '1300', 'X')$$, :'org1', :'dim'),
  '42501', null, 'a manager cannot create values');
select is((select count(*) from public.posting_value), 2::bigint, 'members can read the values');

-- Allocations on a shift are validated.
select lives_ok(
  format($$insert into public.shift (id, organization_id, department_id, employee_id, start_at, end_at, posting_allocations)
    values ('60000000-0000-0000-0000-0000000000a1', %L, %L, %L, '2027-05-03 06:00Z', '2027-05-03 14:00Z',
    '[{"values": {"%s": "%s"}, "start_at": null, "end_at": null, "minutes": null}]')$$,
    :'org1', :'butik', :'mads', :'dim', :'v1100'),
  'a shift can carry a posting');
select throws_ok(
  format($$update public.shift set posting_allocations = '[{"values": {"%s": "%s"}}]' where id = '60000000-0000-0000-0000-0000000000a1'$$,
    :'dim', :'v1200'),
  '23514', null, 'a value limited to another department is rejected');
select throws_ok(
  format($$update public.shift set posting_allocations = '[{"values": {"%s": "%s"}}]' where id = '60000000-0000-0000-0000-0000000000a1'$$,
    :'dim', '70000000-0000-0000-0000-00000000ffff'),
  '23503', null, 'an unknown value is rejected');
select tests.logout();

-- Defaults on departments are validated too.
select tests.login_as(:'admin');
select throws_ok(
  format($$update public.department set posting_defaults = '{"%s": "%s"}' where id = %L$$, :'dim', :'v1200', :'butik'),
  '23514', null, 'a department default must be available in the department');
select lives_ok(
  format($$update public.department set posting_defaults = '{"%s": "%s"}' where id = %L$$, :'dim', :'v1100', :'butik'),
  'a valid department default is saved');
select tests.logout();

-- Changing only the posting of a published shift makes it a draft again.
set local role service_role;
select public.publish_schedule(:'manager', :'butik', '2027-05-03', '2027-05-10', '2027-05-03', '2027-05-09', '[]');
reset role;
select tests.login_as(:'manager');
update public.shift set posting_allocations = '[]' where id = '60000000-0000-0000-0000-0000000000a1';
select is((select status::text || '/' || (published -> 'posting_allocations' -> 0 -> 'values' ->> :'dim')
           from public.shift where id = '60000000-0000-0000-0000-0000000000a1'),
  'draft/' || :'v1100', 'the published snapshot keeps the posting; the change is a draft');
select tests.logout();

select * from finish();
rollback;
