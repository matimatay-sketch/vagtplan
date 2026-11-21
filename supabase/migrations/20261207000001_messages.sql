-- Messages between users, shift swaps and "can't come" notices (afbud).
--
-- * Conversations have participants (users). Anyone in a conversation can
--   reply. Starting one is limited by `messages.send`:
--     no grant      – only to one's leaders (managers of one's departments)
--     departments   – also colleagues in one's departments
--     organization  – everyone in the organization
--   Leaders can always write to the people in the departments they manage.
-- * A shift swap is proposed by the employee who has the shift, accepted by
--   the colleague and, where the department requires it, approved by a leader.
--   The app checks the working-time rules first and then executes it with the
--   service role (accept_shift_swap / approve_shift_swap), which re-checks the
--   actor's rights, as publish_schedule does.
-- * An afbud tells the department's leaders that the employee cannot come.
--   The shift is shown as uncovered until a leader handles it.
-- * E-mail notifications are per department (department.message_email) and go
--   through an outbox that the server sends (email_claim / email_result).
--   The e-mail never contains the message itself.

insert into public.permission (key, allowed_scopes, sort_order) values
  ('messages.send', '{departments,organization}', 320);
-- Existing profiles: colleagues in their own departments (owners: everyone).
insert into public.permission_grant (organization_id, profile_id, permission, scope)
select p.organization_id, p.id, 'messages.send',
       case when p.is_owner then 'organization'::public.permission_scope else 'departments'::public.permission_scope end
from public.permission_profile p where p.archived_at is null
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
    'payroll.view', 'bulletin.manage', 'messages.send'
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

-- Per department: does a swap need a leader's approval, and are new messages
-- also sent by e-mail?
alter table public.department
  add column swap_requires_approval boolean not null default true,
  add column message_email boolean not null default false;

-- ---------------------------------------------------------------------------
-- Who may write to whom
-- ---------------------------------------------------------------------------
-- Departments the current user belongs to (as employee) or manages.
create function private.my_department_ids(org uuid) returns setof uuid
language sql stable security definer set search_path = '' as $$
  select ed.department_id from public.employee_department ed
  join public.employee e on e.id = ed.employee_id
  where e.organization_id = org and e.user_id = (select auth.uid()) and e.archived_at is null
  union
  select dm.department_id from public.department_manager dm
  where dm.organization_id = org and dm.user_id = (select auth.uid());
$$;

-- Users in a department: employees with a login and the department's managers.
create function private.department_user_ids(dept uuid) returns setof uuid
language sql stable security definer set search_path = '' as $$
  select e.user_id from public.employee_department ed
  join public.employee e on e.id = ed.employee_id
  where ed.department_id = dept and e.user_id is not null and e.archived_at is null
  union
  select dm.user_id from public.department_manager dm where dm.department_id = dept;
$$;

-- Leaders of the current user: managers of the departments the user works in.
create function private.my_leader_ids(org uuid) returns setof uuid
language sql stable security definer set search_path = '' as $$
  select dm.user_id from public.department_manager dm
  where dm.organization_id = org and dm.department_id in (
    select ed.department_id from public.employee_department ed
    join public.employee e on e.id = ed.employee_id
    where e.organization_id = org and e.user_id = (select auth.uid()) and e.archived_at is null);
$$;

create function private.can_message(org uuid, target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  -- coalesce: permission_scope is null without the permission.
  select coalesce(target is distinct from (select auth.uid())
    and exists (select 1 from public.membership m where m.organization_id = org and m.user_id = target)
    and private.is_member(org)
    and (
      private.permission_scope(org, 'messages.send') = 'organization'
      or target in (select private.my_leader_ids(org))
      -- Leaders reach the people in the departments they manage.
      or exists (select 1 from public.department_manager dm
                 where dm.organization_id = org and dm.user_id = (select auth.uid())
                   and target in (select private.department_user_ids(dm.department_id)))
      or (private.permission_scope(org, 'messages.send') = 'departments' and exists (
            select 1 from private.my_department_ids(org) d(id)
            where target in (select private.department_user_ids(d.id))))
    ), false);
$$;

-- Name shown for a user: the employee name, else the e-mail address.
create function private.user_display_name(org uuid, uid uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select trim(e.first_name || ' ' || e.last_name) from public.employee e
     where e.organization_id = org and e.user_id = uid and e.archived_at is null limit 1),
    (select split_part(u.email::text, '@', 1) from auth.users u where u.id = uid),
    '?');
$$;

-- People the current user can start a conversation with.
create function public.message_recipients(p_org uuid)
returns table (user_id uuid, name text, is_leader boolean, department_names text)
language sql stable security definer set search_path = '' as $$
  select m.user_id, private.user_display_name(p_org, m.user_id),
         m.user_id in (select private.my_leader_ids(p_org)),
         (select string_agg(d.name, ', ' order by d.name) from public.department d
          where d.organization_id = p_org and d.archived_at is null
            and m.user_id in (select private.department_user_ids(d.id)))
  from public.membership m
  where m.organization_id = p_org and private.can_message(p_org, m.user_id)
  order by 3 desc, 2;
