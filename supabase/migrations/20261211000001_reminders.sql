-- Reminders (påmindelser): rules the organization sets up. A rule says what
-- to remind about and for which employees; it is sent with a button or
-- automatically on chosen weekdays (the daily cron). A reminder is a message
-- in Turnus (one conversation per rule and recipient) plus an e-mail.
--
-- Kinds and recipients:
--   missing_registration  employees with published work shifts that have ended
--                         (within the last lookback_days) without a registration
--   open_stamp            employees with a registration open for over 16 hours
--   time_approval         approvers of pending registrations (lookback_days)
--   absence_approval      approvers of absence requests waiting for a decision
--   expense_approval      approvers of pending mileage and expenses (lookback_days)
-- Approvers: the employee's personal approver and the managers of the
-- employee's departments who have the approval permission; if none, members
-- with the permission for the whole organization; plus their active substitutes.

insert into public.permission (key, allowed_scopes, sort_order) values
  ('reminders.manage', '{departments,organization}', 340);

insert into public.permission_grant (organization_id, profile_id, permission, scope)
select p.organization_id, p.id, 'reminders.manage',
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
    'payroll.view', 'bulletin.manage', 'messages.send', 'reports.view', 'reminders.manage'
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

alter type public.message_kind add value if not exists 'reminder';

create table public.reminder_rule (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organization (id),
  name text not null check (length(trim(name)) between 1 and 100),
  kind text not null check (kind in ('missing_registration', 'open_stamp', 'time_approval',
                                     'absence_approval', 'expense_approval')),
  -- Empty = all departments / all employees (within the departments).
  department_ids uuid[] not null default '{}',
  employee_ids uuid[] not null default '{}',
  lookback_days integer not null default 14 check (lookback_days between 1 and 93),
  note text not null default '' check (length(note) <= 500),
  auto boolean not null default false,
  -- ISO weekdays (1 = Monday) for automatic sending.
  weekdays integer[] not null default '{1,2,3,4,5}'
    check (weekdays <@ array[1,2,3,4,5,6,7]),
  last_sent_at timestamptz,
  last_sent_count integer,
  created_by uuid default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (organization_id, id)
);
create index reminder_rule_org_idx on public.reminder_rule (organization_id) where archived_at is null;
create trigger reminder_rule_audit after insert or update or delete on public.reminder_rule
  for each row execute function private.audit_row();

alter table public.conversation add column reminder_rule_id uuid references public.reminder_rule (id);

-- reminders.manage for the whole organization, or for departments the user is
-- responsible for (a department-scoped rule must name only such departments).
create function private.can_manage_reminder(org uuid, depts uuid[])
returns boolean language sql stable security definer set search_path = '' as $$
  select private.has_org_permission(org, 'reminders.manage')
      or (private.permission_scope(org, 'reminders.manage') = 'departments'
          and cardinality(depts) > 0
          and depts <@ array(select private.responsible_department_ids()));
$$;

alter table public.reminder_rule enable row level security;
create policy reminder_rule_select on public.reminder_rule for select to authenticated
  using (private.is_member(organization_id) and private.can_manage_reminder(organization_id, department_ids));
create policy reminder_rule_insert on public.reminder_rule for insert to authenticated
  with check (private.is_member(organization_id) and private.can_manage_reminder(organization_id, department_ids)
              and archived_at is null and last_sent_at is null);
create policy reminder_rule_update on public.reminder_rule for update to authenticated
  using (private.is_member(organization_id) and private.can_manage_reminder(organization_id, department_ids))
  with check (private.can_manage_reminder(organization_id, department_ids));

-- Employees and ids must belong to the rule's organization.
create function private.check_reminder_rule() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from unnest(new.department_ids) d
             where not exists (select 1 from public.department x where x.id = d and x.organization_id = new.organization_id))
     or exists (select 1 from unnest(new.employee_ids) e
                where not exists (select 1 from public.employee x where x.id = e and x.organization_id = new.organization_id)) then
    raise exception 'unknown department or employee' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger reminder_rule_check before insert or update on public.reminder_rule
  for each row execute function private.check_reminder_rule();

