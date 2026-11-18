-- Norm percent: the share of a shift that counts towards the employee's hours
-- norm (e.g. on-call at 33 %). Set per shift or template; null = the
-- organization's default for the shift kind. `norm_in_pay` decides whether the
-- share is also used when the pay calculation finds overtime (null = default).

alter table public.organization_settings
  add column norm_percent_work smallint not null default 100 check (norm_percent_work between 0 and 100),
  add column norm_percent_on_call smallint not null default 0 check (norm_percent_on_call between 0 and 100),
  add column norm_in_pay_work boolean not null default false,
  add column norm_in_pay_on_call boolean not null default false;

comment on column public.organization_settings.norm_in_pay_work is
  'Default: use the norm percent of work shifts when finding overtime (false = work counts in full, as before).';
comment on column public.organization_settings.norm_in_pay_on_call is
  'Default: use the norm percent of on-call shifts when finding overtime (false = on-call does not count, as before).';

alter table public.shift
  add column norm_percent smallint check (norm_percent between 0 and 100),
  add column norm_in_pay boolean;
alter table public.shift_template
  add column norm_percent smallint check (norm_percent between 0 and 100),
  add column norm_in_pay boolean;

-- Draft detection includes the norm fields.
CREATE OR REPLACE FUNCTION private.shift_before_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if coalesce(current_setting('app.publishing', true), '') <> 'on' then
    if tg_op = 'INSERT' then
      new.status := 'draft';
      new.published := null;
      new.published_at := null;
    else
      new.published := old.published;
      new.published_at := old.published_at;
      if (new.employee_id, new.start_at, new.end_at, new.breaks, new.supplement_type_ids, new.project_allocations, new.posting_allocations, new.kind, new.label, new.department_id, new.archived_at, new.norm_percent, new.norm_in_pay)
         is distinct from
         (old.employee_id, old.start_at, old.end_at, old.breaks, old.supplement_type_ids, old.project_allocations, old.posting_allocations, old.kind, old.label, old.department_id, old.archived_at, old.norm_percent, old.norm_in_pay) then
        new.status := 'draft';
      else
        new.status := old.status;
      end if;
    end if;
  end if;
  new.updated_at := now();
  return new;
end $function$;

-- The published snapshot carries the norm fields (payroll reads the snapshot).
CREATE OR REPLACE FUNCTION public.publish_schedule(p_actor uuid, p_department_id uuid, p_from timestamp with time zone, p_to timestamp with time zone, p_from_date date, p_to_date date, p_violations jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  org uuid;
  pub uuid;
  n integer;
  blocking integer;
  needs_override integer;
  warnings integer;
  v jsonb;
begin
  select organization_id into org from public.department where id = p_department_id;
  if org is null then raise exception 'department not found' using errcode = 'P0002'; end if;
  perform set_config('app.actor_id', p_actor::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_actor)::text, true);
  if not private.can_on_department('schedule.publish', p_department_id) then
    raise exception 'not allowed to publish' using errcode = '42501';
  end if;
  select count(*) filter (where x ->> 'severity' = 'BLOCKING'),
         count(*) filter (where x ->> 'severity' = 'BLOCKING' and not coalesce((x ->> 'auto_override')::boolean, false)),
         count(*) filter (where x ->> 'severity' = 'WARNING')
    into blocking, needs_override, warnings
  from jsonb_array_elements(p_violations) x;
  if exists (
    select 1 from jsonb_array_elements(p_violations) x
    where x ->> 'severity' = 'BLOCKING' and length(trim(coalesce(x ->> 'override_reason', ''))) < 5
  ) then
    raise exception 'blocking violations need an override reason' using errcode = '23514';
  end if;
  if needs_override > 0 and not private.can_on_department('schedule.override', p_department_id) then
    raise exception 'not allowed to override' using errcode = '42501';
  end if;

  perform set_config('app.publishing', 'on', true);
  update public.shift s set
    published = case when s.archived_at is null then jsonb_build_object(
      'employee_id', s.employee_id, 'start_at', s.start_at, 'end_at', s.end_at,
      'breaks', s.breaks, 'supplement_type_ids', to_jsonb(s.supplement_type_ids),
      'project_allocations', s.project_allocations,
      'posting_allocations', s.posting_allocations,
      'kind', s.kind, 'label', s.label,
      'norm_percent', s.norm_percent, 'norm_in_pay', s.norm_in_pay) end,
    published_at = now(),
    status = 'published'
  where s.department_id = p_department_id
    and s.start_at >= p_from and s.start_at < p_to
    and (s.status = 'draft' or s.archived_at is not null and s.published is not null);
  get diagnostics n = row_count;
  perform set_config('app.publishing', 'off', true);

  insert into public.schedule_publication (organization_id, department_id, from_date, to_date, published_by, shift_count, blocking_count, warning_count)
  values (org, p_department_id, p_from_date, p_to_date, p_actor, n, blocking, warnings)
  returning id into pub;

  for v in select * from jsonb_array_elements(p_violations) loop
    insert into public.rule_violation (organization_id, publication_id, department_id, shift_id, employee_id,
      rule_id, code, severity, message, date, details, source, override_reason, overridden_by)
    values (org, pub, p_department_id, nullif(v ->> 'shift_id', '')::uuid, nullif(v ->> 'employee_id', '')::uuid,
      v ->> 'rule_id', v ->> 'code', v ->> 'severity', v ->> 'message', (v ->> 'date')::date,
      coalesce(v -> 'details', '{}'::jsonb) || jsonb_build_object('auto_override', coalesce((v ->> 'auto_override')::boolean, false)),
      v ->> 'source', nullif(trim(v ->> 'override_reason'), ''),
      case when v ->> 'severity' = 'BLOCKING' and not coalesce((v ->> 'auto_override')::boolean, false) then p_actor end);
  end loop;
  return pub;
end $function$;