$$;
revoke execute on function public.message_recipients(uuid) from public, anon;
grant execute on function public.message_recipients(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Conversations and messages
-- ---------------------------------------------------------------------------
create table public.conversation (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organization (id),
  subject text check (subject is null or length(trim(subject)) between 1 and 120),
  created_by uuid default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  unique (organization_id, id)
);

create table public.conversation_participant (
  organization_id uuid not null,
  conversation_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  last_read_at timestamptz,
  -- Hidden from the user's list until a new message arrives.
  archived_at timestamptz,
  primary key (conversation_id, user_id),
  foreign key (organization_id, conversation_id) references public.conversation (organization_id, id)
);
create index conversation_participant_user_idx on public.conversation_participant (user_id);

create type public.message_kind as enum ('text', 'swap', 'cancellation', 'system');

create table public.message (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  conversation_id uuid not null,
  sender_id uuid default auth.uid() references auth.users (id),
  kind public.message_kind not null default 'text',
  body text not null default '' check (length(body) <= 4000),
  swap_id uuid,
  cancellation_id uuid,
  -- Wall-clock time, so messages in one transaction keep their order.
  created_at timestamptz not null default clock_timestamp(),
  edited_at timestamptz,
  archived_at timestamptz,
  unique (organization_id, id),
  foreign key (organization_id, conversation_id) references public.conversation (organization_id, id),
  check (kind <> 'text' or length(trim(body)) > 0)
);
create index message_conversation_idx on public.message (conversation_id, created_at);

create function private.is_participant(conv uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.conversation_participant p
                 where p.conversation_id = conv and p.user_id = (select auth.uid()));
$$;

-- Messages are written as text by their sender; the other kinds only by RPCs.
-- A sender may correct or delete their own text message.
create function private.message_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(current_setting('app.messaging', true), '') = 'on' then return new; end if;
  if tg_op = 'INSERT' then
    if new.kind <> 'text' or new.swap_id is not null or new.cancellation_id is not null
       or new.sender_id is distinct from (select auth.uid()) then
      raise exception 'only text messages can be written directly' using errcode = '42501';
    end if;
    new.created_at := clock_timestamp();
    new.edited_at := null;
    new.archived_at := null;
    return new;
  end if;
  if (new.conversation_id, new.sender_id, new.kind, new.swap_id, new.cancellation_id, new.created_at)
     is distinct from (old.conversation_id, old.sender_id, old.kind, old.swap_id, old.cancellation_id, old.created_at) then
    raise exception 'only the text of a message can change' using errcode = '42501';
  end if;
  if old.archived_at is not null then
    raise exception 'the message is deleted' using errcode = '42501';
  end if;
  if new.body is distinct from old.body then new.edited_at := clock_timestamp(); end if;
  return new;
end $$;
create trigger message_guard before insert or update on public.message
  for each row execute function private.message_guard();

create function private.participant_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(current_setting('app.messaging', true), '') = 'on' then return new; end if;
  if (new.conversation_id, new.user_id, new.joined_at) is distinct from (old.conversation_id, old.user_id, old.joined_at) then
    raise exception 'only read and hidden state can change' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger conversation_participant_guard before update on public.conversation_participant
  for each row execute function private.participant_guard();

alter table public.conversation enable row level security;
alter table public.conversation_participant enable row level security;
alter table public.message enable row level security;

create policy conversation_select on public.conversation for select to authenticated
  using (private.is_participant(id));
create policy conversation_participant_select on public.conversation_participant for select to authenticated
  using (private.is_participant(conversation_id));
create policy conversation_participant_update on public.conversation_participant for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy message_select on public.message for select to authenticated
  using (private.is_participant(conversation_id));
create policy message_insert on public.message for insert to authenticated
  with check (private.is_participant(conversation_id) and sender_id = (select auth.uid()));
create policy message_update on public.message for update to authenticated
  using (sender_id = (select auth.uid()) and kind = 'text')
  with check (sender_id = (select auth.uid()) and kind = 'text');

-- ---------------------------------------------------------------------------
-- E-mail notifications (outbox)
-- ---------------------------------------------------------------------------
create table public.email_outbox (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organization (id),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('message')),
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index email_outbox_due_idx on public.email_outbox (next_attempt_at) where status = 'pending';
-- Only the server (service role) reads and writes it.
alter table public.email_outbox enable row level security;

-- Does the user get messages by e-mail? Set by the user's primary department
-- or, for leaders without an employee record, a department they manage.
create function private.wants_message_email(org uuid, uid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select d.message_email from public.employee e
     join public.employee_department ed on ed.employee_id = e.id and ed.is_primary
     join public.department d on d.id = ed.department_id
     where e.organization_id = org and e.user_id = uid and e.archived_at is null limit 1),
    (select bool_or(d.message_email) from public.department_manager dm
     join public.department d on d.id = dm.department_id
     where dm.organization_id = org and dm.user_id = uid and d.archived_at is null),
    false);
$$;

-- After a new message: the conversation moves up, comes back for those who
-- hid it, and recipients who had read everything get one e-mail (where their
-- department wants e-mail). Further messages before they read them send none.
create function private.message_after_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  p record;
  subj text;