-- Who approves the employee for a permission (time.approve or absence.approve).
create function private.approvers_for(emp uuid, perm text)
returns setof uuid language sql stable security definer set search_path = '' as $$
  with e as (
    select x.id, x.organization_id, x.approver_user_id, x.user_id from public.employee x where x.id = emp
  ), direct as (
    select e.approver_user_id as u from e where e.approver_user_id is not null
    union
    select dm.user_id from e
    join public.employee_department ed on ed.employee_id = e.id
    join public.department_manager dm on dm.department_id = ed.department_id
    where private.user_permission_scope(e.organization_id, perm, dm.user_id) is not null
  ), base as (
    select u from direct
    union
    select m.user_id from e join public.membership m on m.organization_id = e.organization_id
    where not exists (select 1 from direct)
      and private.user_permission_scope(e.organization_id, perm, m.user_id) = 'organization'
  ), everyone as (
    select u from base
    union
    select s.substitute_user_id from e
    join public.organization o on o.id = e.organization_id
    join public.approval_substitute s on s.organization_id = e.organization_id and s.archived_at is null
      and (now() at time zone o.timezone)::date between s.valid_from and s.valid_to
    where s.absent_user_id in (select u from base)
  )
  select u from everyone where u is distinct from (select user_id from e);
$$;

-- Recipients of a rule now, with the number of things each is reminded of.
create function private.reminder_targets(rid uuid)
returns table (user_id uuid, items integer)
language plpgsql stable security definer set search_path = '' as $$
declare
  r public.reminder_rule;
  since timestamptz;
begin
  select * into r from public.reminder_rule where id = rid;
  since := now() - make_interval(days => r.lookback_days);
  return query
  with audience as (
    select e.id, e.user_id, e.login_placeholder from public.employee e
    where e.organization_id = r.organization_id and e.archived_at is null
      and (cardinality(r.employee_ids) = 0 or e.id = any (r.employee_ids))
      and (cardinality(r.department_ids) = 0 or exists (
        select 1 from public.employee_department ed
        where ed.employee_id = e.id and ed.department_id = any (r.department_ids)))
  ), per_employee as (
    select a.id, a.user_id, a.login_placeholder,
      case r.kind
        when 'missing_registration' then (
          -- The published version of the shift (it may since have been changed as a draft).
          select count(*) from public.shift s
          where s.employee_id = a.id and s.published is not null and s.archived_at is null
            and s.kind = 'work' and (s.published ->> 'end_at')::timestamptz <= now()
            and (s.published ->> 'end_at')::timestamptz > since
            and not exists (select 1 from public.time_entry t
                            where t.shift_id = s.id and t.archived_at is null))
        when 'open_stamp' then (
          select count(*) from public.time_entry t
          where t.employee_id = a.id and t.status = 'open' and t.archived_at is null
            and t.superseded_at is null and t.start_at < now() - interval '16 hours')
        when 'time_approval' then (
          select count(*) from public.time_entry t
          where t.employee_id = a.id and t.status = 'pending' and t.archived_at is null
            and t.superseded_at is null and t.start_at > since)
        when 'absence_approval' then (
          select count(*) from public.absence x where x.employee_id = a.id and x.status = 'requested')
        when 'expense_approval' then (
          (select count(*) from public.mileage_trip m where m.employee_id = a.id and m.status = 'pending'
             and m.archived_at is null and m.trip_date > (since at time zone 'UTC')::date)
          + (select count(*) from public.expense x where x.employee_id = a.id and x.status = 'pending'
             and x.archived_at is null and x.expense_date > (since at time zone 'UTC')::date))
      end::integer as n
    from audience a
  )
  select t.uid, sum(t.n)::integer from (
    -- The employee is reminded themself.
    select p.user_id as uid, p.n from per_employee p
    where r.kind in ('missing_registration', 'open_stamp') and p.n > 0
      and p.user_id is not null and not p.login_placeholder
    union all
    -- The approvers are reminded.
    select ap, p.n from per_employee p
    cross join lateral private.approvers_for(
      p.id, case when r.kind = 'absence_approval' then 'absence.approve' else 'time.approve' end) ap
    where r.kind in ('time_approval', 'absence_approval', 'expense_approval') and p.n > 0
  ) t
  join public.membership m on m.organization_id = r.organization_id and m.user_id = t.uid
  group by t.uid;
