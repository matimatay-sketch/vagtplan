-- Configurable permission profiles.
begin;
select plan(16);

\set org1 20000000-0000-0000-0000-000000000001
\set admin 10000000-0000-0000-0000-000000000001
\set manager 10000000-0000-0000-0000-000000000002
\set emp 10000000-0000-0000-0000-000000000003
\set mads 50000000-0000-0000-0000-000000000002
\set detail a0000000-0000-0000-0000-000000000002
\set biweekly 40000000-0000-0000-0000-000000000002

select id as owner_profile from public.permission_profile where organization_id = :'org1' and is_owner \gset
select id as manager_profile from public.permission_profile where organization_id = :'org1' and name = 'Leder' \gset
select id as employee_profile from public.permission_profile where organization_id = :'org1' and name = 'Medarbejder' \gset

select is((select count(*) from public.permission_profile where organization_id = :'org1'), 3::bigint,
  'an organization starts with three default profiles');
select is((select count(*) from public.permission_grant where profile_id = :'owner_profile'),
  (select count(*) from public.permission), 'the owner profile has every permission');

-- ------------------------------------------------ manager cannot escalate
select tests.login_as(:'manager');
select throws_ok(
  format($$insert into public.permission_grant (organization_id, profile_id, permission, scope)
    values (%L, %L, 'agreements.manage', 'organization')$$, :'org1', :'manager_profile'),
  '42501', null, 'manager cannot grant themselves permissions');
select lives_ok(
  format($$update public.membership set profile_id = %L where user_id = %L$$, :'owner_profile', :'manager'),
  'manager update of own membership is filtered');
select tests.logout();
select is((select profile_id from public.membership where user_id = :'manager'), :'manager_profile'::uuid,
  'manager still has the Leder profile');

-- ------------------------------------------------ admin customizes profiles
select tests.login_as(:'admin');
select lives_ok(
  format($$delete from public.permission_grant where profile_id = %L and permission = 'contracts.manage'$$, :'manager_profile'),
  'admin removes contracts.manage from Leder');
select lives_ok(
  format($$insert into public.permission_grant (organization_id, profile_id, permission, scope)
    values (%L, %L, 'employees.view', 'organization')$$, :'org1', :'employee_profile'),
  'admin lets Medarbejder see all employees');
select throws_ok(
  format($$insert into public.permission_grant (organization_id, profile_id, permission, scope)
    values (%L, %L, 'departments.manage', 'departments')$$, :'org1', :'manager_profile'),
  '23514', null, 'scope must be allowed for the permission');
select throws_ok(
  format($$delete from public.permission_grant where profile_id = %L and permission = 'users.manage'$$, :'owner_profile'),
  '42501', null, 'the owner profile cannot be changed');
select throws_ok(
  format($$update public.permission_profile set archived_at = now() where id = %L$$, :'owner_profile'),
  '42501', null, 'the owner profile cannot be archived');
select throws_ok(
  format($$update public.membership set profile_id = %L where user_id = %L$$, :'employee_profile', :'admin'),
  '42501', null, 'the last administrator cannot be demoted');
select ok(
  (select count(*) from public.audit_log where table_name = 'permission_grant') >= 2,
  'profile changes are audited');
select tests.logout();

-- ------------------------------------------------ effects
select tests.login_as(:'manager');
select throws_ok(
  format($$insert into public.contract (organization_id, employee_id, agreement_id, pay_form,
      weekly_norm_minutes, pay_period_group_id, valid_from)
    values (%L, %L, %L, 'hourly', 1500, %L, '2030-01-01')$$, :'org1', :'mads', :'detail', :'biweekly'),
  '42501', null, 'manager without contracts.manage cannot create contracts');
select is((select count(*) from public.contract where employee_id = :'mads'), 1::bigint,
  'manager still sees contracts (contracts.view kept)');
select tests.logout();

select tests.login_as(:'emp');
select is((select count(*) from public.employee), 5::bigint, 'employee with employees.view (org) sees everyone');
select is((select count(*) from public.contract), 1::bigint, 'but still only their own contract');
select tests.logout();

select * from finish();
rollback;