begin
  update public.conversation set last_message_at = new.created_at where id = new.conversation_id;
  update public.conversation_participant set archived_at = null
  where conversation_id = new.conversation_id and archived_at is not null;
  select subject into subj from public.conversation where id = new.conversation_id;
  for p in
    select cp.user_id from public.conversation_participant cp
    where cp.conversation_id = new.conversation_id
      and cp.user_id is distinct from new.sender_id
      and private.wants_message_email(new.organization_id, cp.user_id)
      and not exists (
        select 1 from public.message m
        where m.conversation_id = new.conversation_id and m.id <> new.id and m.archived_at is null
          and m.sender_id is distinct from cp.user_id
          and m.created_at > coalesce(cp.last_read_at, '-infinity'::timestamptz))
  loop
    insert into public.email_outbox (organization_id, user_id, kind, payload)
    values (new.organization_id, p.user_id, 'message', jsonb_build_object(
      'conversation_id', new.conversation_id,
      'message_kind', new.kind,
      'subject', subj,
      'sender', case when new.sender_id is null then null
                     else private.user_display_name(new.organization_id, new.sender_id) end,
      'organization', (select name from public.organization where id = new.organization_id)));
  end loop;
  return null;
end $$;
create trigger message_after_insert after insert on public.message
  for each row execute function private.message_after_insert();

create function public.email_claim(p_limit integer default 20)
returns table (id uuid, email text, kind text, payload jsonb, attempts integer)
language plpgsql security definer set search_path = '' as $$
begin
  return query
  with due as (
    select o.id from public.email_outbox o
    where o.status = 'pending' and o.next_attempt_at <= now()
    order by o.next_attempt_at
    limit least(greatest(p_limit, 1), 100)
    for update skip locked
  )
  update public.email_outbox o set attempts = o.attempts + 1, next_attempt_at = now() + interval '5 minutes'
  from due, auth.users u
  where o.id = due.id and u.id = o.user_id
  returning o.id, u.email::text, o.kind, o.payload, o.attempts;
end $$;

