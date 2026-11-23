-- The employee app: push devices, notification settings, the push outbox and calendar feeds.
begin;
select plan(21);

\set org1 20000000-0000-0000-0000-000000000001
\set butik 30000000-0000-0000-0000-000000000001
\set lise 10000000-0000-0000-0000-000000000002
\set mads_user 10000000-0000-0000-0000-000000000003
\set ida_user 10000000-0000-0000-0000-000000000004
\set mads 50000000-0000-0000-0000-000000000002

create temp table t_ids (k text, id uuid, token text) on commit drop;
grant all on t_ids to authenticated;

-- ---------------------------------------------------------------- devices
select tests.login_as(:'mads_user');
select throws_ok(format($$select public.register_push_device(%L, 'web', 'https://push.example/abc123', '{}', 'Mobil')$$, :'org1'),
  '22023', null, 'web push needs its keys');
insert into t_ids (k, id) select 'mads_phone', public.register_push_device(:'org1', 'android', 'fcm-token-mads-0001', '{}', 'Pixel');
select is(public.register_push_device(:'org1', 'android', 'fcm-token-mads-0001', '{}', 'Pixel'),
  (select id from t_ids where k = 'mads_phone'), 'registering the same token again refreshes the device');
select is((select count(*)::int from public.push_device), 1, 'Mads sees his device');
select tests.logout();

select tests.login_as(:'ida_user');
select is((select count(*)::int from public.push_device), 0, 'others do not see it');
select throws_ok(format($$select public.remove_push_device(%L)$$, (select id from t_ids where k = 'mads_phone')),
  'P0002', null, 'and cannot turn it off');
select throws_ok($$insert into public.push_device (organization_id, user_id, platform, token)
  values ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000004', 'ios', 'direct-token-0001')$$,
  '42501', null, 'devices are only written through the function');
select tests.logout();

select tests.login_as(:'lise');
select lives_ok(format($$select public.register_push_device(%L, 'ios', 'fcm-token-lise-0001', '{}', 'iPhone')$$, :'org1'),
  'the manager registers her phone');
select tests.logout();

-- ---------------------------------------------------------------- notifications
-- A message from Lise to Mads: Mads gets a notification, Lise does not.
select tests.login_as(:'lise');
select public.start_conversation(:'org1', array[:'mads_user']::uuid[], 'Vagt i morgen', 'Kan du tage en ekstra time?');
select tests.logout();
select is((select count(*)::int from public.push_outbox where user_id = :'mads_user' and kind = 'message'), 1,
  'a new message is queued for the recipient');
select is((select payload ->> 'sender' from public.push_outbox where user_id = :'mads_user' and kind = 'message'),
  'Lise Leder', 'with the sender');
select ok(not (select payload ? 'body' from public.push_outbox where user_id = :'mads_user' and kind = 'message'),
  'but never the text');
select is((select count(*)::int from public.push_outbox where user_id = :'lise'), 0, 'the sender gets none');

-- Publishing changes Mads's shift: one notification for the publication.
insert into public.shift (organization_id, department_id, employee_id, start_at, end_at)
values (:'org1', :'butik', :'mads', now() + interval '2 days', now() + interval '2 days 8 hours'),
       (:'org1', :'butik', :'mads', now() + interval '3 days', now() + interval '3 days 8 hours');
select set_config('app.publishing', 'on', true);
update public.shift set published = jsonb_build_object('employee_id', employee_id, 'start_at', start_at, 'end_at', end_at),
  status = 'published'
where employee_id = :'mads' and start_at > now() + interval '1 day';
select set_config('app.publishing', 'off', true);
select is((select count(*)::int from public.push_outbox where user_id = :'mads_user' and kind = 'schedule'), 1,
  'publishing two shifts gives one schedule notification');

-- Mads asks for a day off: Lise (his approver) hears about it; the decision goes back to Mads.
select tests.login_as(:'mads_user');
with x as (insert into public.absence (organization_id, employee_id, type_code, from_date, to_date)
  values (:'org1', :'mads', 'vacation', current_date + 30, current_date + 30) returning id)
insert into t_ids (k, id) select 'absence', id from x;
select tests.logout();
select is((select count(*)::int from public.push_outbox where user_id = :'lise' and kind = 'absence_requested'), 1,
  'the approver is told about the request');
select set_config('app.absence_system', 'on', true);
update public.absence set status = 'rejected', decided_by = :'lise', decided_at = now()
where id = (select id from t_ids where k = 'absence');
select is((select payload ->> 'approved' from public.push_outbox where user_id = :'mads_user' and kind = 'absence_decided'),
  'false', 'the employee is told the decision');

-- Settings: Mads turns off schedule notifications.
select tests.login_as(:'mads_user');
insert into public.notification_setting (organization_id, user_id, schedule) values (:'org1', :'mads_user', false);
select tests.logout();
select is(private.wants_push(:'org1', :'mads_user', 'schedule'), false, 'turned off kinds are not queued');
select is(private.wants_push(:'org1', :'ida_user', 'message'), false, 'nor for users without a device');

-- The server claims due notifications with the devices and archives dead ones.
select is((select jsonb_array_length(devices) from public.push_claim(100) where user_id = :'mads_user' limit 1), 1,
  'claimed notifications carry the devices');
select public.push_result(o.id, false, 'gone', array[(select id from t_ids where k = 'mads_phone')])
from public.push_outbox o where o.user_id = :'mads_user' limit 1;
select is((select archived_at is not null from public.push_device where id = (select id from t_ids where k = 'mads_phone')),
  true, 'a device the push service no longer knows is archived');

-- ---------------------------------------------------------------- calendar
select tests.login_as(:'mads_user');
insert into t_ids (k, token) values ('cal1', public.create_calendar_feed(:'org1'));
insert into t_ids (k, token) values ('cal2', public.create_calendar_feed(:'org1'));
select tests.logout();
select is((select count(*)::int from public.calendar_feed_lookup((select token from t_ids where k = 'cal1'))), 0,
  'a new link replaces the old one');
select is((select employee_id from public.calendar_feed_lookup((select token from t_ids where k = 'cal2'))), :'mads'::uuid,
  'the link opens the employee''s own calendar');
select is((select count(*)::int from public.calendar_feed where token_hash = (select token from t_ids where k = 'cal2')), 0,
  'only a hash of the token is stored');

select * from finish();
rollback;
