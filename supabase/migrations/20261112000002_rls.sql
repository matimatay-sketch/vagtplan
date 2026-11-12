-- Phase 1: Row Level Security.
--
-- Role model
--   admin    – everything in the organization, incl. agreements and settings.
--   manager  – employees/contracts in departments they manage (department_manager).
--   employee – own employee record and own contracts; reads department names.
--
-- Helper functions are SECURITY DEFINER so policies don't recurse through
-- RLS on membership/department_manager. They only ever look at auth.uid().

create function private.has_role(org uuid, roles public.app_role[])
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.membership m
    where m.organization_id = org and m.user_id = (select auth.uid()) and m.role = any (roles)
  );
$$;

create function private.is_member(org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.membership m
    where m.organization_id = org and m.user_id = (select auth.uid())
  );
$$;

create function private.is_admin(org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.has_role(org, array['admin']::public.app_role[]);
$$;

-- Departments the current user manages (manager role required).
create function private.managed_department_ids()
returns setof uuid language sql stable security definer set search_path = '' as $$
  select dm.department_id
  from public.department_manager dm
  join public.membership m
    on m.organization_id = dm.organization_id and m.user_id = dm.user_id
  where dm.user_id = (select auth.uid()) and m.role = 'manager';
$$;

create function private.manages_department(dept uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select dept in (select private.managed_department_ids());
$$;

-- Admin of the employee's organization, or manager of one of the employee's
-- departments.
create function private.can_manage_employee(emp uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.employee e
    where e.id = emp and private.is_admin(e.organization_id)
  ) or exists (
    select 1 from public.employee_department ed
    where ed.employee_id = emp
      and ed.department_id in (select private.managed_department_ids())
  );
$$;

create function private.is_self(emp uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.employee e
    where e.id = emp and e.user_id = (select auth.uid())
  );
$$;

grant execute on all functions in schema private to authenticated;

-- ---------------------------------------------------------------------------
alter table public.organization enable row level security;
alter table public.membership enable row level security;
alter table public.department enable row level security;
alter table public.department_manager enable row level security;
alter table public.employee enable row level security;
alter table public.employee_department enable row level security;
alter table public.agreement enable row level security;
alter table public.agreement_version enable row level security;
alter table public.pay_period_group enable row level security;
alter table public.contract enable row level security;

-- organization ---------------------------------------------------------------
create policy organization_select on public.organization for select to authenticated
  using (private.is_member(id));
create policy organization_update on public.organization for update to authenticated
  using (private.is_admin(id)) with check (private.is_admin(id));
-- Creation goes through public.create_organization().

-- membership -----------------------------------------------------------------
create policy membership_select on public.membership for select to authenticated
  using (user_id = (select auth.uid()) or private.has_role(organization_id, array['admin','manager']::public.app_role[]));
create policy membership_insert on public.membership for insert to authenticated
  with check (private.is_admin(organization_id));
create policy membership_update on public.membership for update to authenticated
  using (private.is_admin(organization_id))
  -- An admin cannot demote themselves (prevents orphaned organizations).
  with check (private.is_admin(organization_id) and (user_id <> (select auth.uid()) or role = 'admin'));
create policy membership_delete on public.membership for delete to authenticated
  using (private.is_admin(organization_id) and user_id <> (select auth.uid()));

-- department -----------------------------------------------------------------
create policy department_select on public.department for select to authenticated
  using (private.is_member(organization_id));
create policy department_insert on public.department for insert to authenticated
  with check (private.is_admin(organization_id));
create policy department_update on public.department for update to authenticated
  using (private.is_admin(organization_id)) with check (private.is_admin(organization_id));

-- department_manager ---------------------------------------------------------
create policy department_manager_select on public.department_manager for select to authenticated
  using (private.is_member(organization_id));
create policy department_manager_insert on public.department_manager for insert to authenticated
  with check (private.is_admin(organization_id));
create policy department_manager_delete on public.department_manager for delete to authenticated
  using (private.is_admin(organization_id));

-- employee -------------------------------------------------------------------
create policy employee_select on public.employee for select to authenticated
  using (private.can_manage_employee(id) or user_id = (select auth.uid()));
create policy employee_insert on public.employee for insert to authenticated
  with check (private.is_admin(organization_id));
-- Managers create employees via public.create_employee() so the department
-- link is created atomically.
create policy employee_update on public.employee for update to authenticated
  using (private.can_manage_employee(id))
  with check (private.can_manage_employee(id));

-- employee_department --------------------------------------------------------
create policy employee_department_select on public.employee_department for select to authenticated
  using (private.can_manage_employee(employee_id) or private.is_self(employee_id));
create policy employee_department_insert on public.employee_department for insert to authenticated
  with check (
    private.is_admin(organization_id)
    or (private.manages_department(department_id) and private.can_manage_employee(employee_id))
  );
create policy employee_department_update on public.employee_department for update to authenticated
  using (private.is_admin(organization_id) or private.manages_department(department_id))
  with check (private.is_admin(organization_id) or private.manages_department(department_id));
create policy employee_department_delete on public.employee_department for delete to authenticated
  using (private.is_admin(organization_id) or private.manages_department(department_id));

-- agreement / agreement_version ---------------------------------------------
create policy agreement_select on public.agreement for select to authenticated
  using (organization_id is null or private.is_member(organization_id));
create policy agreement_insert on public.agreement for insert to authenticated
  with check (organization_id is not null and private.is_admin(organization_id));
create policy agreement_update on public.agreement for update to authenticated
  using (organization_id is not null and private.is_admin(organization_id))
  with check (organization_id is not null and private.is_admin(organization_id));

create policy agreement_version_select on public.agreement_version for select to authenticated
  using (exists (
    select 1 from public.agreement a where a.id = agreement_id
      and (a.organization_id is null or private.is_member(a.organization_id))
  ));
create policy agreement_version_insert on public.agreement_version for insert to authenticated
  with check (exists (
    select 1 from public.agreement a where a.id = agreement_id
      and a.organization_id is not null and private.is_admin(a.organization_id)
  ));
-- Only drafts may be edited; published versions are immutable except for
-- being archived.
create policy agreement_version_update on public.agreement_version for update to authenticated
  using (exists (
    select 1 from public.agreement a where a.id = agreement_id
      and a.organization_id is not null and private.is_admin(a.organization_id)
  ) and status = 'draft')
  with check (exists (
    select 1 from public.agreement a where a.id = agreement_id
      and a.organization_id is not null and private.is_admin(a.organization_id)
  ));

-- pay_period_group -----------------------------------------------------------
create policy pay_period_group_select on public.pay_period_group for select to authenticated
  using (private.is_member(organization_id));
create policy pay_period_group_insert on public.pay_period_group for insert to authenticated
  with check (private.is_admin(organization_id));
create policy pay_period_group_update on public.pay_period_group for update to authenticated
  using (private.is_admin(organization_id)) with check (private.is_admin(organization_id));

-- contract -------------------------------------------------------------------
create policy contract_select on public.contract for select to authenticated
  using (private.can_manage_employee(employee_id) or private.is_self(employee_id));
create policy contract_insert on public.contract for insert to authenticated
  with check (private.can_manage_employee(employee_id));
create policy contract_update on public.contract for update to authenticated
  using (private.can_manage_employee(employee_id))
  with check (private.can_manage_employee(employee_id));

-- No DELETE policies on business tables: nothing is hard-deleted
-- (except department_manager / employee_department link rows and memberships).