create function public.email_result(p_id uuid, p_ok boolean, p_error text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  n integer;
begin
  select attempts into n from public.email_outbox where id = p_id;
  update public.email_outbox set
    status = case when p_ok then 'sent' when n >= 6 then 'failed' else 'pending' end,
    sent_at = case when p_ok then now() end,
    last_error = case when p_ok then null else left(p_error, 500) end,
    next_attempt_at = case when p_ok or n >= 6 then next_attempt_at
                           else now() + (power(2, n - 1) * interval '1 minute') end
  where id = p_id;
end $$;
revoke execute on function public.email_claim(integer) from public, anon, authenticated;
revoke execute on function public.email_result(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.email_claim(integer) to service_role;
grant execute on function public.email_result(uuid, boolean, text) to service_role;

-- Starts a conversation (or continues the existing one with exactly the same
-- person when there is no subject) and posts the first message.
create function public.start_conversation(p_org uuid, p_user_ids uuid[], p_subject text, p_body text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  conv uuid;
  u uuid;
  targets uuid[];
begin
  select array_agg(distinct x) into targets from unnest(p_user_ids) x where x is distinct from me;
  if coalesce(cardinality(targets), 0) = 0 then
    raise exception 'no recipients' using errcode = '22023';
  end if;
  if length(trim(coalesce(p_body, ''))) = 0 then
    raise exception 'empty message' using errcode = '22023';
  end if;
  foreach u in array targets loop
    if not private.can_message(p_org, u) then
      raise exception 'not allowed to write to this user' using errcode = '42501', hint = 'recipient';
    end if;
  end loop;
  if nullif(trim(coalesce(p_subject, '')), '') is null and cardinality(targets) = 1 then
    select c.id into conv from public.conversation c
    where c.organization_id = p_org and c.subject is null
      and exists (select 1 from public.conversation_participant p where p.conversation_id = c.id and p.user_id = me)
      and exists (select 1 from public.conversation_participant p where p.conversation_id = c.id and p.user_id = targets[1])
      and (select count(*) from public.conversation_participant p where p.conversation_id = c.id) = 2
      and not exists (select 1 from public.message m where m.conversation_id = c.id and m.kind <> 'text')
    order by c.last_message_at desc limit 1;
  end if;
  if conv is null then
    insert into public.conversation (organization_id, subject, created_by)
    values (p_org, nullif(trim(coalesce(p_subject, '')), ''), me) returning id into conv;
    insert into public.conversation_participant (organization_id, conversation_id, user_id, last_read_at)
    values (p_org, conv, me, clock_timestamp());
    insert into public.conversation_participant (organization_id, conversation_id, user_id)
    select p_org, conv, x from unnest(targets) x;
  end if;
  insert into public.message (organization_id, conversation_id, sender_id, body)
  values (p_org, conv, me, trim(p_body));
  return conv;
end $$;
revoke execute on function public.start_conversation(uuid, uuid[], text, text) from public, anon;
grant execute on function public.start_conversation(uuid, uuid[], text, text) to authenticated;

-- Unread messages for the current user (for the menu badge).
create function public.unread_message_count(p_org uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select count(*)::integer
  from public.conversation_participant cp
  join public.message m on m.conversation_id = cp.conversation_id
  where cp.organization_id = p_org and cp.user_id = (select auth.uid())
    and m.archived_at is null and m.sender_id is distinct from cp.user_id
    and m.created_at > coalesce(cp.last_read_at, '-infinity'::timestamptz);
$$;
revoke execute on function public.unread_message_count(uuid) from public, anon;
grant execute on function public.unread_message_count(uuid) to authenticated;

-- Conversation list with names, last message and unread count.
create function public.my_conversations(p_org uuid)
returns table (id uuid, subject text, last_message_at timestamptz, participant_names text,
               last_body text, last_kind public.message_kind, unread integer, hidden boolean)
language sql stable security definer set search_path = '' as $$
  select c.id, c.subject, c.last_message_at,
         (select string_agg(x.n, ', ' order by x.n) from (
            select private.user_display_name(p_org, p.user_id) as n
            from public.conversation_participant p where p.conversation_id = c.id and p.user_id <> me.uid) x),
         lm.body, lm.kind,
         (select count(*)::integer from public.message m
          where m.conversation_id = c.id and m.archived_at is null and m.sender_id is distinct from me.uid
            and m.created_at > coalesce(cp.last_read_at, '-infinity'::timestamptz)),
         cp.archived_at is not null
  from (select (select auth.uid()) as uid) me
  join public.conversation_participant cp on cp.user_id = me.uid and cp.organization_id = p_org
  join public.conversation c on c.id = cp.conversation_id
  left join lateral (
    select m.body, m.kind from public.message m
    where m.conversation_id = c.id and m.archived_at is null
    order by m.created_at desc limit 1) lm on true
  order by c.last_message_at desc;
$$;
revoke execute on function public.my_conversations(uuid) from public, anon;
grant execute on function public.my_conversations(uuid) to authenticated;

-- Names of a conversation's participants (auth.users is not exposed).
create function public.conversation_people(p_conversation_id uuid)
returns table (user_id uuid, name text)
language sql stable security definer set search_path = '' as $$
  select p.user_id, private.user_display_name(p.organization_id, p.user_id)
  from public.conversation_participant p
  where p.conversation_id = p_conversation_id and private.is_participant(p_conversation_id)
  order by 2;
$$;
revoke execute on function public.conversation_people(uuid) from public, anon;
grant execute on function public.conversation_people(uuid) to authenticated;

-- A system line in a conversation (RPCs only).
create function private.post_system_message(org uuid, conv uuid, body text, swap uuid, canc uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('app.messaging', 'on', true);
  insert into public.message (organization_id, conversation_id, sender_id, kind, body, swap_id, cancellation_id)
  values (org, conv, null, 'system', body, swap, canc);
  perform set_config('app.messaging', 'off', true);
end $$;

-- ---------------------------------------------------------------------------
-- Shift swaps
-- ---------------------------------------------------------------------------
create type public.swap_status as enum ('proposed', 'accepted', 'completed', 'declined', 'rejected', 'cancelled');

create table public.shift_swap (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  department_id uuid not null,
  shift_id uuid not null,
  requester_employee_id uuid not null,
  target_employee_id uuid not null,
  -- Null: the colleague takes the shift. Otherwise the two shifts are exchanged.
  target_shift_id uuid,
  status public.swap_status not null default 'proposed',
  note text check (note is null or length(note) <= 1000),
  conversation_id uuid not null,
  requires_approval boolean not null,
  responded_at timestamptz,
  decided_by uuid references auth.users (id),
  decided_at timestamptz,
  decision_note text check (decision_note is null or length(decision_note) <= 1000),
  completed_at timestamptz,
  created_by uuid default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, department_id) references public.department (organization_id, id),
  foreign key (organization_id, shift_id) references public.shift (organization_id, id),
  foreign key (organization_id, target_shift_id) references public.shift (organization_id, id),
  foreign key (organization_id, requester_employee_id) references public.employee (organization_id, id),
  foreign key (organization_id, target_employee_id) references public.employee (organization_id, id),
  foreign key (organization_id, conversation_id) references public.conversation (organization_id, id),
  check (requester_employee_id <> target_employee_id),
  check (target_shift_id is null or target_shift_id <> shift_id)
);
create unique index shift_swap_open_shift on public.shift_swap (shift_id) where status in ('proposed', 'accepted');
create unique index shift_swap_open_target on public.shift_swap (target_shift_id)
  where status in ('proposed', 'accepted') and target_shift_id is not null;
create index shift_swap_department_idx on public.shift_swap (department_id, status);
alter table public.message
  add constraint message_swap_fk foreign key (organization_id, swap_id) references public.shift_swap (organization_id, id);

alter table public.shift_swap enable row level security;
create policy shift_swap_select on public.shift_swap for select to authenticated
  using (private.is_own_employee(requester_employee_id)
         or private.is_own_employee(target_employee_id)
         or private.can_on_department('schedule.view', department_id)
         or private.can_on_department('schedule.manage', department_id));
-- No write policies: only the functions below change swaps.

-- The current user's employee id in the organization.
create function private.my_employee_id(org uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select e.id from public.employee e
  where e.organization_id = org and e.user_id = (select auth.uid()) and e.archived_at is null limit 1;
$$;

-- A shift that can be swapped: published without unpublished changes, held
-- by this employee and not started.
create function private.swappable(s public.shift, emp uuid) returns boolean
language sql stable set search_path = '' as $$
  select s.archived_at is null and s.status = 'published' and s.published is not null
     and s.employee_id = emp and (s.published ->> 'employee_id')::uuid = emp
     and s.start_at > now();
$$;

create function private.in_department_emp(emp uuid, dept uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.employee_department ed where ed.employee_id = emp and ed.department_id = dept);
$$;

create function public.propose_shift_swap(p_shift_id uuid, p_target_employee_id uuid, p_target_shift_id uuid, p_note text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  s public.shift;
  ts public.shift;
  me uuid;
  target public.employee;
  conv uuid;
  sw uuid;
  approval boolean;
begin
  select * into s from public.shift where id = p_shift_id for update;
  if s.id is null then raise exception 'shift not found' using errcode = 'P0002'; end if;
  me := private.my_employee_id(s.organization_id);
  if me is null or not private.swappable(s, me) then
    raise exception 'the shift cannot be swapped' using errcode = 'P0001', hint = 'shift_not_swappable';
  end if;
  select * into target from public.employee where id = p_target_employee_id and organization_id = s.organization_id;
  if target.id is null or target.archived_at is not null or target.user_id is null or target.id = me
     or not private.in_department_emp(target.id, s.department_id) then
    raise exception 'the colleague cannot take the shift' using errcode = 'P0001', hint = 'target_not_allowed';
  end if;
  if p_target_shift_id is not null then
    select * into ts from public.shift where id = p_target_shift_id for update;
    if ts.id is null or ts.organization_id <> s.organization_id or not private.swappable(ts, target.id)
       or not private.in_department_emp(me, ts.department_id) then
      raise exception 'the other shift cannot be swapped' using errcode = 'P0001', hint = 'shift_not_swappable';
    end if;
  end if;
  if exists (select 1 from public.shift_swap w where w.status in ('proposed', 'accepted')
             and (w.shift_id in (p_shift_id, p_target_shift_id) or w.target_shift_id in (p_shift_id, p_target_shift_id))) then
    raise exception 'the shift is already offered' using errcode = 'P0001', hint = 'already_offered';
  end if;
  select swap_requires_approval into approval from public.department where id = s.department_id;

  insert into public.conversation (organization_id, subject, created_by)
  values (s.organization_id, 'Vagtbytte', (select auth.uid())) returning id into conv;
  insert into public.conversation_participant (organization_id, conversation_id, user_id, last_read_at)
  values (s.organization_id, conv, (select auth.uid()), clock_timestamp()), (s.organization_id, conv, target.user_id, null);
  insert into public.shift_swap (organization_id, department_id, shift_id, requester_employee_id, target_employee_id,
                                 target_shift_id, note, conversation_id, requires_approval)
  values (s.organization_id, s.department_id, s.id, me, target.id, p_target_shift_id,
          nullif(trim(coalesce(p_note, '')), ''), conv, approval)
  returning id into sw;
  perform set_config('app.messaging', 'on', true);
  insert into public.message (organization_id, conversation_id, sender_id, kind, body, swap_id)
  values (s.organization_id, conv, (select auth.uid()), 'swap', coalesce(trim(p_note), ''), sw);
  perform set_config('app.messaging', 'off', true);
  return sw;
end $$;
revoke execute on function public.propose_shift_swap(uuid, uuid, uuid, text) from public, anon;
grant execute on function public.propose_shift_swap(uuid, uuid, uuid, text) to authenticated;

-- Moves the shifts. Both must still be as they were when proposed.
create function private.execute_swap(w public.shift_swap) returns void
language plpgsql security definer set search_path = '' as $$
declare
  s public.shift;
  ts public.shift;
begin
  select * into s from public.shift where id = w.shift_id for update;
  if not private.swappable(s, w.requester_employee_id) then
    raise exception 'the shift has changed' using errcode = 'P0001', hint = 'shift_changed';
  end if;
  if w.target_shift_id is not null then
    select * into ts from public.shift where id = w.target_shift_id for update;
    if not private.swappable(ts, w.target_employee_id) then
      raise exception 'the shift has changed' using errcode = 'P0001', hint = 'shift_changed';
    end if;
  end if;
  perform set_config('app.publishing', 'on', true);
  perform set_config('app.swapping', 'on', true);
  update public.shift set employee_id = w.target_employee_id,
    published = published || jsonb_build_object('employee_id', w.target_employee_id), published_at = now()
  where id = w.shift_id;
  if w.target_shift_id is not null then
    update public.shift set employee_id = w.requester_employee_id,
      published = published || jsonb_build_object('employee_id', w.requester_employee_id), published_at = now()
    where id = w.target_shift_id;
  end if;
  perform set_config('app.swapping', 'off', true);
  perform set_config('app.publishing', 'off', true);
  update public.shift_swap set status = 'completed', completed_at = now() where id = w.id;
end $$;

-- Service role: the app has checked the working-time rules for both employees.
create function public.accept_shift_swap(p_actor uuid, p_id uuid)
returns public.swap_status language plpgsql security definer set search_path = '' as $$
declare
  w public.shift_swap;
begin
  perform set_config('app.actor_id', p_actor::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_actor)::text, true);
  select * into w from public.shift_swap where id = p_id for update;
  if w.id is null or not private.is_own_employee(w.target_employee_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if w.status <> 'proposed' then
    raise exception 'the swap is no longer open' using errcode = 'P0001', hint = 'swap_closed';
  end if;
  update public.shift_swap set responded_at = now(),
    status = case when w.requires_approval then 'accepted'::public.swap_status else w.status end
  where id = p_id;
  if w.requires_approval then
    -- The department's leaders join the conversation and are notified.
    perform private.add_participants(w.organization_id, w.conversation_id, private.department_leaders(w.department_id));
    perform private.post_system_message(w.organization_id, w.conversation_id, 'accepted', w.id, null);
    return 'accepted';
  end if;
  perform private.execute_swap(w);
  perform private.post_system_message(w.organization_id, w.conversation_id, 'completed', w.id, null);
  return 'completed';
end $$;

create function public.approve_shift_swap(p_actor uuid, p_id uuid, p_note text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  w public.shift_swap;
begin
  perform set_config('app.actor_id', p_actor::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_actor)::text, true);
  select * into w from public.shift_swap where id = p_id for update;
  if w.id is null or not private.can_on_department('schedule.manage', w.department_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if w.status <> 'accepted' then
    raise exception 'the swap is not waiting for approval' using errcode = 'P0001', hint = 'swap_closed';
  end if;
  update public.shift_swap set decided_by = p_actor, decided_at = now(),
    decision_note = nullif(trim(coalesce(p_note, '')), '') where id = p_id;
  perform private.add_participants(w.organization_id, w.conversation_id, array[p_actor]);
  perform private.execute_swap(w);
  perform private.post_system_message(w.organization_id, w.conversation_id, 'approved', w.id, null);
end $$;
revoke execute on function public.accept_shift_swap(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.approve_shift_swap(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.accept_shift_swap(uuid, uuid) to service_role;
grant execute on function public.approve_shift_swap(uuid, uuid, text) to service_role;

-- Leaders taking part in an approval see the conversation.
create function private.add_participants(org uuid, conv uuid, uids uuid[]) returns void
language sql security definer set search_path = '' as $$
  insert into public.conversation_participant (organization_id, conversation_id, user_id)
  select org, conv, u from unnest(uids) u where u is not null
  on conflict do nothing;
$$;

-- Decline (colleague), cancel (requester) or reject (leader).
create function public.close_shift_swap(p_id uuid, p_action text, p_note text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  w public.shift_swap;
  st public.swap_status;
begin
  select * into w from public.shift_swap where id = p_id for update;
  if w.id is null then raise exception 'not found' using errcode = 'P0002'; end if;
  if p_action = 'decline' then
    if not private.is_own_employee(w.target_employee_id) then raise exception 'not allowed' using errcode = '42501'; end if;
    if w.status <> 'proposed' then raise exception 'closed' using errcode = 'P0001', hint = 'swap_closed'; end if;
    st := 'declined';
  elsif p_action = 'cancel' then
    if not private.is_own_employee(w.requester_employee_id) then raise exception 'not allowed' using errcode = '42501'; end if;
    if w.status not in ('proposed', 'accepted') then raise exception 'closed' using errcode = 'P0001', hint = 'swap_closed'; end if;
    st := 'cancelled';
  elsif p_action = 'reject' then
    if not private.can_on_department('schedule.manage', w.department_id) then raise exception 'not allowed' using errcode = '42501'; end if;
    if w.status <> 'accepted' then raise exception 'closed' using errcode = 'P0001', hint = 'swap_closed'; end if;
    st := 'rejected';
    perform private.add_participants(w.organization_id, w.conversation_id, array[(select auth.uid())]);
  else
    raise exception 'unknown action' using errcode = '22023';
  end if;
  update public.shift_swap set status = st,
    responded_at = case when p_action = 'decline' then now() else responded_at end,
    decided_by = case when p_action = 'reject' then (select auth.uid()) else decided_by end,
    decided_at = case when p_action = 'reject' then now() else decided_at end,
    decision_note = case when p_action = 'reject' then nullif(trim(coalesce(p_note, '')), '') else decision_note end
  where id = p_id;
  perform private.post_system_message(w.organization_id, w.conversation_id, st::text, w.id, null);
  if nullif(trim(coalesce(p_note, '')), '') is not null and p_action <> 'reject' then
    insert into public.message (organization_id, conversation_id, sender_id, body)
    values (w.organization_id, w.conversation_id, (select auth.uid()), trim(p_note));
  end if;
end $$;
revoke execute on function public.close_shift_swap(uuid, text, text) from public, anon;
grant execute on function public.close_shift_swap(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Afbud: an employee cannot come to a shift
-- ---------------------------------------------------------------------------
create type public.cancellation_status as enum ('open', 'resolved', 'withdrawn');

create table public.shift_cancellation (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  department_id uuid not null,
  shift_id uuid not null,
  employee_id uuid not null,
  reason text not null check (length(trim(reason)) between 1 and 1000),
  conversation_id uuid not null,
  status public.cancellation_status not null default 'open',
  resolved_by uuid references auth.users (id),
  resolved_at timestamptz,
  created_by uuid default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, department_id) references public.department (organization_id, id),
  foreign key (organization_id, shift_id) references public.shift (organization_id, id),
  foreign key (organization_id, employee_id) references public.employee (organization_id, id),
  foreign key (organization_id, conversation_id) references public.conversation (organization_id, id)
);
create unique index shift_cancellation_open on public.shift_cancellation (shift_id) where status = 'open';
create index shift_cancellation_department_idx on public.shift_cancellation (department_id, status);
alter table public.message
  add constraint message_cancellation_fk foreign key (organization_id, cancellation_id)
  references public.shift_cancellation (organization_id, id);

alter table public.shift_cancellation enable row level security;
create policy shift_cancellation_select on public.shift_cancellation for select to authenticated
  using (private.is_own_employee(employee_id)
         or private.can_on_department('schedule.view', department_id)
         or private.can_on_department('schedule.manage', department_id));

-- Who handles an afbud: the department's managers, else users who plan the
-- whole organization.
create function private.department_leaders(dept uuid) returns uuid[]
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select array_agg(dm.user_id) from public.department_manager dm where dm.department_id = dept),
    (select array_agg(distinct m.user_id) from public.membership m
     join public.permission_grant g on g.profile_id = m.profile_id
     join public.department d on d.organization_id = m.organization_id
     where d.id = dept and g.permission = 'schedule.manage' and g.scope = 'organization'),
    '{}');
$$;

create function public.report_shift_cancellation(p_shift_id uuid, p_reason text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  s public.shift;
  me uuid;
  conv uuid;
  c uuid;
begin
  select * into s from public.shift where id = p_shift_id;
  if s.id is null then raise exception 'shift not found' using errcode = 'P0002'; end if;
  me := private.my_employee_id(s.organization_id);
  if me is null or s.archived_at is not null or s.published is null or s.employee_id is distinct from me
     or (s.published ->> 'employee_id')::uuid is distinct from me or s.end_at <= now() then
    raise exception 'not your shift' using errcode = 'P0001', hint = 'shift_not_swappable';
  end if;
  if length(trim(coalesce(p_reason, ''))) = 0 then
    raise exception 'a reason is needed' using errcode = '22023';
  end if;
  if exists (select 1 from public.shift_cancellation x where x.shift_id = p_shift_id and x.status = 'open') then
    raise exception 'already reported' using errcode = 'P0001', hint = 'already_reported';
  end if;
  insert into public.conversation (organization_id, subject, created_by)
  values (s.organization_id, 'Afbud', (select auth.uid())) returning id into conv;
  insert into public.conversation_participant (organization_id, conversation_id, user_id, last_read_at)
  values (s.organization_id, conv, (select auth.uid()), clock_timestamp());
  perform private.add_participants(s.organization_id, conv, private.department_leaders(s.department_id));
  insert into public.shift_cancellation (organization_id, department_id, shift_id, employee_id, reason, conversation_id)
  values (s.organization_id, s.department_id, s.id, me, trim(p_reason), conv) returning id into c;
  perform set_config('app.messaging', 'on', true);
  insert into public.message (organization_id, conversation_id, sender_id, kind, body, cancellation_id)
  values (s.organization_id, conv, (select auth.uid()), 'cancellation', trim(p_reason), c);
  perform set_config('app.messaging', 'off', true);
  return c;
end $$;
revoke execute on function public.report_shift_cancellation(uuid, text) from public, anon;
grant execute on function public.report_shift_cancellation(uuid, text) to authenticated;

-- Withdraw (the employee comes after all) or mark as handled (a leader).
create function public.close_shift_cancellation(p_id uuid, p_action text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  c public.shift_cancellation;
  st public.cancellation_status;
begin
  select * into c from public.shift_cancellation where id = p_id for update;
  if c.id is null then raise exception 'not found' using errcode = 'P0002'; end if;
  if c.status <> 'open' then raise exception 'closed' using errcode = 'P0001', hint = 'cancellation_closed'; end if;
  if p_action = 'withdraw' and private.is_own_employee(c.employee_id) then
    st := 'withdrawn';
  elsif p_action = 'resolve' and private.can_on_department('schedule.manage', c.department_id) then
    st := 'resolved';
    perform private.add_participants(c.organization_id, c.conversation_id, array[(select auth.uid())]);
  else
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.shift_cancellation set status = st, resolved_by = (select auth.uid()), resolved_at = now() where id = p_id;
  perform private.post_system_message(c.organization_id, c.conversation_id, st::text, null, c.id);
end $$;
revoke execute on function public.close_shift_cancellation(uuid, text) from public, anon;
grant execute on function public.close_shift_cancellation(uuid, text) to authenticated;

-- When a leader changes a shift (other employee, other time, deleted), open
-- swaps of it are cancelled and an open afbud is handled.
create function private.shift_after_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  w record;
  c record;
begin
  if coalesce(current_setting('app.swapping', true), '') = 'on' then return null; end if;
  if (new.employee_id, new.start_at, new.end_at, new.archived_at) is not distinct from
     (old.employee_id, old.start_at, old.end_at, old.archived_at) then
    return null;
  end if;
  for w in select * from public.shift_swap
           where status in ('proposed', 'accepted') and (shift_id = new.id or target_shift_id = new.id) loop
    update public.shift_swap set status = 'cancelled' where id = w.id;
    perform private.post_system_message(w.organization_id, w.conversation_id, 'shift_changed', w.id, null);
  end loop;
  if new.employee_id is distinct from old.employee_id or new.archived_at is not null then
    for c in select * from public.shift_cancellation where status = 'open' and shift_id = new.id loop
      update public.shift_cancellation set status = 'resolved', resolved_by = (select auth.uid()), resolved_at = now()
      where id = c.id;
      perform private.post_system_message(c.organization_id, c.conversation_id, 'resolved', null, c.id);
    end loop;
  end if;
  return null;
end $$;
create trigger shift_after_change after update on public.shift
  for each row execute function private.shift_after_change();

-- ---------------------------------------------------------------------------
-- Read helpers for the pages (the employees cannot read each other's rows)
-- ---------------------------------------------------------------------------
-- Colleagues who can take one of the current user's shifts.
create function public.swap_candidates(p_shift_id uuid)
returns table (employee_id uuid, name text)
language sql stable security definer set search_path = '' as $$
  select e.id, trim(e.first_name || ' ' || e.last_name)
  from public.shift s
  join public.employee_department ed on ed.department_id = s.department_id
  join public.employee e on e.id = ed.employee_id
  where s.id = p_shift_id and s.employee_id = private.my_employee_id(s.organization_id)
    and e.user_id is not null and e.archived_at is null and e.id <> s.employee_id
  order by 2;
$$;
revoke execute on function public.swap_candidates(uuid) from public, anon;
grant execute on function public.swap_candidates(uuid) to authenticated;

create function private.can_see_swap(w public.shift_swap) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_own_employee(w.requester_employee_id) or private.is_own_employee(w.target_employee_id)
      or private.is_participant(w.conversation_id)
      or private.can_on_department('schedule.view', w.department_id)
      or private.can_on_department('schedule.manage', w.department_id);
$$;

create function public.swap_details(p_ids uuid[])
returns table (id uuid, status public.swap_status, conversation_id uuid, department_name text,
               requester_name text, target_name text, is_requester boolean, is_target boolean,
               can_decide boolean, requires_approval boolean, note text, decision_note text,
               shift_start timestamptz, shift_end timestamptz,
               target_shift_start timestamptz, target_shift_end timestamptz, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select w.id, w.status, w.conversation_id, d.name,
         trim(re.first_name || ' ' || re.last_name), trim(te.first_name || ' ' || te.last_name),
         private.is_own_employee(w.requester_employee_id), private.is_own_employee(w.target_employee_id),
         private.can_on_department('schedule.manage', w.department_id), w.requires_approval, w.note, w.decision_note,
         s.start_at, s.end_at, ts.start_at, ts.end_at, w.created_at
  from public.shift_swap w
  join public.department d on d.id = w.department_id
  join public.employee re on re.id = w.requester_employee_id
  join public.employee te on te.id = w.target_employee_id
  join public.shift s on s.id = w.shift_id
  left join public.shift ts on ts.id = w.target_shift_id
  where w.id = any (p_ids) and private.can_see_swap(w);
$$;
revoke execute on function public.swap_details(uuid[]) from public, anon;
grant execute on function public.swap_details(uuid[]) to authenticated;

create function public.cancellation_details(p_ids uuid[])
returns table (id uuid, status public.cancellation_status, conversation_id uuid, department_name text,
               employee_name text, is_mine boolean, can_resolve boolean, reason text,
               shift_id uuid, shift_start timestamptz, shift_end timestamptz, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select c.id, c.status, c.conversation_id, d.name, trim(e.first_name || ' ' || e.last_name),
         private.is_own_employee(c.employee_id), private.can_on_department('schedule.manage', c.department_id),
         c.reason, s.id, s.start_at, s.end_at, c.created_at
  from public.shift_cancellation c
  join public.department d on d.id = c.department_id
  join public.employee e on e.id = c.employee_id
  join public.shift s on s.id = c.shift_id
  where c.id = any (p_ids)
    and (private.is_own_employee(c.employee_id) or private.is_participant(c.conversation_id)
         or private.can_on_department('schedule.view', c.department_id)
         or private.can_on_department('schedule.manage', c.department_id));
$$;
revoke execute on function public.cancellation_details(uuid[]) from public, anon;
grant execute on function public.cancellation_details(uuid[]) to authenticated;

-- What waits for the current user: swaps to answer or approve, afbud to handle.
create function public.waiting_items(p_org uuid)
returns table (kind text, id uuid, conversation_id uuid, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select 'swap', w.id, w.conversation_id, w.created_at from public.shift_swap w
  where w.organization_id = p_org and (
    (w.status = 'proposed' and private.is_own_employee(w.target_employee_id))
    or (w.status = 'accepted' and private.can_on_department('schedule.manage', w.department_id)))
  union all
  select 'cancellation', c.id, c.conversation_id, c.created_at from public.shift_cancellation c
  where c.organization_id = p_org and c.status = 'open'
    and private.can_on_department('schedule.manage', c.department_id)
  order by 4;
$$;
revoke execute on function public.waiting_items(uuid) from public, anon;
grant execute on function public.waiting_items(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Audit, organization guard, realtime
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['conversation', 'conversation_participant', 'message', 'shift_swap',
                           'shift_cancellation', 'email_outbox'] loop
    execute format('create trigger %I after insert or update or delete on public.%I
      for each row execute function private.audit_row()', t || '_audit', t);
    execute format('create trigger %I before update on public.%I
      for each row execute function private.forbid_org_change()', t || '_org_immutable', t);
  end loop;
end $$;

alter publication supabase_realtime add table public.message, public.shift_swap, public.shift_cancellation;
