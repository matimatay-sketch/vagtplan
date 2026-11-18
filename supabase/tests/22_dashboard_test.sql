-- Dashboard: bulletin board per department, birthdays and anniversaries.
begin;
select plan(10);

\set org1 20000000-0000-0000-0000-000000000001
\set admin 10000000-0000-0000-0000-000000000001
\set manager 10000000-0000-0000-0000-000000000002
\set emp 10000000-0000-0000-0000-000000000003
\set young 10000000-0000-0000-0000-000000000004
\set butik 30000000-0000-0000-0000-000000000001
\set cafe 30000000-0000-0000-0000-000000000002

select tests.login_as(:'manager');
select lives_ok(
  format($$insert into public.bulletin_post (organization_id, department_id, title, body) values (%L, %L, 'Vareoptælling', 'Lørdag kl. 8')$$, :'org1', :'butik'),
  'a manager posts to own department');
select throws_ok(
  format($$insert into public.bulletin_post (organization_id, department_id, title) values (%L, null, 'Alle')$$, :'org1'),
  '42501', null, 'but not to the whole organization');
select tests.logout();

select tests.login_as(:'admin');
insert into public.bulletin_post (organization_id, department_id, title) values (:'org1', null, 'Julefrokost');
insert into public.bulletin_post (organization_id, department_id, title) values (:'org1', :'cafe', 'Ny kaffemaskine');
select tests.logout();

select tests.login_as(:'emp');
select throws_ok(
  format($$insert into public.bulletin_post (organization_id, department_id, title) values (%L, %L, 'X')$$, :'org1', :'butik'),
  '42501', null, 'employees cannot post');
select is((select count(*) from public.bulletin_post), 3::bigint, 'Mads (Butik and Café) sees all three posts');
select tests.logout();

select tests.login_as(:'young');
select is((select string_agg(title, ',' order by title) from public.bulletin_post), 'Julefrokost,Vareoptælling',
  'Ida (Butik) sees the organization post and Butik, not Café');
-- Mads: born 2 September, hired 15 August 2023 (both in Butik with Ida).
select is((select kind || ':' || on_date from public.celebrations(:'org1', '2027-09-01', 3) where name = 'Mads Medarbejder'),
  'birthday:2027-09-02', 'a colleague''s birthday is shown');
select is((select years from public.celebrations(:'org1', '2027-08-14', 3) where name = 'Mads Medarbejder' and kind = 'anniversary'),
  4, 'and the work anniversary with whole years');
select is((select count(*) from public.celebrations(:'org1', '2027-09-01', 3) where on_date is null), 0::bigint, 'no undated rows');
select tests.logout();

select tests.login_as(:'emp');
select public.set_show_celebrations(false);
select tests.logout();
select tests.login_as(:'young');
select is((select count(*) from public.celebrations(:'org1', '2027-09-01', 3) where name = 'Mads Medarbejder'), 0::bigint,
  'an employee can opt out');
select tests.logout();

select ok((select count(*) from public.permission_grant g join public.permission_profile p on p.id = g.profile_id
  where p.is_owner and g.permission = 'bulletin.manage') >= 1, 'owners have bulletin.manage');

select * from finish();
rollback;
