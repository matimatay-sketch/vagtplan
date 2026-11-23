-- Deviation reasons (afvigelsesårsager): why an employee came or left early or
-- late, or stamped without a shift. The organization sets up the reasons and
-- what each does to the pay:
--   none      only recorded (statistics)
--   payout    the time is paid as the agreement says (as without a reason)
--   time_off  the extra time is taken as time off: by the agreement's overtime
--             rule (its time-off factor and pay code) or by a factor of its own
--             (1:1 = 10000 bp) with a time-off pay code
--   absence   the missing time (late arrival, early leave) is recorded as an
--             absence type and paid as that type says (full pay or none)
-- A registration has a reason for its start and one for its end (an unplanned
-- registration uses the start reason for all of it). A reason is required when
-- the deviation is more than the organization's threshold (minutes).

create table public.deviation_reason (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organization (id),
  name text not null check (length(trim(name)) between 1 and 80),
  -- early_in, late_in, early_out, late_out, unplanned
  applies_to text[] not null check (cardinality(applies_to) > 0
    and applies_to <@ array['early_in', 'late_in', 'early_out', 'late_out', 'unplanned']),
  treatment text not null check (treatment in ('none', 'payout', 'time_off', 'absence')),
  time_off_mode text not null default 'agreement' check (time_off_mode in ('agreement', 'factor')),
  time_off_factor_bp integer not null default 10000 check (time_off_factor_bp between 0 and 100000),
  time_off_pay_code text check (time_off_pay_code is null or time_off_pay_code ~ '^[A-Z0-9_]{1,32}$'),
  absence_type text check (absence_type is null or absence_type ~ '^[a-z_]+$'),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (organization_id, id),
  check (treatment <> 'absence' or absence_type is not null),
  check (treatment <> 'time_off' or time_off_mode = 'agreement' or time_off_pay_code is not null)
);
create index deviation_reason_org_idx on public.deviation_reason (organization_id) where archived_at is null;
create trigger deviation_reason_audit after insert or update or delete on public.deviation_reason
  for each row execute function private.audit_row();
create trigger deviation_reason_org_immutable before update on public.deviation_reason
  for each row execute function private.forbid_org_change();

alter table public.deviation_reason enable row level security;
create policy deviation_reason_select on public.deviation_reason for select to authenticated
  using (private.is_member(organization_id));
create policy deviation_reason_insert on public.deviation_reason for insert to authenticated
  with check (private.has_org_permission(organization_id, 'settings.manage') and archived_at is null);
create policy deviation_reason_update on public.deviation_reason for update to authenticated
  using (private.has_org_permission(organization_id, 'settings.manage'))
  with check (private.has_org_permission(organization_id, 'settings.manage'));

alter table public.organization_settings
  add column deviation_threshold_minutes integer not null default 5
  check (deviation_threshold_minutes between 0 and 240);

alter table public.time_entry
  add column start_reason_id uuid,
  add column end_reason_id uuid,
  add constraint time_entry_start_reason_fk foreign key (organization_id, start_reason_id)
    references public.deviation_reason (organization_id, id),
  add constraint time_entry_end_reason_fk foreign key (organization_id, end_reason_id)
    references public.deviation_reason (organization_id, id);

-- A reason that is set or changed must be in use (not deleted).
create function private.check_entry_reasons() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (new.start_reason_id is not null
      and new.start_reason_id is distinct from (case when tg_op = 'UPDATE' then old.start_reason_id end)
      and exists (select 1 from public.deviation_reason r where r.id = new.start_reason_id and r.archived_at is not null))
     or (new.end_reason_id is not null
      and new.end_reason_id is distinct from (case when tg_op = 'UPDATE' then old.end_reason_id end)
      and exists (select 1 from public.deviation_reason r where r.id = new.end_reason_id and r.archived_at is not null)) then
    raise exception 'the reason is no longer in use' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger time_entry_reasons_check before insert or update of start_reason_id, end_reason_id
  on public.time_entry for each row execute function private.check_entry_reasons();
