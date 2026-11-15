-- Test weeks ("golden weeks") the consultant saves per agreement: a test
-- case (employee facts, shifts, absence) and the expected pay lines and
-- violations, calculated by hand from the agreement text. Run on the
-- agreement page against the published version and the draft.

create table public.agreement_test_case (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organization (id),
  agreement_id uuid not null references public.agreement (id),
  name text not null check (length(trim(name)) between 1 and 120),
  description text check (description is null or length(description) <= 1000),
  -- The TestCase document (see apps/web/src/lib/domain/test-weeks.ts).
  test jsonb not null check (jsonb_typeof(test) = 'object'),
  created_by uuid references auth.users (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (organization_id, id)
);
create index agreement_test_case_agreement_idx on public.agreement_test_case (agreement_id) where archived_at is null;

-- The agreement must be a system template or belong to the same organization.
create function private.check_test_case_agreement() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.agreement a
                 where a.id = new.agreement_id and (a.organization_id is null or a.organization_id = new.organization_id)) then
    raise exception 'agreement not available' using errcode = '23503';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger agreement_test_case_check before insert or update on public.agreement_test_case
  for each row execute function private.check_test_case_agreement();

alter table public.agreement_test_case enable row level security;
create policy agreement_test_case_select on public.agreement_test_case for select to authenticated
  using (private.has_org_permission(organization_id, 'agreements.manage'));
create policy agreement_test_case_insert on public.agreement_test_case for insert to authenticated
  with check (private.has_org_permission(organization_id, 'agreements.manage'));
create policy agreement_test_case_update on public.agreement_test_case for update to authenticated
  using (private.has_org_permission(organization_id, 'agreements.manage'))
  with check (private.has_org_permission(organization_id, 'agreements.manage'));

create trigger agreement_test_case_audit after insert or update or delete on public.agreement_test_case
  for each row execute function private.audit_row();
create trigger agreement_test_case_org_immutable before update on public.agreement_test_case
  for each row execute function private.forbid_org_change();
