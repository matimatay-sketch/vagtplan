-- Automatic reminders can repeat weekly (on chosen weekdays, as before),
-- monthly, quarterly or yearly. For the last three: day_of_month (the last day
-- of a shorter month counts), and month: the month of the year (yearly) or the
-- month in each quarter, 1–3 (quarterly). Dates are the organization's local
-- dates. Mirrors isReminderDue in apps/web/src/lib/domain/reminder-schedule.ts.

alter table public.reminder_rule
  add column frequency text not null default 'weekly'
    check (frequency in ('weekly', 'monthly', 'quarterly', 'yearly')),
  add column day_of_month integer not null default 1 check (day_of_month between 1 and 31),
  add column month integer not null default 1 check (month between 1 and 12),
  add constraint reminder_rule_quarter_month check (frequency <> 'quarterly' or month between 1 and 3);

create function private.reminder_due(p_frequency text, p_weekdays integer[], p_day integer,
  p_month integer, d date)
returns boolean language sql immutable set search_path = '' as $$
  select case
    when p_frequency = 'weekly' then extract(isodow from d)::integer = any (p_weekdays)
    else extract(day from d)::integer
           = least(p_day, extract(day from (date_trunc('month', d) + interval '1 month - 1 day'))::integer)
         and case p_frequency
               when 'quarterly' then ((extract(month from d)::integer - 1) % 3) + 1 = p_month
               when 'yearly' then extract(month from d)::integer = p_month
               else true
             end
  end;
$$;

create or replace function public.run_due_reminders()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  r record;
  n integer := 0;
begin
  for r in
    select x.id from public.reminder_rule x
    join public.organization o on o.id = x.organization_id and o.archived_at is null
    where x.auto and x.archived_at is null
      and private.reminder_due(x.frequency, x.weekdays, x.day_of_month, x.month,
                               (now() at time zone o.timezone)::date)
      and (x.last_sent_at is null
           or (x.last_sent_at at time zone o.timezone)::date < (now() at time zone o.timezone)::date)
  loop
    n := n + private.deliver_reminders(r.id);
  end loop;
  return n;
end $$;
revoke execute on function public.run_due_reminders() from public, anon, authenticated;
grant execute on function public.run_due_reminders() to service_role;
