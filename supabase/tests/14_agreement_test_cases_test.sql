-- Saved test weeks per agreement.
begin;
select plan(4);

\set org1 20000000-0000-0000-0000-000000000001
\set admin 10000000-0000-0000-0000-000000000001
\set manager 10000000-0000-0000-0000-000000000002
\set template a0000000-0000-0000-0000-000000000002

select tests.login_as(:'admin');
select lives_ok(format($$insert into public.agreement_test_case (organization_id, agreement_id, name, test)
  values (%L, %L, 'Aftenvagt', '{"name": "Aftenvagt"}')$$, :'org1', :'template'), 'the admin saves a test week for a system template');
select tests.logout();

-- Another organization's agreement cannot be used.
insert into public.organization (id, name) values ('29000000-0000-0000-0000-000000000001', 'Anden');
insert into public.agreement (id, organization_id, key, name, kind)
values ('92900000-0000-0000-0000-000000000001', '29000000-0000-0000-0000-000000000001', 'fremmed', 'Fremmed', 'agreement');
select tests.login_as(:'admin');
select throws_ok(format($$insert into public.agreement_test_case (organization_id, agreement_id, name, test)
  values (%L, '92900000-0000-0000-0000-000000000001', 'x', '{}')$$, :'org1'), '23503', null,
  'another organization''s agreement cannot be used');
select tests.logout();

select tests.login_as(:'manager');
select is((select count(*) from public.agreement_test_case), 0::bigint, 'managers without agreements.manage do not see test weeks');
select throws_ok(format($$insert into public.agreement_test_case (organization_id, agreement_id, name, test)
  values (%L, %L, 'x', '{}')$$, :'org1', :'template'), '42501', null, 'nor create them');
select tests.logout();

select * from finish();
rollback;
