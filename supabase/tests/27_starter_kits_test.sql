-- Startpakker: Industriens Overenskomst as a locked system template and a kit
-- that sets up a new customer base on it.
begin;
select plan(9);

\set org1 20000000-0000-0000-0000-000000000001
\set admin 10000000-0000-0000-0000-000000000001
\set platform 10000000-0000-0000-0000-000000000009

select is((select count(*)::integer from public.agreement_version v join public.agreement a on a.id = v.agreement_id
           where a.organization_id is null and a.key = 'industriens-overenskomst' and v.status = 'published'), 3,
  'Industriens Overenskomst is a system template with three published versions');

select tests.login_as(:'admin');
select is((select count(*)::integer from public.starter_kit), 0, 'customers cannot see the starter kits');
select tests.logout();

select tests.login_as(:'platform');
select is((select count(*)::integer from public.starter_kit where key = 'industriens-overenskomst'), 1,
  'the platform administrator sees the kit');
select throws_ok($$select public.platform_create_organization('Forkert ApS', 'findes-ikke')$$, 'P0002', null,
  'an unknown kit is refused');
create temp table t_org on commit drop as
  select public.platform_create_organization('Industri ApS', 'industriens-overenskomst') as id;
select tests.logout();

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

-- Another customer's own agreement cannot be the default.
insert into public.agreement (organization_id, key, name, kind)
values ((select id from t_org), 'egen-aftale', 'Egen aftale', 'agreement');
select throws_ok(format($$update public.organization_settings set default_agreement_id =
  (select id from public.agreement where key = 'egen-aftale') where organization_id = %L$$, :'org1'),
  '23514', null, 'only system templates or the customer''s own agreements can be the default');

select * from finish();
rollback;
