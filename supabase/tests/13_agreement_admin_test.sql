-- Agreement drafts and publishing.
begin;
select plan(8);

\set org1 20000000-0000-0000-0000-000000000001
\set admin 10000000-0000-0000-0000-000000000001
\set manager 10000000-0000-0000-0000-000000000002

select tests.login_as(:'admin');
insert into public.agreement (id, organization_id, key, name, kind) values
  ('92000000-0000-0000-0000-000000000001', :'org1', 'egen-detail', 'Egen detail', 'agreement');
insert into public.agreement_version (id, agreement_id, version, valid_from, document) values
  ('93000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-000000000001', 1, '2026-01-01',
   '{"id": "egen-detail", "version": 1, "valid_from": "2026-01-01", "valid_to": null}');
select lives_ok($$select public.publish_agreement_version('93000000-0000-0000-0000-000000000001')$$, 'a draft is published');
update public.agreement_version set valid_from = '2026-02-01' where id = '93000000-0000-0000-0000-000000000001';
select is((select valid_from from public.agreement_version where id = '93000000-0000-0000-0000-000000000001'), '2026-01-01'::date,
  'a published version cannot be changed');
insert into public.agreement_version (id, agreement_id, version, valid_from, document) values
  ('93000000-0000-0000-0000-000000000002', '92000000-0000-0000-0000-000000000001', 2, '2026-01-01',
   '{"id": "egen-detail", "version": 2, "valid_from": "2026-01-01", "valid_to": null}');
select throws_ok($$select public.publish_agreement_version('93000000-0000-0000-0000-000000000002')$$, '23514', null,
  'a new version must start after the published one');
update public.agreement_version set valid_from = '2027-01-01' where id = '93000000-0000-0000-0000-000000000002';
select lives_ok($$select public.publish_agreement_version('93000000-0000-0000-0000-000000000002')$$, 'the next version is published');
select is((select valid_to from public.agreement_version where id = '93000000-0000-0000-0000-000000000001'), '2026-12-31'::date,
  'the previous version ends the day before');
select is((select document ->> 'valid_to' from public.agreement_version where id = '93000000-0000-0000-0000-000000000001'), '2026-12-31',
  'also in the document the engine reads');
select is((select document ->> 'valid_from' from public.agreement_version where id = '93000000-0000-0000-0000-000000000002'), '2027-01-01',
  'the new document carries its start date');
select tests.logout();

select tests.login_as(:'manager');
select throws_ok($$select public.publish_agreement_version('93000000-0000-0000-0000-000000000002')$$, '42501', null,
  'managers do not publish agreements');
select tests.logout();

select * from finish();
rollback;
