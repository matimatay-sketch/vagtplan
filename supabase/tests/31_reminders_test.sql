-- Reminders: rules per kind and audience, sent as messages (+ e-mail).
begin;
select plan(16);

\set org1 20000000-0000-0000-0000-000000000001
\set butik 30000000-0000-0000-0000-000000000001
\set admin 10000000-0000-0000-0000-000000000001
\set lise 10000000-0000-0000-0000-000000000002
\set mads_user 10000000-0000-0000-0000-000000000003
\set mads 50000000-0000-0000-0000-000000000002
\set ida 50000000-0000-0000-0000-000000000003

create temp table t_rules (kind text, id uuid) on commit drop;
grant all on t_rules to authenticated;

-- Mads had a published shift yesterday without a registration; Ida has a
-- registration waiting for approval.
select set_config('app.publishing', 'on', true);
insert into public.shift (organization_id, department_id, employee_id, start_at, end_at, status, published)
values (:'org1', :'butik', :'mads', now() - interval '30 hours', now() - interval '22 hours', 'published',
        jsonb_build_object('start_at', now() - interval '30 hours', 'end_at', now() - interval '22 hours'));
select set_config('app.publishing', 'off', true);
insert into public.time_entry (organization_id, employee_id, department_id, start_at, end_at, status, source)
values (:'org1', :'ida', :'butik', now() - interval '28 hours', now() - interval '22 hours', 'pending', 'manual');

-- ---------------------------------------------------------------- rights
select tests.login_as(:'mads_user');
select throws_ok(format($$insert into public.reminder_rule (organization_id, name, kind) values (%L, 'x', 'open_stamp')$$, :'org1'),
  '42501', null, 'an employee cannot set up reminders');
select tests.logout();

select tests.login_as(:'lise');
select throws_ok(format($$insert into public.reminder_rule (organization_id, name, kind) values (%L, 'Alle', 'open_stamp')$$, :'org1'),
  '42501', null, 'a manager cannot make a rule for the whole organization');
with x as (insert into public.reminder_rule (organization_id, name, kind, department_ids, note)
    values (:'org1', 'Husk at registrere', 'missing_registration', array[:'butik']::uuid[], 'Husk det') returning id)
insert into t_rules select 'missing', id from x;
with x as (insert into public.reminder_rule (organization_id, name, kind, department_ids)
    values (:'org1', 'Godkend tid', 'time_approval', array[:'butik']::uuid[]) returning id)
insert into t_rules select 'approval', id from x;
select is((select count(*)::int from public.reminder_rule), 2, 'the manager sets up rules for their department');

-- Preview: who gets what.
select is((select array_agg(name order by name) from public.send_reminders((select id from t_rules where kind = 'missing'), false)),
  array['Mads Medarbejder'], 'missing registration: the employee is reminded');
select is((select items from public.send_reminders((select id from t_rules where kind = 'missing'), false)),
  1, 'of one shift');
select ok('Lise Leder' = any (select name from public.send_reminders((select id from t_rules where kind = 'approval'), false)),
  'time approval: the department manager is reminded');
select is((select count(*)::int from public.message where kind = 'reminder'), 0, 'a preview sends nothing');

-- Send.
select lives_ok($$select * from public.send_reminders((select id from t_rules where kind = 'missing'), true)$$,
  'the manager sends now');
select is((select last_sent_count from public.reminder_rule where id = (select id from t_rules where kind = 'missing')),
  1, 'the rule remembers what was sent');
select tests.logout();

select tests.login_as(:'mads_user');
select is((select count(*)::int from public.message m join public.conversation c on c.id = m.conversation_id
           where m.kind = 'reminder' and c.reminder_rule_id = (select id from t_rules where kind = 'missing')),
  1, 'the employee gets the reminder as a message');
select is((select (body::jsonb) ->> 'kind' from public.message where kind = 'reminder' limit 1),
  'missing_registration', 'with what it is about');
select tests.logout();
select is((select count(*)::int from public.email_outbox where user_id = :'mads_user' and payload ->> 'message_kind' = 'reminder'),
  1, 'and an e-mail');

-- Sending again uses the same conversation.
select tests.login_as(:'lise');
select lives_ok($$select * from public.send_reminders((select id from t_rules where kind = 'missing'), true)$$, 'sent again');
select tests.logout();
select is((select count(distinct conversation_id)::int from public.message where kind = 'reminder'), 1,
  'one conversation per rule and recipient');

-- Automatic: due on the rule's weekdays, once a day (service role).
update public.reminder_rule set auto = true, weekdays = '{1,2,3,4,5,6,7}', last_sent_at = null
where id = (select id from t_rules where kind = 'approval');
select is(public.run_due_reminders() >= 1, true, 'automatic reminders are sent when due');
select is(public.run_due_reminders(), 0, 'and only once a day');

select * from finish();
rollback;
