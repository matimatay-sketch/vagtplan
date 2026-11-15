-- Leave and on-call rules the consultant (the customer's administrator) can
-- set for the whole organization. Empty keys follow the agreement.
--   entitlement_proration: "none" | "remaining_months"
--   on_call_counts_as_rest: boolean
--   leave_day_basis: "weekdays" | "planned_days"
--   transfer_allowed / payout_allowed: boolean
--   transfer_only_above_days / payout_only_above_days: number | null
alter table public.organization_settings add column leave_rules jsonb not null default '{}'::jsonb
  check (jsonb_typeof(leave_rules) = 'object');

-- Local dates the employee is planned to work (published work shifts), for
-- counting leave days by plan. Visible to whoever may see the absence.
create function public.planned_work_dates(p_employee_id uuid, p_from date, p_to date)
returns setof date language sql stable security definer set search_path = '' as $$
  select distinct ((s.published ->> 'start_at')::timestamptz at time zone o.timezone)::date
  from public.shift s
  join public.organization o on o.id = s.organization_id
  where private.can_see_absence(p_employee_id)
    and s.published is not null and s.archived_at is null
    and (s.published ->> 'employee_id')::uuid = p_employee_id
    and (s.published ->> 'kind') = 'work'
    and ((s.published ->> 'start_at')::timestamptz at time zone o.timezone)::date between p_from and p_to
  order by 1;
$$;
grant execute on function public.planned_work_dates(uuid, date, date) to authenticated;
revoke execute on function public.planned_work_dates(uuid, date, date) from public, anon;
