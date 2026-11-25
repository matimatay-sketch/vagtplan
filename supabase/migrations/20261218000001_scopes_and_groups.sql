-- "Gælder for": deviation reasons and supplement types can be limited to
-- departments, agreements and (deviation reasons) employee groups. An empty
-- list means all. An employee is in scope when every non-empty list matches:
-- one of their departments, the agreement or local agreement of their contract,
-- and their employee group.
--
-- Employee groups are named groups set on the employee (Medarbejdergruppe).

create table public.employee_group (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organization (id),
  name text not null check (length(btrim(name)) between 1 and 80),
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (organization_id, id)
);
create unique index employee_group_name_idx on public.employee_group (organization_id, lower(name))
  where archived_at is null;
create trigger employee_group_audit after insert or update or delete on public.employee_group
  for each row execute function private.audit_row();
create trigger employee_group_org_immutable before update on public.employee_group
  for each row execute function private.forbid_org_change();
alter table public.employee_group enable row level security;
create policy employee_group_select on public.employee_group for select to authenticated
  using (private.is_member(organization_id));
create policy employee_group_insert on public.employee_group for insert to authenticated
  with check (private.has_org_permission(organization_id, 'settings.manage'));
create policy employee_group_update on public.employee_group for update to authenticated
  using (private.has_org_permission(organization_id, 'settings.manage'))
  with check (private.has_org_permission(organization_id, 'settings.manage'));

alter table public.employee add column employee_group_id uuid;
alter table public.employee add constraint employee_group_fk
  foreign key (organization_id, employee_group_id) references public.employee_group (organization_id, id);

alter table public.deviation_reason
  add column department_ids uuid[] not null default '{}',
  add column agreement_ids uuid[] not null default '{}',
  add column employee_group_ids uuid[] not null default '{}';

alter table public.supplement_type
  add column department_ids uuid[] not null default '{}',
  add column agreement_ids uuid[] not null default '{}';

-- Whether an employee (on a date, in a department) is within a scope.
create function private.in_scope(emp uuid, d date, dept uuid,
  p_department_ids uuid[], p_agreement_ids uuid[], p_group_ids uuid[])
returns boolean language sql stable security definer set search_path = '' as $$
  select (cardinality(p_department_ids) = 0
          or dept = any (p_department_ids)
          or (dept is null and exists (select 1 from public.employee_department ed
                                       where ed.employee_id = emp and ed.department_id = any (p_department_ids))))
     and (cardinality(p_agreement_ids) = 0
          or exists (select 1 from public.contract c
                     where c.employee_id = emp and c.valid_from <= d
                       and (c.valid_to is null or c.valid_to >= d)
                       and (c.agreement_id = any (p_agreement_ids)
                            or c.local_agreement_id = any (p_agreement_ids))))
     and (cardinality(coalesce(p_group_ids, '{}')) = 0
          or exists (select 1 from public.employee e
                     where e.id = emp and e.employee_group_id = any (p_group_ids)));
$$;

-- Employees may only add supplements that apply to them.
create or replace function private.check_entry_supplements() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  added uuid[];
begin
  if exists (
    select 1 from unnest(new.supplement_type_ids) sid
    where not exists (select 1 from public.supplement_type t
                      where t.id = sid and t.organization_id = new.organization_id)
  ) then
    raise exception 'unknown supplement type' using errcode = '23503';
  end if;
  if coalesce(current_setting('app.time_system', true), '') = 'on' then
    return new;
  end if;
  added := array(
    select sid from unnest(new.supplement_type_ids) sid
    where tg_op = 'INSERT' or not (sid = any (old.supplement_type_ids))
  );
  if cardinality(added) > 0 and not private.can_on_department('time.manage', new.department_id) then
    if exists (
      select 1 from unnest(added) sid
      join public.supplement_type t on t.id = sid
      where not t.employee_selectable or t.archived_at is not null
         or not private.in_scope(new.employee_id, (new.start_at at time zone 'Europe/Copenhagen')::date,
                                 new.department_id, t.department_ids, t.agreement_ids, '{}')
    ) then
      raise exception 'this supplement cannot be chosen by the employee' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

-- A reason that is set or changed must be in use and apply to the employee.
create or replace function private.check_entry_reasons() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  r record;
begin
  for r in
    select x.* from public.deviation_reason x
    where (x.id = new.start_reason_id
           and new.start_reason_id is distinct from (case when tg_op = 'UPDATE' then old.start_reason_id end))
       or (x.id = new.end_reason_id
           and new.end_reason_id is distinct from (case when tg_op = 'UPDATE' then old.end_reason_id end))
  loop
    if r.archived_at is not null then
      raise exception 'the reason is no longer in use' using errcode = '23514';
    end if;
    if not private.in_scope(new.employee_id, (new.start_at at time zone 'Europe/Copenhagen')::date,
                            new.department_id, r.department_ids, r.agreement_ids, r.employee_group_ids) then
      raise exception 'the reason does not apply to this employee' using errcode = '23514',
        hint = 'reason_not_in_scope';
    end if;
  end loop;
  return new;
end $$;
