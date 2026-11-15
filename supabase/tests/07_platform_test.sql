-- Platform administration: customers are created by platform administrators.
begin;
select plan(14);

\set org1 20000000-0000-0000-0000-000000000001
\set admin 10000000-0000-0000-0000-000000000001
\set emp 10000000-0000-0000-0000-000000000003
\set platform 10000000-0000-0000-0000-000000000009

select tests.login_as(:'admin');
select hasnt_function('public', 'create_organization', 'self-service organization creation is gone');
select throws_ok($$select public.platform_create_organization('Ny kunde')$$, '42501', null,
  'a customer administrator is not a platform administrator');
select throws_ok($$select * from public.platform_organizations()$$, '42501', null,
  'only platform administrators list customers');
select throws_ok(format($$update public.organization set archived_at = now() where id = %L$$, :'org1'),
  '42501', null, 'a customer cannot archive itself');
select tests.logout();

select tests.login_as(:'platform');
select ok(public.is_platform_admin(), 'the platform user is a platform administrator');
create temp table t_org as select public.platform_create_organization('Ny Kunde ApS') as id;
select is((select count(*) from public.permission_profile p join t_org on p.organization_id = t_org.id), 0::bigint,
  'the platform user cannot read the new customer''s configuration');
select is(public.platform_user_id('LEDER@demo.dk'), '10000000-0000-0000-0000-000000000002'::uuid,
  'users are found by e-mail regardless of case');
select lives_ok(format($$select public.platform_add_owner((select id from t_org), %L)$$, :'emp'),
  'a user becomes administrator of the new customer');
select is((select owner_emails from public.platform_organizations() o join t_org on o.id = t_org.id),
  array['medarbejder@demo.dk'], 'the customer list shows its administrators');
select is((select count(*) from public.employee e where e.organization_id = (select id from t_org)), 0::bigint,
  'the platform user sees no customer data');
select lives_ok(format($$select public.platform_set_archived(%L, true)$$, :'org1'), 'the platform archives a customer');
select tests.logout();

select is((select count(*) from public.permission_profile p join t_org on p.organization_id = t_org.id), 3::bigint,
  'a new customer gets the default profiles');

select tests.login_as(:'admin');
select is((select count(*) from public.department), 0::bigint, 'members of an archived customer lose access');
select is((select count(*) from public.my_permissions(:'org1')), 0::bigint, 'and all their permissions');
select tests.logout();

select * from finish();
rollback;
