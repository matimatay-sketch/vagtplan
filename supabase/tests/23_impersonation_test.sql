-- Log in as an employee: who may, and that everything done is marked in the audit trail.
begin;
select plan(10);

\set org1 20000000-0000-0000-0000-000000000001
\set admin 10000000-0000-0000-0000-000000000001
\set manager 10000000-0000-0000-0000-000000000002
\set emp 10000000-0000-0000-0000-000000000003
\set butik 30000000-0000-0000-0000-000000000001
\set mads 50000000-0000-0000-0000-000000000002
\set anne 50000000-0000-0000-0000-000000000005
\set lise 50000000-0000-0000-0000-000000000001

select tests.login_as(:'admin');
select is((select allowed::text || ':' || user_id from public.can_impersonate(:'mads')), 'true:' || :'emp',
  'the owner may log in as an employee');
select is((select reason from public.can_impersonate(:'anne')), 'self', 'but not as themselves');
select public.start_impersonation(:'mads') as sid \gset
select ok(:'sid' is not null, 'a session is started');
select tests.logout();

select tests.login_as(:'manager');
select is((select reason from public.can_impersonate(:'mads')), 'not_allowed', 'a manager may not');
select throws_ok(format($$select public.start_impersonation(%L)$$, :'mads'), '42501', null, 'and cannot start a session');
select tests.logout();

-- As Mads, with the session header: the registration is marked as done by the admin.
select tests.login_as(:'emp');
select set_config('request.headers', json_build_object('x-turnus-impersonation', :'sid')::text, true);
insert into public.time_entry (id, organization_id, employee_id, department_id, start_at, end_at, source, status)
values ('78000000-0000-0000-0000-000000000001', :'org1', :'mads', :'butik', '2027-05-03 06:00Z', '2027-05-03 10:00Z', 'manual', 'pending');
select is((select created_as_email from public.time_entry_history('78000000-0000-0000-0000-000000000001')),
  'admin@demo.dk', 'and the history shows it');
-- Without the header (Mads himself), nothing is marked.
select set_config('request.headers', '{}', true);
insert into public.time_entry (id, organization_id, employee_id, department_id, start_at, end_at, source, status)
values ('78000000-0000-0000-0000-000000000002', :'org1', :'mads', :'butik', '2027-05-04 06:00Z', '2027-05-04 10:00Z', 'manual', 'pending');
select public.end_impersonation(:'sid');
select set_config('request.headers', json_build_object('x-turnus-impersonation', :'sid')::text, true);
select is(private.impersonator(), null, 'an ended session marks nothing');
select tests.logout();

-- (The audit log is read without RLS here.)
select is((select impersonator_id from public.audit_log where table_name = 'time_entry' and row_id = '78000000-0000-0000-0000-000000000001'),
  :'admin'::uuid, 'the audit log names the administrator');
select is((select impersonator_id from public.audit_log where table_name = 'time_entry' and row_id = '78000000-0000-0000-0000-000000000002'),
  null, 'the employee''s own actions are not marked');

select ok((select count(*) from public.permission_grant g join public.permission_profile p on p.id = g.profile_id
  where p.is_owner and g.permission = 'users.impersonate') >= 1, 'owners have users.impersonate');

select * from finish();
rollback;
