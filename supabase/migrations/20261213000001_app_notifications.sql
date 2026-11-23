-- The employee app: push notifications and calendar subscriptions.
--
-- push_device: a phone or browser that receives push notifications for a
--   user in an organization. "web" devices hold a Web Push subscription
--   (endpoint + keys); "ios"/"android" hold a Firebase Cloud Messaging token
--   from the store app. A device that stops working or is turned off is
--   archived, never deleted.
-- notification_setting: which kinds of notifications the user wants (all on
--   when there is no row).
-- push_outbox: notifications waiting to be sent, written by triggers and sent
--   by the server (push_claim / push_result), like email_outbox. The payload
--   never holds message text: notifications pass through Apple and Google.
-- calendar_feed: a secret link to the user's published shifts as an iCalendar
--   feed for the phone's own calendar. Only a hash of the token is stored; a
--   new link replaces the old one.

create table public.push_device (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organization (id),
  user_id uuid not null references auth.users (id) on delete cascade,
  platform text not null check (platform in ('web', 'ios', 'android')),
  -- Web Push endpoint URL, or the FCM registration token.
  token text not null check (length(token) between 10 and 4096),
  -- Web Push keys (p256dh, auth); empty for FCM.
  keys jsonb not null default '{}'::jsonb,
  label text not null default '' check (length(label) <= 120),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  archived_at timestamptz
);
create unique index push_device_token_idx on public.push_device (organization_id, user_id, token)
  where archived_at is null;
create index push_device_user_idx on public.push_device (user_id) where archived_at is null;
create trigger push_device_audit after insert or update or delete on public.push_device
  for each row execute function private.audit_row();
create trigger push_device_org_immutable before update on public.push_device
  for each row execute function private.forbid_org_change();
alter table public.push_device enable row level security;
create policy push_device_select on public.push_device for select to authenticated
  using (user_id = (select auth.uid()) and private.is_member(organization_id));
-- Writes go through register_push_device / remove_push_device.

create table public.notification_setting (
  organization_id uuid not null references public.organization (id),
  user_id uuid not null references auth.users (id) on delete cascade,
  messages boolean not null default true,
  schedule boolean not null default true,
  absence boolean not null default true,
  approvals boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);
create trigger notification_setting_audit after insert or update or delete on public.notification_setting
  for each row execute function private.audit_row();
create trigger notification_setting_org_immutable before update on public.notification_setting
  for each row execute function private.forbid_org_change();
alter table public.notification_setting enable row level security;
create policy notification_setting_select on public.notification_setting for select to authenticated
  using (user_id = (select auth.uid()) and private.is_member(organization_id));
create policy notification_setting_insert on public.notification_setting for insert to authenticated
  with check (user_id = (select auth.uid()) and private.is_member(organization_id));
create policy notification_setting_update on public.notification_setting for update to authenticated
  using (user_id = (select auth.uid()) and private.is_member(organization_id))
  with check (user_id = (select auth.uid()) and private.is_member(organization_id));

create table public.push_outbox (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organization (id),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- message, schedule, absence_decided, absence_requested
  kind text not null check (kind in ('message', 'schedule', 'absence_decided', 'absence_requested')),
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'skipped')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index push_outbox_due_idx on public.push_outbox (next_attempt_at) where status = 'pending';
-- Only the server (service role) reads and writes it.
alter table public.push_outbox enable row level security;

-- Does the user want this kind of notification, and has a device for it?
create function private.wants_push(org uuid, uid uuid, kind text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.push_device d
                 where d.organization_id = org and d.user_id = uid and d.archived_at is null)
     and coalesce((
       select case kind
         when 'message' then s.messages
         when 'schedule' then s.schedule
         when 'absence_decided' then s.absence
         when 'absence_requested' then s.approvals
       end
       from public.notification_setting s where s.organization_id = org and s.user_id = uid), true);
$$;

