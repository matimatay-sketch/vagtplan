-- Integrations: API keys, the public API (/api/v1) and webhooks.
--
-- API keys belong to an organization and carry scopes. Only a SHA-256 hash of
-- the key is stored. The API runs on the server with the service role after
-- api_key_lookup has confirmed the key; every query is filtered on the key's
-- organization (see apps/web/src/lib/api).
--
-- Webhooks use an outbox: triggers write webhook_delivery rows for active
-- endpoints that subscribe to the event; the server sends them signed
-- (HMAC-SHA256) and retries with backoff.

insert into public.permission (key, allowed_scopes, sort_order) values
  ('integrations.manage', '{organization}', 310);
insert into public.permission_grant (organization_id, profile_id, permission, scope)
select p.organization_id, p.id, 'integrations.manage', 'organization'
from public.permission_profile p where p.is_owner
on conflict do nothing;

create table public.api_key (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organization (id),
  name text not null check (length(trim(name)) between 1 and 80),
  prefix text not null check (prefix ~ '^tk_[A-Za-z0-9_-]{6,12}$'),
  key_hash text not null unique check (key_hash ~ '^[0-9a-f]{64}$'),
  scopes text[] not null check (cardinality(scopes) > 0 and scopes <@ array[
    'employees.read', 'employees.write', 'schedule.read', 'time.read', 'time.stamp',
    'absence.read', 'payroll.read', 'posting.read']),
  created_by uuid default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz,
  unique (organization_id, id)
);
alter table public.api_key enable row level security;
create policy api_key_select on public.api_key for select to authenticated
  using (private.has_org_permission(organization_id, 'integrations.manage'));
create policy api_key_insert on public.api_key for insert to authenticated
  with check (private.has_org_permission(organization_id, 'integrations.manage') and revoked_at is null);
create policy api_key_update on public.api_key for update to authenticated
  using (private.has_org_permission(organization_id, 'integrations.manage'))
  with check (private.has_org_permission(organization_id, 'integrations.manage'));

-- A key cannot be changed, only revoked (and its use recorded).
create function private.api_key_before_update() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (new.name, new.prefix, new.key_hash, new.scopes, new.created_by, new.created_at)
     is distinct from (old.name, old.prefix, old.key_hash, old.scopes, old.created_by, old.created_at) then
    raise exception 'an API key cannot be changed; create a new one' using errcode = '42501';
  end if;
  if old.revoked_at is not null and new.revoked_at is distinct from old.revoked_at then
    raise exception 'a revoked key stays revoked' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger api_key_before_update before update on public.api_key
  for each row execute function private.api_key_before_update();

-- The server's only way in: hash → organization and scopes (service role).
create function public.api_key_lookup(p_hash text)
returns table (key_id uuid, organization_id uuid, scopes text[])
language plpgsql security definer set search_path = '' as $$
begin
  return query
  update public.api_key k set last_used_at = now()
  where k.key_hash = p_hash and k.revoked_at is null
    and exists (select 1 from public.organization o where o.id = k.organization_id and o.archived_at is null)
  returning k.id, k.organization_id, k.scopes;
end $$;
revoke execute on function public.api_key_lookup(text) from public, anon, authenticated;
grant execute on function public.api_key_lookup(text) to service_role;

-- ---------------------------------------------------------------------------
-- Stamping: shared by the app (own employee) and the API (terminals).

