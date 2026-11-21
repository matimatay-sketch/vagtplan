-- Editing published versions of an own agreement, and editing starter kits.
begin;
select plan(15);

\set org1 20000000-0000-0000-0000-000000000001
\set admin 10000000-0000-0000-0000-000000000001
\set lise 10000000-0000-0000-0000-000000000002
\set platform 10000000-0000-0000-0000-000000000009

-- ---------------------------------------------------------------- starter kits
select tests.login_as(:'admin');
select throws_ok($$select public.platform_save_starter_kit('industriens-overenskomst', '{}'::jsonb)$$,
  '42501', null, 'only platform administrators edit starter kits');
select tests.logout();

select tests.login_as(:'platform');
create temp table t_kit on commit drop as
  select content from public.starter_kit where key = 'industriens-overenskomst';
grant select on t_kit to authenticated;
select throws_ok($$select public.platform_save_starter_kit('industriens-overenskomst', '{"agreement": {"versions": []}}')$$,
  '22023', null, 'a kit needs at least one version');
select throws_ok($$select public.platform_save_starter_kit('industriens-overenskomst',
  jsonb_set((select content from t_kit), '{agreement,key}', '"andet"'))$$,
  '22023', null, 'the agreement key cannot change');
select lives_ok($$select public.platform_save_starter_kit('industriens-overenskomst',
  jsonb_set((select content from t_kit), '{agreement,name}', '"Industriens Overenskomst (rettet)"'))$$,
  'a platform administrator edits the kit');
select ok((select edited_at is not null from public.starter_kit where key = 'industriens-overenskomst'),
  'the kit is marked as edited (the seed keeps it)');
select lives_ok(format($$select public.platform_apply_starter_kit(%L, 'industriens-overenskomst')$$, :'org1'),
  'the edited kit is applied');
select tests.logout();
select is((select name from public.agreement where organization_id = :'org1' and key = 'industriens-overenskomst'),
  'Industriens Overenskomst (rettet)', 'new customers get the edited kit');

-- ---------------------------------------------------------------- published versions
create temp table t_v on commit drop as
  select v.id, v.agreement_id from public.agreement_version v join public.agreement a on a.id = v.agreement_id
  where a.organization_id = :'org1' and a.key = 'industriens-overenskomst' and v.version = 2;
grant select on t_v to authenticated;

select tests.login_as(:'lise');
select throws_ok($$select public.update_published_version((select id from t_v), '{"rules": []}')$$,
  '42501', null, 'editing needs agreements.manage');
select tests.logout();

select tests.login_as(:'admin');
select is(public.agreement_version_editable((select id from t_v)), true, 'an own published version is editable');
update public.agreement_version set document = '{}' where id = (select id from t_v);
select isnt((select document from public.agreement_version where id = (select id from t_v)), '{}'::jsonb,
  'a published version is not changed by a plain update');
select lives_ok($$select public.update_published_version((select id from t_v),
  '{"id": "x", "version": 9, "valid_from": "2000-01-01", "name": "Rettet", "rules": []}')$$,
  'the admin changes the published version directly');
select is((select array[document ->> 'id', document ->> 'version', document ->> 'valid_from', document ->> 'name']
           from public.agreement_version where id = (select id from t_v)),
  array['industriens-overenskomst', '2', '2026-03-01', 'Rettet'],
  'the key, version and validity follow the row');
select is(public.agreement_version_editable(
  (select v.id from public.agreement_version v where v.agreement_id = 'a0000000-0000-0000-0000-000000000002' limit 1)),
  false, 'a system template is never editable');
select tests.logout();

-- A closed pay period with a contract on the agreement locks the version.
insert into public.employee (id, organization_id, employee_number, first_name, last_name, birth_date)
values ('51000000-0000-0000-0000-000000000002', :'org1', '9002', 'Ida', 'Industri', '1990-01-01');
insert into public.contract (organization_id, employee_id, agreement_id, pay_form, weekly_norm_minutes, pay_period_group_id, valid_from)
select :'org1', '51000000-0000-0000-0000-000000000002', (select agreement_id from t_v), 'hourly', 2220,
       (select id from public.pay_period_group where organization_id = :'org1' and name = 'Timelønnede (14 dage)'),
       '2026-03-02';
insert into public.pay_period (organization_id, group_id, start_date, end_date, status, closed_at)
select :'org1', id, '2026-03-02', '2026-03-15', 'closed', now()
from public.pay_period_group where organization_id = :'org1' and name = 'Timelønnede (14 dage)'
on conflict (group_id, start_date) do update set status = 'closed', closed_at = now();

select tests.login_as(:'admin');
select is(public.agreement_version_editable((select id from t_v)), false,
  'a version used by a closed pay period is locked');
select throws_ok($$select public.update_published_version((select id from t_v), '{"rules": []}')$$,
  'P0001', null, 'and cannot be changed (make a new version instead)');
select tests.logout();

select * from finish();
rollback;