create function private.queue_push(org uuid, uid uuid, k text, payload jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if uid is not null and private.wants_push(org, uid, k) then
    insert into public.push_outbox (organization_id, user_id, kind, payload)
    values (org, uid, k, payload);
  end if;
end $$;

-- New message: every other participant (the text itself is never sent).
create function private.message_push() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  p record;
begin
  for p in
    select cp.user_id from public.conversation_participant cp
    where cp.conversation_id = new.conversation_id and cp.user_id is distinct from new.sender_id
  loop
    perform private.queue_push(new.organization_id, p.user_id, 'message', jsonb_build_object(
      'conversation_id', new.conversation_id,
      'message_kind', new.kind,
      'sender', case when new.sender_id is null then null
                     else private.user_display_name(new.organization_id, new.sender_id) end));
  end loop;
  return null;
end $$;
create trigger message_push after insert on public.message
  for each row execute function private.message_push();

-- Publishing changed someone's shifts: one notification per employee, with
-- the dates their changed shifts cover (old and new times).
create function private.schedule_push() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  r record;
begin
  if coalesce(current_setting('app.publishing', true), 'off') <> 'on' then return null; end if;
  for r in
    with changed as (
      select n.organization_id, n.published as now_p, o.published as before_p
      from new_rows n join old_rows o on o.id = n.id
      where n.published is distinct from o.published
    ), people as (
      select organization_id, (now_p ->> 'employee_id')::uuid as emp, (now_p ->> 'start_at')::timestamptz as at
      from changed where now_p is not null and now_p ->> 'employee_id' is not null
      union all
      select organization_id, (before_p ->> 'employee_id')::uuid, (before_p ->> 'start_at')::timestamptz
      from changed where before_p is not null and before_p ->> 'employee_id' is not null
    )
    select p.organization_id, e.user_id, min(p.at) as first_at, max(p.at) as last_at, count(*) as n
    from people p join public.employee e on e.id = p.emp and e.user_id is not null
    group by p.organization_id, e.user_id
  loop
    perform private.queue_push(r.organization_id, r.user_id, 'schedule', jsonb_build_object(
      'first_at', r.first_at, 'last_at', r.last_at));
  end loop;
  return null;
end $$;
create trigger shift_publish_push after update on public.shift
  referencing old table as old_rows new table as new_rows
  for each statement execute function private.schedule_push();

-- Absence: the employee hears the decision; approvers hear about new requests.
create function private.absence_push() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  emp_user uuid;
  a uuid;
begin
  select user_id into emp_user from public.employee where id = new.employee_id;
  if tg_op = 'INSERT' and new.status = 'requested' then
    for a in select private.approvers_for(new.employee_id, 'absence.approve') loop
      perform private.queue_push(new.organization_id, a, 'absence_requested', jsonb_build_object(
        'absence_id', new.id, 'employee', private.user_display_name(new.organization_id, emp_user),
        'type_code', new.type_code, 'from_date', new.from_date, 'to_date', new.to_date));
    end loop;
  elsif tg_op = 'UPDATE' and old.status = 'requested' and new.status in ('approved', 'rejected')
        and new.decided_by is distinct from emp_user then
    perform private.queue_push(new.organization_id, emp_user, 'absence_decided', jsonb_build_object(
      'absence_id', new.id, 'approved', new.status = 'approved',
      'type_code', new.type_code, 'from_date', new.from_date, 'to_date', new.to_date));
  end if;
  return null;
end $$;
create trigger absence_push after insert or update of status on public.absence
  for each row execute function private.absence_push();

-- Registers (or refreshes) this device for push in the organization.
create function public.register_push_device(p_org uuid, p_platform text, p_token text, p_keys jsonb, p_label text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  dev uuid;
begin
  if not private.is_member(p_org) then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_platform = 'web' and (p_keys ->> 'p256dh' is null or p_keys ->> 'auth' is null) then
    raise exception 'web push needs keys' using errcode = '22023';
  end if;
  select id into dev from public.push_device
  where organization_id = p_org and user_id = (select auth.uid()) and token = p_token and archived_at is null;
  if dev is not null then
    update public.push_device set last_seen_at = now(), keys = coalesce(p_keys, '{}'::jsonb),
      label = left(coalesce(p_label, ''), 120)
    where id = dev;
    return dev;
  end if;
  insert into public.push_device (organization_id, user_id, platform, token, keys, label)
  values (p_org, (select auth.uid()), p_platform, p_token, coalesce(p_keys, '{}'::jsonb), left(coalesce(p_label, ''), 120))
  returning id into dev;
  return dev;
end $$;
revoke execute on function public.register_push_device(uuid, text, text, jsonb, text) from public, anon;
grant execute on function public.register_push_device(uuid, text, text, jsonb, text) to authenticated;

-- Turns push off for a device of the caller (kept for the audit trail).
create function public.remove_push_device(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.push_device set archived_at = now()
  where id = p_id and user_id = (select auth.uid()) and archived_at is null;
  if not found then raise exception 'not found' using errcode = 'P0002'; end if;
end $$;
revoke execute on function public.remove_push_device(uuid) from public, anon;
grant execute on function public.remove_push_device(uuid) to authenticated;

-- Server side: due notifications with the devices to send them to.
create function public.push_claim(p_limit integer default 50)
returns table (id uuid, organization_id uuid, user_id uuid, kind text, payload jsonb, attempts integer, devices jsonb)
language plpgsql security definer set search_path = '' as $$
begin
  return query
  with due as (
    select o.id from public.push_outbox o
    where o.status = 'pending' and o.next_attempt_at <= now()
    order by o.next_attempt_at
    limit least(greatest(p_limit, 1), 200)
    for update skip locked
  )
  update public.push_outbox o set attempts = o.attempts + 1, next_attempt_at = now() + interval '5 minutes'
  from due
  where o.id = due.id
  returning o.id, o.organization_id, o.user_id, o.kind, o.payload, o.attempts,
    coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'platform', d.platform, 'token', d.token, 'keys', d.keys))
              from public.push_device d
              where d.organization_id = o.organization_id and d.user_id = o.user_id and d.archived_at is null),
             '[]'::jsonb);