CREATE FUNCTION private.stamp_for(p_organization_id uuid, emp uuid, p_client_id uuid, p_action text, p_at timestamp with time zone, p_posting_allocations jsonb DEFAULT NULL::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  at timestamptz := least(coalesce(p_at, now()), now());
  late boolean := abs(extract(epoch from now() - coalesce(p_at, now()))) > 300;
  existing uuid;
  open_entry public.time_entry;
  sh record;
  dept uuid;
begin
  -- Replays of an action already received return the same registration.
  select id into existing from public.time_entry
  where organization_id = p_organization_id and (client_id = p_client_id or end_client_id = p_client_id);
  if existing is not null then return existing; end if;
  if at < now() - interval '7 days' then
    raise exception 'stamp too old' using errcode = '22023';
  end if;

  select * into open_entry from public.time_entry
  where employee_id = emp and status = 'open' and superseded_at is null and archived_at is null;

  if p_action = 'in' then
    if open_entry.id is not null then
      raise exception 'already stamped in' using errcode = 'P0001', hint = 'already_in';
    end if;
    -- The employee's published shift closest to the stamp (within 4 hours) that has no registration.
    select s.id, s.department_id, s.published into sh
    from public.shift s
    where s.published is not null and s.archived_at is null
      and (s.published ->> 'employee_id')::uuid = emp
      and abs(extract(epoch from (s.published ->> 'start_at')::timestamptz - at)) <= 4 * 3600
      and not exists (select 1 from public.time_entry t
                      where t.shift_id = s.id and t.superseded_at is null and t.archived_at is null)
    order by abs(extract(epoch from (s.published ->> 'start_at')::timestamptz - at))
    limit 1;
    if sh.id is not null then
      dept := sh.department_id;
    else
      select ed.department_id into dept from public.employee_department ed
      where ed.employee_id = emp order by ed.is_primary desc limit 1;
    end if;
    if dept is null then raise exception 'employee has no department' using errcode = '23514'; end if;
    insert into public.time_entry (organization_id, employee_id, department_id, shift_id, start_at,
      breaks, project_allocations, posting_allocations, kind, source, status, client_id, offline)
    values (p_organization_id, emp, dept, sh.id, at,
      coalesce(sh.published -> 'breaks', '[]'::jsonb), coalesce(sh.published -> 'project_allocations', '[]'::jsonb),
      coalesce(p_posting_allocations, sh.published -> 'posting_allocations', '[]'::jsonb),
      coalesce(sh.published ->> 'kind', 'work')::public.time_entry_kind, 'stamp', 'open', p_client_id, late)
    returning id into existing;
    return existing;
  elsif p_action = 'out' then
    if open_entry.id is null then
      raise exception 'not stamped in' using errcode = 'P0001', hint = 'not_in';
    end if;
    if at <= open_entry.start_at then at := open_entry.start_at + interval '1 minute'; end if;
    update public.time_entry set
      end_at = at, end_client_id = p_client_id, status = 'pending',
      breaks = private.fit_breaks(breaks, start_at, at),
      offline = offline or late,
      posting_allocations = coalesce(p_posting_allocations, posting_allocations)
    where id = open_entry.id;
    return open_entry.id;
  end if;
  raise exception 'unknown action' using errcode = '22023';
end $function$;

drop function public.stamp(uuid, uuid, text, timestamptz, jsonb);
create function public.stamp(p_organization_id uuid, p_client_id uuid, p_action text,
  p_at timestamptz, p_posting_allocations jsonb default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  emp uuid;
begin
  select e.id into emp from public.employee e
  where e.organization_id = p_organization_id and e.user_id = (select auth.uid()) and e.archived_at is null;
  if emp is null or not private.is_member(p_organization_id) then
    raise exception 'not an employee' using errcode = '42501';
  end if;
  return private.stamp_for(p_organization_id, emp, p_client_id, p_action, p_at, p_posting_allocations);
end $$;
revoke execute on function public.stamp(uuid, uuid, text, timestamptz, jsonb) from public, anon;
grant execute on function public.stamp(uuid, uuid, text, timestamptz, jsonb) to authenticated;

-- Stamping for an employee of the organization (API key with time.stamp; service role).
create function public.api_stamp(p_organization_id uuid, p_employee_id uuid, p_client_id uuid,
  p_action text, p_at timestamptz)
returns uuid language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.employee e
                 where e.id = p_employee_id and e.organization_id = p_organization_id and e.archived_at is null) then
    raise exception 'unknown employee' using errcode = 'P0002';
  end if;
  return private.stamp_for(p_organization_id, p_employee_id, p_client_id, p_action, p_at, null);
end $$;
revoke execute on function public.api_stamp(uuid, uuid, uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.api_stamp(uuid, uuid, uuid, text, timestamptz) to service_role;

-- ---------------------------------------------------------------------------
-- Webhooks.

create table public.webhook_endpoint (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organization (id),
  url text not null check (url ~ '^https?://' and length(url) <= 500),
  description text check (description is null or length(description) <= 200),
  events text[] not null check (cardinality(events) > 0 and events <@ array[
    'time_entry.approved', 'pay_period.closed', 'absence.decided', 'schedule.published',
    'employee.created', 'employee.updated', 'ping']),
  secret text not null check (length(secret) >= 32),
  created_by uuid default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  disabled_at timestamptz,
  unique (organization_id, id)
);
alter table public.webhook_endpoint enable row level security;
create policy webhook_endpoint_select on public.webhook_endpoint for select to authenticated
  using (private.has_org_permission(organization_id, 'integrations.manage'));
create policy webhook_endpoint_insert on public.webhook_endpoint for insert to authenticated
  with check (private.has_org_permission(organization_id, 'integrations.manage'));
create policy webhook_endpoint_update on public.webhook_endpoint for update to authenticated
  using (private.has_org_permission(organization_id, 'integrations.manage'))
  with check (private.has_org_permission(organization_id, 'integrations.manage'));

create table public.webhook_delivery (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organization (id),
  endpoint_id uuid not null,
  event text not null,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'delivered', 'failed')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_status integer,
  last_error text,
  created_at timestamptz not null default now(),
  delivered_at timestamptz,
  foreign key (organization_id, endpoint_id) references public.webhook_endpoint (organization_id, id)
);
create index webhook_delivery_due_idx on public.webhook_delivery (next_attempt_at) where status = 'pending';
create index webhook_delivery_endpoint_idx on public.webhook_delivery (endpoint_id, created_at desc);
alter table public.webhook_delivery enable row level security;
create policy webhook_delivery_select on public.webhook_delivery for select to authenticated
  using (private.has_org_permission(organization_id, 'integrations.manage'));

-- Records an event for every active endpoint that subscribes to it.
create function private.emit_event(org uuid, event text, data jsonb) returns void
language sql security definer set search_path = '' as $$
  insert into public.webhook_delivery (organization_id, endpoint_id, event, payload)
  select org, w.id, event,
         jsonb_build_object('id', gen_random_uuid(), 'event', event, 'created_at', now(),
                            'organization_id', org, 'data', data)
  from public.webhook_endpoint w
  where w.organization_id = org and w.disabled_at is null and event = any (w.events);
$$;

-- A test event from the settings page.
create function public.webhook_ping(p_endpoint_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  org uuid;
begin
  select organization_id into org from public.webhook_endpoint where id = p_endpoint_id and disabled_at is null;
  if org is null or not private.has_org_permission(org, 'integrations.manage') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  insert into public.webhook_delivery (organization_id, endpoint_id, event, payload)
  values (org, p_endpoint_id, 'ping', jsonb_build_object('id', gen_random_uuid(), 'event', 'ping',
          'created_at', now(), 'organization_id', org, 'data', '{}'::jsonb));
end $$;
revoke execute on function public.webhook_ping(uuid) from public, anon;
grant execute on function public.webhook_ping(uuid) to authenticated;

create function private.event_time_entry() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'approved' and old.status is distinct from 'approved' then
    perform private.emit_event(new.organization_id, 'time_entry.approved', jsonb_build_object(
      'id', new.id, 'employee_id', new.employee_id,
      'employee_number', (select employee_number from public.employee where id = new.employee_id),
      'department_id', new.department_id, 'start_at', new.start_at, 'end_at', new.end_at,
      'kind', new.kind, 'supersedes_id', new.supersedes_id));
  end if;
  return null;
end $$;
create trigger time_entry_events after update of status on public.time_entry
  for each row execute function private.event_time_entry();

create function private.event_pay_period() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'closed' and old.status is distinct from 'closed' then
    perform private.emit_event(new.organization_id, 'pay_period.closed', jsonb_build_object(
      'id', new.id, 'group_id', new.group_id, 'start_date', new.start_date, 'end_date', new.end_date));
  end if;
  return null;
end $$;
create trigger pay_period_events after update of status on public.pay_period
  for each row execute function private.event_pay_period();

create function private.event_absence() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status in ('approved', 'rejected') and old.status is distinct from new.status then
    perform private.emit_event(new.organization_id, 'absence.decided', jsonb_build_object(
      'id', new.id, 'employee_id', new.employee_id,
      'employee_number', (select employee_number from public.employee where id = new.employee_id),
      'type', new.type_code, 'from_date', new.from_date, 'to_date', new.to_date, 'status', new.status));
  end if;
  return null;
end $$;
create trigger absence_events after update of status on public.absence
  for each row execute function private.event_absence();

create function private.event_publication() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.emit_event(new.organization_id, 'schedule.published', jsonb_build_object(
    'id', new.id, 'department_id', new.department_id, 'from_date', new.from_date,
    'to_date', new.to_date, 'shift_count', new.shift_count));
  return null;
end $$;
create trigger schedule_publication_events after insert on public.schedule_publication
  for each row execute function private.event_publication();

create function private.event_employee() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and (new.employee_number, new.first_name, new.last_name, new.email, new.phone,
       new.birth_date, new.hired_on, new.terminated_on, new.archived_at)
     is not distinct from (old.employee_number, old.first_name, old.last_name, old.email, old.phone,
       old.birth_date, old.hired_on, old.terminated_on, old.archived_at) then
    return null;
  end if;
  perform private.emit_event(new.organization_id,
    case when tg_op = 'INSERT' then 'employee.created' else 'employee.updated' end,
    jsonb_build_object('id', new.id, 'employee_number', new.employee_number,
      'first_name', new.first_name, 'last_name', new.last_name, 'hired_on', new.hired_on,
      'terminated_on', new.terminated_on, 'archived', new.archived_at is not null));
  return null;
end $$;
create trigger employee_events after insert or update on public.employee
  for each row execute function private.event_employee();

-- The sender (service role) claims due deliveries and reports the result.
create function public.webhook_claim(p_limit integer default 20)
returns table (id uuid, url text, secret text, event text, payload jsonb, attempts integer)
language plpgsql security definer set search_path = '' as $$
begin
  return query
  with due as (
    select d.id from public.webhook_delivery d
    where d.status = 'pending' and d.next_attempt_at <= now()
    order by d.next_attempt_at
    limit least(greatest(p_limit, 1), 100)
    for update skip locked
  )
  update public.webhook_delivery d set
    attempts = d.attempts + 1,
    -- A lease: if the sender dies, the delivery is tried again later.
    next_attempt_at = now() + interval '5 minutes'
  from due, public.webhook_endpoint w
  where d.id = due.id and w.id = d.endpoint_id
  returning d.id, w.url, w.secret, d.event, d.payload, d.attempts;
end $$;

create function public.webhook_result(p_id uuid, p_ok boolean, p_status integer, p_error text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  n integer;
begin
  select attempts into n from public.webhook_delivery where id = p_id;
  update public.webhook_delivery set
    status = case when p_ok then 'delivered' when n >= 8 then 'failed' else 'pending' end,
    delivered_at = case when p_ok then now() end,
    last_status = p_status,
    last_error = left(p_error, 500),
    -- Backoff: 1, 2, 4, 8, 16, 32, 64 minutes.
    next_attempt_at = case when p_ok or n >= 8 then next_attempt_at
                           else now() + make_interval(mins => power(2, n - 1)::int) end
  where id = p_id;
end $$;
revoke execute on function public.webhook_claim(integer), public.webhook_result(uuid, boolean, integer, text)
  from public, anon, authenticated;
grant execute on function public.webhook_claim(integer), public.webhook_result(uuid, boolean, integer, text)
  to service_role;

do $$
declare
  t text;
begin
  foreach t in array array['api_key', 'webhook_endpoint'] loop
    execute format('create trigger %I after insert or update or delete on public.%I
      for each row execute function private.audit_row()', t || '_audit', t);
  end loop;
  foreach t in array array['api_key', 'webhook_endpoint', 'webhook_delivery'] loop
    execute format('create trigger %I before update on public.%I
      for each row execute function private.forbid_org_change()', t || '_org_immutable', t);
  end loop;
end $$;
