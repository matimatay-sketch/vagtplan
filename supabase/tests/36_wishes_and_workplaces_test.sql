-- Wishes on/off and stamping only at the workplace.
begin;
select plan(23);

\set org1 20000000-0000-0000-0000-000000000001
\set butik 30000000-0000-0000-0000-000000000001
\set cafe 30000000-0000-0000-0000-000000000002
\set admin 10000000-0000-0000-0000-000000000001
\set lise 10000000-0000-0000-0000-000000000002
\set mads_user 10000000-0000-0000-0000-000000000003
\set mads 50000000-0000-0000-0000-000000000002

-- ---------------------------------------------------------------- wishes
select tests.login_as(:'mads_user');
select lives_ok(format($$insert into public.availability (organization_id, employee_id, date, kind)
  values (%L, %L, current_date + 3, 'unavailable')$$, :'org1', :'mads'),
  'wishes are on by default');
select tests.logout();

-- Off for the organization; no department overrides it.
update public.organization_settings set availability_enabled = false where organization_id = :'org1';
select tests.login_as(:'mads_user');
select throws_ok(format($$insert into public.availability (organization_id, employee_id, date, kind)
  values (%L, %L, current_date + 4, 'unavailable')$$, :'org1', :'mads'),
  '42501', null, 'no new wishes when the organization has switched them off');
select is(public.availability_allowed(:'mads'), false, 'the app can ask whether wishes are allowed');
select lives_ok(format($$update public.availability set archived_at = now()
  where employee_id = %L and archived_at is null$$, :'mads'),
  'a wish already made can still be removed');
select tests.logout();

-- A department switches them on again.
update public.department set availability_enabled = true
where id in (select department_id from public.employee_department where employee_id = :'mads');
select tests.login_as(:'mads_user');
select lives_ok(format($$insert into public.availability (organization_id, employee_id, date, kind)
  values (%L, %L, current_date + 5, 'available')$$, :'org1', :'mads'),
  'the department allows wishes although the organization does not');
select tests.logout();

-- On for the organization, off for all the employee's departments.
update public.organization_settings set availability_enabled = true where organization_id = :'org1';
update public.department set availability_enabled = false
where id in (select department_id from public.employee_department where employee_id = :'mads');
select tests.login_as(:'mads_user');
select throws_ok(format($$insert into public.availability (organization_id, employee_id, date, kind)
  values (%L, %L, current_date + 6, 'available')$$, :'org1', :'mads'),
  '42501', null, 'the department has switched wishes off');
select tests.logout();
update public.department set availability_enabled = null where organization_id = :'org1';

-- ---------------------------------------------------------------- workplaces
-- A department Mads is not in.
insert into public.department (id, organization_id, name)
values ('30000000-0000-0000-0000-0000000000f9', :'org1', 'Værksted');
select tests.login_as(:'lise');
select throws_ok(format($$select public.save_workplace(%L, 'Butik', 55.6761, 12.5683, 200)$$, :'org1'),
  '42501', null, 'a manager without settings.manage cannot create workplaces');
select tests.logout();

select tests.login_as(:'admin');
-- Butik (Copenhagen, linked to Butik) and Lager (Aarhus, for everyone).
select isnt(public.save_workplace(:'org1', 'Butikken', 55.6761, 12.5683, 200, array[:'butik']::uuid[], null, 'Strøget 1'),
  null, 'an administrator creates a workplace for a department');
select isnt(public.save_workplace(:'org1', 'Lager', 56.1629, 10.2039, 300),
  null, 'and one for everyone');
select is((select count(*)::int from public.workplace_department wd join public.workplace w on w.id = wd.workplace_id
  where w.name = 'Butikken'), 1, 'the department is linked');
select lives_ok(format($$select public.save_workplace(%L, 'Butikken', 55.6761, 12.5683, 150, '{}', %L, 'Strøget 1')$$,
  :'org1', (select id from public.workplace where name = 'Butikken')),
  'editing it removes departments no longer chosen');
select is((select count(*)::int from public.workplace_department wd join public.workplace w on w.id = wd.workplace_id
  where w.name = 'Butikken'), 0, 'no departments left');
select public.save_workplace(:'org1', 'Butikken', 55.6761, 12.5683, 150,
  array['30000000-0000-0000-0000-0000000000f9']::uuid[], (select id from public.workplace where name = 'Butikken'), 'Strøget 1');
select tests.logout();

select tests.login_as(:'mads_user');
select is((select count(*)::int from public.workplace), 2, 'employees see the workplaces');
update public.workplace set radius_m = 5000;
select is((select count(*)::int from public.workplace where radius_m = 5000), 0, 'but cannot change them');
select tests.logout();

-- ---------------------------------------------------------------- stamping
-- Off: stamping works without a position and stores none.
select tests.login_as(:'mads_user');
select lives_ok(format($$select public.stamp(%L, '71000000-0000-0000-0000-000000000001', 'in', now() - interval '3 hours')$$, :'org1'),
  'without the setting a stamp needs no position');
select is((select start_workplace_id from public.time_entry where client_id = '71000000-0000-0000-0000-000000000001'),
  null, 'and no workplace is stored');
select public.stamp(:'org1', '71000000-0000-0000-0000-000000000002', 'out', now() - interval '2 hours');
select tests.logout();

update public.organization_settings set geofence_enabled = true where organization_id = :'org1';
select tests.login_as(:'mads_user');
select throws_ok(format($$select public.stamp(%L, '71000000-0000-0000-0000-000000000003', 'in', now())$$, :'org1'),
  'P0001', null, 'with the setting a stamp without a position is turned down');
-- Butikken is linked to Værksted only, so Mads is checked against Lager.
select throws_ok(format($$select public.stamp(%L, '71000000-0000-0000-0000-000000000004', 'in', now(), null, 55.6762, 12.5684, 10)$$, :'org1'),
  'P0001', null, 'at a workplace of another department the stamp is turned down');
-- 56.1650: about 234 m north of Lager (radius 300).
select lives_ok(format($$select public.stamp(%L, '71000000-0000-0000-0000-000000000005', 'in', now(), null, 56.1650, 10.2039, 10)$$, :'org1'),
  'within the radius the stamp is registered');
select is((select w.name || ' ' || (t.start_distance_m between 225 and 245)::text from public.time_entry t join public.workplace w on w.id = t.start_workplace_id
  where t.client_id = '71000000-0000-0000-0000-000000000005'), 'Lager true',
  'with the workplace and the distance, not the position');
-- 56.1670: about 456 m away; an accuracy of 500 m only counts as 100 m.
select throws_ok(format($$select public.stamp(%L, '71000000-0000-0000-0000-000000000006', 'out', now(), null, 56.1670, 10.2039, 500)$$, :'org1'),
  'P0001', null, 'outside the radius (plus at most 100 m accuracy) the stamp is turned down');
select tests.logout();
select throws_ok($$update public.time_entry set start_distance_m = 0 where client_id = '71000000-0000-0000-0000-000000000005'$$,
  '42501', null, 'only stamping sets where the stamp was made');

-- Employees allowed to stamp anywhere are not checked.
update public.employee set stamp_anywhere = true where id = :'mads';
select tests.login_as(:'mads_user');
select lives_ok(format($$select public.stamp(%L, '71000000-0000-0000-0000-000000000007', 'out', now())$$, :'org1'),
  'an employee allowed to stamp anywhere needs no position');
select tests.logout();

select * from finish();
rollback;