end $$;

-- p_gone: devices the push service says no longer exist (archived).
create function public.push_result(p_id uuid, p_ok boolean, p_error text, p_gone uuid[])
returns void language plpgsql security definer set search_path = '' as $$
declare
  n integer;
begin
  update public.push_device set archived_at = now()
  where id = any(coalesce(p_gone, '{}')) and archived_at is null;
  select attempts into n from public.push_outbox where id = p_id;
  update public.push_outbox set
    status = case when p_ok then 'sent' when n >= 4 then 'failed' else 'pending' end,
    sent_at = case when p_ok then now() end,
    last_error = case when p_ok then null else left(p_error, 500) end,
    next_attempt_at = case when p_ok or n >= 4 then next_attempt_at
                           else now() + (power(2, n - 1) * interval '1 minute') end
  where id = p_id;
end $$;
revoke execute on function public.push_claim(integer) from public, anon, authenticated;
revoke execute on function public.push_result(uuid, boolean, text, uuid[]) from public, anon, authenticated;
grant execute on function public.push_claim(integer) to service_role;
grant execute on function public.push_result(uuid, boolean, text, uuid[]) to service_role;

-- ---------------------------------------------------------------- calendar feed
create table public.calendar_feed (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organization (id),
  user_id uuid not null references auth.users (id) on delete cascade,
  employee_id uuid not null,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  foreign key (organization_id, employee_id) references public.employee (organization_id, id)
);
create unique index calendar_feed_user_idx on public.calendar_feed (organization_id, user_id)
  where archived_at is null;
create trigger calendar_feed_audit after insert or update or delete on public.calendar_feed
  for each row execute function private.audit_row();
create trigger calendar_feed_org_immutable before update on public.calendar_feed
  for each row execute function private.forbid_org_change();
alter table public.calendar_feed enable row level security;
create policy calendar_feed_select on public.calendar_feed for select to authenticated
  using (user_id = (select auth.uid()) and private.is_member(organization_id));

-- A new secret link for the caller's own shifts (replaces the previous one).
-- The token is returned once; only its hash is kept.
create function public.create_calendar_feed(p_org uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  emp uuid;
  token text;
begin
  select id into emp from public.employee
  where organization_id = p_org and user_id = (select auth.uid()) and archived_at is null;
  if emp is null or not private.is_member(p_org) then
    raise exception 'only employees have a calendar' using errcode = '42501';
  end if;
  update public.calendar_feed set archived_at = now()
  where organization_id = p_org and user_id = (select auth.uid()) and archived_at is null;
  token := encode(extensions.gen_random_bytes(24), 'hex');
  insert into public.calendar_feed (organization_id, user_id, employee_id, token_hash)
  values (p_org, (select auth.uid()), emp, encode(extensions.digest(token, 'sha256'), 'hex'));
  return token;
end $$;
revoke execute on function public.create_calendar_feed(uuid) from public, anon;
grant execute on function public.create_calendar_feed(uuid) to authenticated;

-- Stops the caller's calendar link.
create function public.end_calendar_feed(p_org uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.calendar_feed set archived_at = now()
  where organization_id = p_org and user_id = (select auth.uid()) and archived_at is null;
end $$;
revoke execute on function public.end_calendar_feed(uuid) from public, anon;
grant execute on function public.end_calendar_feed(uuid) to authenticated;

-- Server side: the feed a token opens (nothing when the link was replaced, the
-- employee left the organization or the organization is closed).
create function public.calendar_feed_lookup(p_token text)
returns table (organization_id uuid, employee_id uuid, timezone text)
language sql stable security definer set search_path = '' as $$
  select f.organization_id, f.employee_id, o.timezone
  from public.calendar_feed f
  join public.organization o on o.id = f.organization_id and o.archived_at is null
  join public.employee e on e.id = f.employee_id and e.archived_at is null
  join public.membership m on m.organization_id = f.organization_id and m.user_id = f.user_id
  where f.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex') and f.archived_at is null;
$$;
revoke execute on function public.calendar_feed_lookup(text) from public, anon, authenticated;
grant execute on function public.calendar_feed_lookup(text) to service_role;
