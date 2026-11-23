-- Reports (Rapporter): a page of general reports. reports.view opens the page;
-- what each report shows is still limited by the tables' RLS (employees,
-- time, absence and shifts the user may see).
insert into public.permission (key, allowed_scopes, sort_order) values
  ('reports.view', '{departments,organization}', 330);

insert into public.permission_grant (organization_id, profile_id, permission, scope)
select p.organization_id, p.id, 'reports.view',
       case when p.is_owner then 'organization'::public.permission_scope else 'departments'::public.permission_scope end
from public.permission_profile p where p.is_owner or p.name = 'Leder'
on conflict do nothing;

create or replace function private.create_default_profiles(org uuid)
returns table (owner_id uuid, manager_id uuid, employee_id uuid)
language plpgsql security definer set search_path = '' as $$
declare
  o uuid; m uuid; e uuid;
begin
  perform set_config('app.bootstrap', 'on', true);
  insert into public.permission_profile (organization_id, name, description, is_owner)
  values (org, 'Administrator', 'Fuld adgang. Kan ikke ændres, og mindst én bruger skal have den.', true)
  returning id into o;
  insert into public.permission_grant (organization_id, profile_id, permission, scope)
  select org, o, p.key, 'organization' from public.permission p;

  insert into public.permission_profile (organization_id, name, description)
  values (org, 'Leder', 'Medarbejdere, kontrakter, vagtplan, tid, fravær, lønlinjer, projekttimer og opslagstavlen i de afdelinger, brugeren er ansvarlig for.')
  returning id into m;
  insert into public.permission_grant (organization_id, profile_id, permission, scope)
  select org, m, k, 'departments' from unnest(array[
    'employees.view', 'employees.manage', 'employees.invite', 'contracts.view', 'contracts.manage',
    'schedule.view', 'schedule.manage', 'schedule.publish', 'schedule.override', 'projects.view',
    'time.view', 'time.manage', 'time.approve', 'absence.view', 'absence.manage', 'absence.approve',
    'payroll.view', 'bulletin.manage', 'messages.send', 'reports.view'
  ]) as k;

  insert into public.permission_profile (organization_id, name, description)
  values (org, 'Medarbejder', 'Ser egne oplysninger og den offentliggjorte vagtplan for egne afdelinger. Registrerer egen tid, søger fravær og skriver til kolleger i egne afdelinger.')
  returning id into e;
  insert into public.permission_grant (organization_id, profile_id, permission, scope)
  values (org, e, 'messages.send', 'departments');

  update public.organization set default_profile_id = e where id = org;
  perform set_config('app.bootstrap', 'off', true);
  return query select o, m, e;
end $$;
