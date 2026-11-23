-- Reports: reports.view opens the page; the data follows the other permissions.
begin;
select plan(3);

\set org1 20000000-0000-0000-0000-000000000001

select is((select g.scope::text from public.permission_grant g join public.permission_profile p on p.id = g.profile_id
           where p.organization_id = :'org1' and p.is_owner and g.permission = 'reports.view'),
  'organization', 'the owner sees reports for the whole organization');
select is((select g.scope::text from public.permission_grant g join public.permission_profile p on p.id = g.profile_id
           where p.organization_id = :'org1' and p.name = 'Leder' and g.permission = 'reports.view'),
  'departments', 'a manager sees reports for their departments');
select is((select count(*)::int from public.permission_grant g join public.permission_profile p on p.id = g.profile_id
           where p.organization_id = :'org1' and p.name = 'Medarbejder' and g.permission = 'reports.view'),
  0, 'an employee has no reports');

select * from finish();
rollback;
