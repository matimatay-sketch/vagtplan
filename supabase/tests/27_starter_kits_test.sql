-- Startpakker: Industriens Overenskomst as the customer's own agreement, and
-- deleting agreements.
begin;
select plan(16);

\set org1 20000000-0000-0000-0000-000000000001
\set admin 10000000-0000-0000-0000-000000000001
\set lise 10000000-0000-0000-0000-000000000002
\set platform 10000000-0000-0000-0000-000000000009
\set mads 50000000-0000-0000-0000-000000000002

select is((select count(*)::integer from public.agreement
           where organization_id is null and key = 'industriens-overenskomst'), 0,
  'Industriens Overenskomst is not a locked system template');

select tests.login_as(:'admin');
select is((select count(*)::integer from public.starter_kit), 0, 'customers cannot see the starter kits');
select tests.logout();

select tests.login_as(:'platform');
select throws_ok($$select public.platform_create_organization('Forkert ApS', 'findes-ikke')$$, 'P0002', null,
  'an unknown kit is refused');
create temp table t_org on commit drop as
  select public.platform_create_organization('Industri ApS', 'industriens-overenskomst') as id;
select tests.logout();

select is((select count(*)::integer from public.agreement_version v join public.agreement a on a.id = v.agreement_id
           where a.organization_id = (select id from t_org) and a.key = 'industriens-overenskomst'
             and v.status = 'published'), 3,
  'the customer gets the agreement as its own, with three published versions');
select is((select a.key from public.organization_settings s join public.agreement a on a.id = s.default_agreement_id
           where s.organization_id = (select id from t_org)), 'industriens-overenskomst',
  'the agreement is the default for new contracts');
select is((select array_agg(name order by name) from public.pay_period_group where organization_id = (select id from t_org)),
  array['Månedslønnede', 'Timelønnede (14 dage)'], 'the kit adds the 14-day pay periods');
select is((select count(*)::integer from public.supplement_type where organization_id = (select id from t_org)), 6,
  'the kit adds the supplement types');
select is((select amount from public.supplement_type
           where organization_id = (select id from t_org) and pay_code = 'OT_IKKE_VARSLET'),
  case when current_date >= '2027-03-01' then 12635 when current_date >= '2026-03-01' then 12270 else 11910 end,
  'supplement amounts are the ones in force today');

-- An existing customer can get the kit later, but only once.
select tests.login_as(:'platform');
select lives_ok(format($$select public.platform_apply_starter_kit(%L, 'industriens-overenskomst')$$, :'org1'),
  'an existing customer gets the kit');
select throws_ok(format($$select public.platform_apply_starter_kit(%L, 'industriens-overenskomst')$$, :'org1'),
  'P0001', null, 'but not twice');
select tests.logout();

-- Deleting: refused while contracts use the agreement; then archived.
select tests.login_as(:'admin');
create temp table t_io on commit drop as
  select id from public.agreement where organization_id = :'org1' and key = 'industriens-overenskomst';
grant select on t_io to authenticated;
select throws_ok($$update public.agreement set archived_at = now() where id = (select id from t_io)$$,
  '42501', null, 'archived_at is only set by archive_agreement');
select tests.logout();
insert into public.employee (id, organization_id, employee_number, first_name, last_name, birth_date)
values ('51000000-0000-0000-0000-000000000001', :'org1', '9001', 'Ib', 'Industri', '1990-01-01');
insert into public.contract (organization_id, employee_id, agreement_id, pay_form, weekly_norm_minutes, pay_period_group_id, valid_from)
select :'org1', '51000000-0000-0000-0000-000000000001', (select id from t_io), 'hourly', 2220,
       (select id from public.pay_period_group where organization_id = :'org1' and name = 'Timelønnede (14 dage)'),
       '2099-01-01';
select tests.login_as(:'lise');
select throws_ok($$select public.archive_agreement((select id from t_io))$$, '42501', null,
  'deleting needs agreements.manage');
select tests.logout();
select tests.login_as(:'admin');
select throws_ok($$select public.archive_agreement((select id from t_io))$$, 'P0001', null,
  'an agreement used by a contract cannot be deleted');
select tests.logout();
update public.contract set valid_to = '2099-01-01' where agreement_id = (select id from t_io);
delete from public.contract where agreement_id = (select id from t_io);
select tests.login_as(:'admin');
select lives_ok($$select public.archive_agreement((select id from t_io))$$, 'an unused agreement is deleted');
select is((select default_agreement_id from public.organization_settings where organization_id = :'org1'), null,
  'and is no longer the default');
select throws_ok(format($$update public.organization_settings set default_agreement_id = (select id from t_io)
  where organization_id = %L$$, :'org1'), '23514', null, 'a deleted agreement cannot be the default');
select tests.logout();

select * from finish();
rollback;
