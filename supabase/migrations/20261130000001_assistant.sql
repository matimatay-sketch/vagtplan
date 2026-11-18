-- AI assistant (pay explanations and schedule proposals).
--
-- Off by default per organization (organization_settings.assistant_enabled,
-- settings.manage). Using it needs assistant.use; proposals also need
-- schedule.manage in the department, explanations need payroll.view.
-- Only pseudonymized data leaves Turnus (see apps/web/src/lib/assistant). The
-- log keeps who used it and the token usage, never the content.

insert into public.permission (key, allowed_scopes, sort_order) values
  ('assistant.use', '{departments,organization}', 300);
insert into public.permission_grant (organization_id, profile_id, permission, scope)
select p.organization_id, p.id, 'assistant.use', 'organization'
from public.permission_profile p where p.is_owner
on conflict do nothing;

alter table public.organization_settings add column assistant_enabled boolean not null default false;

create function private.assistant_on(org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select assistant_enabled from public.organization_settings where organization_id = org), false)
     and private.permission_scope(org, 'assistant.use') is not null;
$$;

create table public.assistant_request (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organization (id),
  user_id uuid not null default auth.uid() references auth.users (id),
  kind text not null check (kind in ('pay_explanation', 'schedule_proposal')),
  department_id uuid,
  model text not null check (length(model) <= 80),
  outcome text not null check (outcome in ('ok', 'refused', 'error')),
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  created_at timestamptz not null default now(),
  foreign key (organization_id, department_id) references public.department (organization_id, id)
);
create index assistant_request_org_idx on public.assistant_request (organization_id, created_at);
alter table public.assistant_request enable row level security;
create policy assistant_request_select on public.assistant_request for select to authenticated
  using (user_id = (select auth.uid()) or private.has_org_permission(organization_id, 'settings.manage'));
create policy assistant_request_insert on public.assistant_request for insert to authenticated
  with check (user_id = (select auth.uid()) and private.assistant_on(organization_id));

-- A proposal groups the draft shifts it created, so they can be discarded together.
create table public.assistant_proposal (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organization (id),
  department_id uuid not null,
  week_start date not null,
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  note text check (note is null or length(note) <= 2000),
  discarded_at timestamptz,
  unique (organization_id, id),
  foreign key (organization_id, department_id) references public.department (organization_id, id)
);
alter table public.assistant_proposal enable row level security;
create policy assistant_proposal_select on public.assistant_proposal for select to authenticated
  using (private.can_on_department('schedule.view', department_id)
         or private.can_on_department('schedule.manage', department_id));
create policy assistant_proposal_insert on public.assistant_proposal for insert to authenticated
  with check (private.can_on_department('schedule.manage', department_id)
              and private.assistant_on(organization_id)
              and created_by = (select auth.uid()));
create policy assistant_proposal_update on public.assistant_proposal for update to authenticated
  using (private.can_on_department('schedule.manage', department_id))
  with check (private.can_on_department('schedule.manage', department_id));

alter table public.shift add column proposal_id uuid;
alter table public.shift add constraint shift_proposal_fk
  foreign key (organization_id, proposal_id) references public.assistant_proposal (organization_id, id);
create index shift_proposal_idx on public.shift (proposal_id) where proposal_id is not null;

do $$
declare
  t text;
begin
  foreach t in array array['assistant_request', 'assistant_proposal'] loop
    execute format('create trigger %I after insert or update or delete on public.%I
      for each row execute function private.audit_row()', t || '_audit', t);
    execute format('create trigger %I before update on public.%I
      for each row execute function private.forbid_org_change()', t || '_org_immutable', t);
  end loop;
end $$;
