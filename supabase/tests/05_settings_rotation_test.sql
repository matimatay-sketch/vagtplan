-- Organization settings, supplements, breaks, rotations and permanent overrides.
begin;
select plan(17);

\set org1 20000000-0000-0000-0000-000000000001
\set admin 10000000-0000-0000-0000-000000000001
\set manager 10000000-0000-0000-0000-000000000002
\set emp 10000000-0000-0000-0000-000000000003
\set butik 30000000-0000-0000-0000-000000000001
\set cafe 30000000-0000-0000-0000-000000000002
\set mads 50000000-0000-0000-0000-000000000002

select is((select count(*) from public.organization_settings where organization_id = :'org1'), 1::bigint, 'organizations get a settings row');

-- ------------------------------------------------ settings: admin only by default
select tests.login_as(:'manager');
select lives_ok(format($$update public.organization_settings set notice_publish_hours = 1 where organization_id = %L$$, :'org1'), 'manager update is filtered ...');
select tests.logout();
select is((select notice_publish_hours from public.organization_settings where organization_id = :'org1'), null::integer, '... and has no effect');

select tests.login_as(:'admin');
select lives_ok(format($$update public.organization_settings set notice_publish_hours = 72, rule_handling = '{"REST_DAILY":"block","BREAK_MISSING":"allow"}' where organization_id = %L$$, :'org1'),
  'admin changes settings');
select throws_ok(format($$update public.organization_settings set rule_handling = '{"REST_DAILY":"maybe"}' where organization_id = %L$$, :'org1'),
  '23514', null, 'rule handling values are validated');
select lives_ok(format($$insert into public.supplement_type (id, organization_id, name, pay_code, amount_type, amount)
  values ('70000000-0000-0000-0000-000000000001', %L, 'Ansvarstillæg', 'ANSVAR', 'per_hour', 2500)$$, :'org1'), 'admin creates a supplement type');
select tests.logout();

-- ------------------------------------------------ breaks and supplements on shifts
select tests.login_as(:'manager');
select throws_ok(format($$insert into public.supplement_type (organization_id, name, pay_code, amount_type, amount) values (%L, 'X', 'X', 'fixed', 1)$$, :'org1'),
  '42501', null, 'manager cannot create supplement types');
select lives_ok(format($$insert into public.shift (id, organization_id, department_id, employee_id, start_at, end_at, breaks, supplement_type_ids)
  values ('60000000-0000-0000-0000-000000000099', %L, %L, %L, '2026-12-14 07:00Z', '2026-12-14 15:00Z',
  '[{"start_at":"2026-12-14T09:00:00Z","minutes":15,"paid":true},{"start_at":null,"minutes":30,"paid":false}]',
  '{70000000-0000-0000-0000-000000000001}')$$, :'org1', :'butik', :'mads'), 'shift with two breaks and a supplement');
select throws_ok(format($$insert into public.shift (organization_id, department_id, start_at, end_at, breaks)
  values (%L, %L, '2026-12-14 07:00Z', '2026-12-14 08:00Z', '[{"minutes":60,"paid":false}]')$$, :'org1', :'butik'),
  '23514', null, 'breaks cannot be as long as the shift');
select throws_ok(format($$insert into public.shift (organization_id, department_id, start_at, end_at, supplement_type_ids)
  values (%L, %L, '2026-12-14 07:00Z', '2026-12-14 08:00Z', '{70000000-0000-0000-0000-00000000ffff}')$$, :'org1', :'butik'),
  '23503', null, 'unknown supplement types are rejected');

-- ------------------------------------------------ rotations
select lives_ok(format($$insert into public.rotation (id, organization_id, department_id, name, length_weeks)
  values ('80000000-0000-0000-0000-000000000001', %L, %L, '3-ugers turnus', 3)$$, :'org1', :'butik'), 'manager creates a rotation in own department');
select throws_ok(format($$insert into public.rotation (organization_id, department_id, name, length_weeks) values (%L, %L, 'Café', 1)$$, :'org1', :'cafe'),
  '42501', null, 'but not in another department');
select lives_ok(format($$insert into public.rotation_line (id, organization_id, rotation_id, position, name)
  values ('80000000-0000-0000-0000-000000000002', %L, '80000000-0000-0000-0000-000000000001', 0, 'Linje 1');
  insert into public.rotation_slot (organization_id, rotation_id, line_id, week_index, weekday, start_time, end_time, breaks)
  values (%L, '80000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000002', 2, 5, '07:00', '15:00', '[{"start_time":"11:00","minutes":30,"paid":false}]')$$,
  :'org1', :'org1'), 'lines and slots can be added');
select lives_ok($$delete from public.rotation_slot where week_index = 2$$, 'slots can be deleted (template configuration)');
select tests.logout();

select tests.login_as(:'emp');
select is((select count(*) from public.rotation), 0::bigint, 'employees do not see rotations');
select tests.logout();

-- ------------------------------------------------ permanent override needs no override permission
-- Remove the override permission from Leder, then publish with an auto-overridden blocking violation.
delete from public.permission_grant g using public.permission_profile p
  where g.profile_id = p.id and p.name = 'Leder' and g.permission = 'schedule.override';
set local role service_role;
select lives_ok(format($$select public.publish_schedule(%L, %L, '2026-12-14', '2026-12-21', '2026-12-14', '2026-12-20',
  '[{"employee_id":"%s","rule_id":"pause","code":"BREAK_MISSING","severity":"BLOCKING","message":"x","date":"2026-12-14","override_reason":"Tilsidesat permanent i opsætningen","auto_override":true}]')$$,
  :'manager', :'butik', :'mads'), 'a permanently overridden violation can be published without override permission');
select throws_ok(format($$select public.publish_schedule(%L, %L, '2026-12-14', '2026-12-21', '2026-12-14', '2026-12-20',
  '[{"employee_id":"%s","rule_id":"hviletid","code":"REST_DAILY","severity":"BLOCKING","message":"x","date":"2026-12-14","override_reason":"Begrundet her"}]')$$,
  :'manager', :'butik', :'mads'),
  '42501', null, 'a manual override still needs the permission');
reset role;

select * from finish();
rollback;
