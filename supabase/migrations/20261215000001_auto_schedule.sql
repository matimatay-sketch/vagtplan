-- Built-in schedule proposals (no AI): the app spreads shift templates over the
-- week by the employees' norms, and saves the result as draft shifts on a
-- proposal, as the AI assistant does. Such a proposal does not need the
-- assistant to be turned on; it needs schedule.manage in the department.
alter table public.assistant_proposal
  add column source text not null default 'assistant' check (source in ('assistant', 'auto'));

drop policy assistant_proposal_insert on public.assistant_proposal;
create policy assistant_proposal_insert on public.assistant_proposal for insert to authenticated
  with check (private.can_on_department('schedule.manage', department_id)
              and (source = 'auto' or private.assistant_on(organization_id))
              and created_by = (select auth.uid()));
