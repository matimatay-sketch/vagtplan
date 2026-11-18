-- Integrations: API keys, API stamping, webhook events and the delivery outbox.
begin;
select plan(16);

\set org1 20000000-0000-0000-0000-000000000001
\set admin 10000000-0000-0000-0000-000000000001
\set manager 10000000-0000-0000-0000-000000000002
\set butik 30000000-0000-0000-0000-000000000001
\set mads 50000000-0000-0000-0000-000000000002
\set key 77000000-0000-0000-0000-000000000001
\set hook 77000000-0000-0000-0000-000000000002
\set hash aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa

select tests.login_as(:'admin');
select lives_ok(
  format($$insert into public.api_key (id, organization_id, name, prefix, key_hash, scopes)
    values (%L, %L, 'Stempelur', 'tk_abcdef12', %L, '{time.stamp,time.read}')$$, :'key', :'org1', :'hash'),
  'the owner creates an API key');
select throws_ok(
  format($$update public.api_key set scopes = '{payroll.read}' where id = %L$$, :'key'),
  '42501', null, 'a key cannot be changed');
select lives_ok(
  format($$insert into public.webhook_endpoint (id, organization_id, url, events, secret)
    values (%L, %L, 'https://example.test/hook', '{time_entry.approved,employee.updated}', repeat('s', 40))$$, :'hook', :'org1'),
  'the owner adds a webhook');
select throws_ok($$select * from public.api_key_lookup('x')$$, '42501', null,
  'users cannot look up keys');
select throws_ok(
  format($$select public.api_stamp(%L, %L, gen_random_uuid(), 'in', now())$$, :'org1', :'mads'),
  '42501', null, 'users cannot stamp for others through the API function');
select tests.logout();

select tests.login_as(:'manager');
select throws_ok(
  format($$insert into public.api_key (organization_id, name, prefix, key_hash, scopes)
    values (%L, 'X', 'tk_zzzzzz', repeat('b', 64), '{time.read}')$$, :'org1'),
  '42501', null, 'without integrations.manage no keys can be created');
select is((select count(*) from public.api_key), 0::bigint, 'and keys are not visible');
select tests.logout();

-- The server (service role) resolves the key and stamps for an employee.
set local role service_role;
select is((select organization_id from public.api_key_lookup(:'hash')), :'org1'::uuid, 'the key resolves to its organization');
select public.api_stamp(:'org1', :'mads', '77000000-0000-0000-0000-0000000000a1', 'in', now() - interval '3 hours') as entry \gset
select public.api_stamp(:'org1', :'mads', '77000000-0000-0000-0000-0000000000a2', 'out', now() - interval '1 hour');
select is((select status::text from public.time_entry where id = :'entry'), 'pending', 'stamped in and out through the API');
select is(public.api_stamp(:'org1', :'mads', '77000000-0000-0000-0000-0000000000a2', 'out', now()), :'entry'::uuid,
  'a replayed stamp returns the same registration');
reset role;

-- Approval emits time_entry.approved for the subscribed endpoint.
select tests.login_as(:'manager');
select public.approve_time_entries(array[:'entry'::uuid]);
select tests.logout();
select is((select count(*) from public.webhook_delivery where event = 'time_entry.approved' and payload -> 'data' ->> 'id' = :'entry'),
  1::bigint, 'approval creates a delivery');
select is((select payload -> 'data' ->> 'employee_number' from public.webhook_delivery where event = 'time_entry.approved'),
  '1002', 'the payload carries the employee number');

update public.employee set phone = phone where id = :'mads';
select is((select count(*) from public.webhook_delivery where event = 'employee.updated'), 0::bigint,
  'an update without changes emits nothing');
update public.employee set phone = '12345678' where id = :'mads';
select is((select count(*) from public.webhook_delivery where event = 'employee.updated'), 1::bigint,
  'a real change emits employee.updated');

-- The sender claims, fails once (rescheduled), then delivers.
set local role service_role;
select id as delivery from public.webhook_claim(10) where event = 'time_entry.approved' \gset
select public.webhook_result(:'delivery', false, 500, 'boom');
select is((select status || '/' || attempts from public.webhook_delivery where id = :'delivery'), 'pending/1',
  'a failed delivery is retried later');
update public.webhook_delivery set next_attempt_at = now() where id = :'delivery';
select id from public.webhook_claim(10) where id = :'delivery';
select public.webhook_result(:'delivery', true, 200, null);
select is((select status from public.webhook_delivery where id = :'delivery'), 'delivered', 'then delivered');
reset role;

select * from finish();
rollback;
