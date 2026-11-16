-- Supplements employees add to their own registrations.
-- The consultant marks which supplement types employees may choose; the
-- supplements are approved together with the registration and paid with it.

alter table public.supplement_type add column employee_selectable boolean not null default false;
alter table public.time_entry add column supplement_type_ids uuid[] not null default '{}';

-- Every id belongs to the organization. Someone without time.manage in the
-- department (the employee) may only add types marked employee_selectable.
create function private.check_entry_supplements() returns trigger
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
    ) then
      raise exception 'this supplement cannot be chosen by the employee' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
create trigger time_entry_supplements_check
  before insert or update of supplement_type_ids on public.time_entry
  for each row execute function private.check_entry_supplements();

drop function public.correct_time_entry(uuid, timestamptz, timestamptz, jsonb, jsonb, text, jsonb);
CREATE FUNCTION public.correct_time_entry(p_id uuid, p_start_at timestamp with time zone, p_end_at timestamp with time zone, p_breaks jsonb, p_project_allocations jsonb, p_reason text, p_posting_allocations jsonb DEFAULT '[]'::jsonb, p_supplement_type_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  old public.time_entry;
  new_id uuid;
begin
  select * into old from public.time_entry where id = p_id for update;
  if old.id is null then raise exception 'not found' using errcode = 'P0002'; end if;
  if not private.can_on_department('time.manage', old.department_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if old.status <> 'approved' or old.superseded_at is not null or old.archived_at is not null then
    raise exception 'only current approved registrations are corrected this way' using errcode = '22023';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 5 then
    raise exception 'a correction needs a reason' using errcode = '23514';
  end if;
  perform set_config('app.time_system', 'on', true);
  update public.time_entry set superseded_at = now() where id = old.id;
  perform set_config('app.time_system', 'off', true);
  insert into public.time_entry (organization_id, employee_id, department_id, shift_id, start_at, end_at,
    breaks, project_allocations, posting_allocations, supplement_type_ids, kind, source, status, note, deviation_reason, supersedes_id)
  values (old.organization_id, old.employee_id, old.department_id, old.shift_id, p_start_at, p_end_at,
    p_breaks, p_project_allocations, coalesce(p_posting_allocations, '[]'::jsonb),
    coalesce(p_supplement_type_ids, old.supplement_type_ids), old.kind, 'manual', 'pending', old.note, trim(p_reason), old.id)
  returning id into new_id;
  return new_id;
end $function$;
grant execute on function public.correct_time_entry(uuid, timestamptz, timestamptz, jsonb, jsonb, text, jsonb, uuid[]) to authenticated;

drop function public.time_overview(timestamptz, timestamptz);
CREATE FUNCTION public.time_overview(p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS TABLE(row_kind text, entry_id uuid, shift_id uuid, employee_id uuid, employee_name text, employee_number text, department_id uuid, department_name text, start_at timestamp with time zone, end_at timestamp with time zone, breaks jsonb, project_allocations jsonb, posting_allocations jsonb, status time_entry_status, source time_entry_source, deviation_reason text, note text, offline boolean, approved_at timestamp with time zone, approved_by_email text, version integer, is_mine boolean, plan_start timestamp with time zone, plan_end timestamp with time zone, plan_breaks jsonb, kind time_entry_kind, supplement_type_ids uuid[])
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with visible_department as (
    select d.id, d.name from public.department d
    where private.is_member(d.organization_id)
  )
  select 'entry', t.id, t.shift_id, t.employee_id, trim(e.first_name || ' ' || e.last_name), e.employee_number,
         t.department_id, vd.name, t.start_at, t.end_at, t.breaks, t.project_allocations, t.posting_allocations, t.status, t.source,
         t.deviation_reason, t.note, t.offline, t.approved_at, u.email::text,
         (with recursive chain as (
            select x.id, x.supersedes_id from public.time_entry x where x.id = t.id
            union all
            select y.id, y.supersedes_id from public.time_entry y join chain c on y.id = c.supersedes_id)
          select count(*)::int from chain),
         private.is_own_employee(t.employee_id),
         (s.published ->> 'start_at')::timestamptz, (s.published ->> 'end_at')::timestamptz, s.published -> 'breaks',
         t.kind, t.supplement_type_ids
  from public.time_entry t
  join visible_department vd on vd.id = t.department_id
  join public.employee e on e.id = t.employee_id
  left join public.shift s on s.id = t.shift_id
  left join auth.users u on u.id = t.approved_by
  where t.superseded_at is null and t.archived_at is null
    and t.start_at >= p_from and t.start_at < p_to
    and (private.is_own_employee(t.employee_id)
         or private.can_on_department('time.view', t.department_id)
         or private.can_on_department('time.manage', t.department_id)
         or private.can_on_department('time.approve', t.department_id)
         or private.is_time_approver(t.employee_id))
  union all
  select 'missing', null, s.id, (s.published ->> 'employee_id')::uuid, trim(e.first_name || ' ' || e.last_name),
         e.employee_number, s.department_id, vd.name, (s.published ->> 'start_at')::timestamptz,
         (s.published ->> 'end_at')::timestamptz, s.published -> 'breaks', s.published -> 'project_allocations', coalesce(s.published -> 'posting_allocations', '[]'::jsonb),
         null, null, null, null, false, null, null, 0, private.is_own_employee(e.id),
         (s.published ->> 'start_at')::timestamptz, (s.published ->> 'end_at')::timestamptz, s.published -> 'breaks',
         (s.published ->> 'kind')::public.time_entry_kind, '{}'::uuid[]
  from public.shift s
  join visible_department vd on vd.id = s.department_id
  join public.employee e on e.id = (s.published ->> 'employee_id')::uuid
  where s.published is not null and s.archived_at is null
    and (s.published ->> 'start_at')::timestamptz >= p_from and (s.published ->> 'start_at')::timestamptz < p_to
    and (s.published ->> 'end_at')::timestamptz <= now()
    and not exists (select 1 from public.time_entry t
                    where t.shift_id = s.id and t.superseded_at is null and t.archived_at is null)
    and (private.is_own_employee(e.id)
         or private.can_on_department('time.view', s.department_id)
         or private.can_on_department('time.manage', s.department_id)
         or private.can_on_department('time.approve', s.department_id)
         or private.is_time_approver(e.id))
  order by 9, 5;
$function$;
grant execute on function public.time_overview(timestamptz, timestamptz) to authenticated;

revoke execute on function
  public.correct_time_entry(uuid, timestamptz, timestamptz, jsonb, jsonb, text, jsonb, uuid[]),
  public.time_overview(timestamptz, timestamptz)
from public, anon;