end $$;

-- Sends the rule's reminders: a message per recipient in the rule's
-- conversation with them, and an e-mail (also where the department has not
-- chosen e-mail for messages). Returns the recipients and their counts.
create function private.deliver_reminders(rid uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  r public.reminder_rule;
  t record;
  conv uuid;
  sent integer := 0;
begin
  select * into r from public.reminder_rule where id = rid;
  perform set_config('app.messaging', 'on', true);
  for t in select * from private.reminder_targets(rid) loop
    select c.id into conv from public.conversation c
    join public.conversation_participant p on p.conversation_id = c.id and p.user_id = t.user_id
    where c.reminder_rule_id = rid limit 1;
    if conv is null then
      insert into public.conversation (organization_id, subject, created_by, reminder_rule_id)
      values (r.organization_id, r.name, null, rid) returning id into conv;
      insert into public.conversation_participant (organization_id, conversation_id, user_id)
      values (r.organization_id, conv, t.user_id);
    end if;
    insert into public.message (organization_id, conversation_id, sender_id, kind, body)
    values (r.organization_id, conv, null, 'reminder',
            jsonb_build_object('kind', r.kind, 'count', t.items, 'note', r.note)::text);
    if not private.wants_message_email(r.organization_id, t.user_id) then
      insert into public.email_outbox (organization_id, user_id, kind, payload)
      values (r.organization_id, t.user_id, 'message', jsonb_build_object(
        'conversation_id', conv, 'message_kind', 'reminder', 'subject', r.name, 'sender', null,
        'organization', (select name from public.organization where id = r.organization_id)));
    end if;
    conv := null;
    sent := sent + 1;
  end loop;
  perform set_config('app.messaging', 'off', true);
  update public.reminder_rule set last_sent_at = now(), last_sent_count = sent where id = rid;
  return sent;
end $$;

-- Preview (p_send = false) or send a rule now.
create function public.send_reminders(p_rule_id uuid, p_send boolean)
returns table (user_id uuid, name text, items integer)
language plpgsql security definer set search_path = '' as $$
declare
  r public.reminder_rule;
begin
  select * into r from public.reminder_rule where id = p_rule_id and archived_at is null;
  if r.id is null then raise exception 'not found' using errcode = 'P0002'; end if;
  if not (private.is_member(r.organization_id) and private.can_manage_reminder(r.organization_id, r.department_ids)) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
  select t.user_id, private.user_display_name(r.organization_id, t.user_id), t.items
  from private.reminder_targets(p_rule_id) t order by 2;
  if p_send then perform private.deliver_reminders(p_rule_id); end if;
end $$;
revoke execute on function public.send_reminders(uuid, boolean) from public, anon;
grant execute on function public.send_reminders(uuid, boolean) to authenticated;

-- Automatic reminders that are due today (local weekday, not sent today).
-- Called by the daily cron with the service role.
create function public.run_due_reminders()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  r record;
  n integer := 0;
begin
  for r in
    select x.id from public.reminder_rule x
    join public.organization o on o.id = x.organization_id and o.archived_at is null
    where x.auto and x.archived_at is null
      and extract(isodow from (now() at time zone o.timezone))::integer = any (x.weekdays)
      and (x.last_sent_at is null
           or (x.last_sent_at at time zone o.timezone)::date < (now() at time zone o.timezone)::date)
  loop
    n := n + private.deliver_reminders(r.id);
  end loop;
  return n;
end $$;
revoke execute on function public.run_due_reminders() from public, anon, authenticated;
grant execute on function public.run_due_reminders() to service_role;
