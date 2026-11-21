-- Messages, shift swaps and afbud.
begin;
select plan(34);

\set org1 20000000-0000-0000-0000-000000000001
\set admin 10000000-0000-0000-0000-000000000001
\set lise 10000000-0000-0000-0000-000000000002
\set mads_u 10000000-0000-0000-0000-000000000003
\set ida_u 10000000-0000-0000-0000-000000000004
\set butik 30000000-0000-0000-0000-000000000001
\set mads 50000000-0000-0000-0000-000000000002
\set ida 50000000-0000-0000-0000-000000000003
\set s1 72000000-0000-0000-0000-000000000001
\set s2 72000000-0000-0000-0000-000000000002
\set s3 72000000-0000-0000-0000-000000000003

-- Who may write to whom -----------------------------------------------------
select tests.login_as(:'mads_u');
select ok((select bool_and(user_id in (:'lise', :'ida_u')) and count(*) = 2
           from public.message_recipients(:'org1')),
  'an employee may write to the leader and colleagues in own departments');
select is((select is_leader from public.message_recipients(:'org1') where user_id = :'lise'), true,
  'the leader is marked as leader');
select lives_ok(format($$select public.start_conversation(%L, array[%L]::uuid[], null, 'Hej Ida')$$, :'org1', :'ida_u'),
  'an employee writes to a colleague');
select throws_ok(format($$select public.start_conversation(%L, array[%L]::uuid[], null, 'Hej Anne')$$, :'org1', :'admin'),
  '42501', null, 'but not to someone outside the departments');
create temp table conv on commit drop as
  select public.start_conversation(:'org1', array[:'lise']::uuid[], null, 'Jeg er syg i morgen') as id;
select is((select public.start_conversation(:'org1', array[:'lise']::uuid[], null, 'Og i overmorgen')),
  (select id from conv), 'a second message to the same person continues the conversation');
select throws_ok($$insert into public.message (organization_id, conversation_id, kind, body)
                   select '20000000-0000-0000-0000-000000000001', id, 'swap', 'x' from conv$$,
  '42501', null, 'swap messages cannot be written directly');
select tests.logout();

grant select on conv to authenticated;
select tests.login_as(:'ida_u');
select is((select count(*)::integer from public.message where conversation_id = (select id from conv)), 0,
  'others cannot read the conversation');
select throws_ok($$insert into public.message (organization_id, conversation_id, body)
                   select '20000000-0000-0000-0000-000000000001', id, 'Hej' from conv$$,
  '42501', null, 'nor write in it');
select tests.logout();

-- Unread and e-mail -----------------------------------------------------------
update public.department set message_email = true where id = :'butik';
select tests.login_as(:'lise');
select is((select public.unread_message_count(:'org1')), 2, 'the leader has two unread messages');
insert into public.message (organization_id, conversation_id, body) select :'org1', id, 'God bedring' from conv;
insert into public.message (organization_id, conversation_id, body) select :'org1', id, 'Jeg finder en afløser' from conv;
select tests.logout();
select is((select count(*)::integer from public.email_outbox where user_id = :'mads_u'), 1,
  'one e-mail until the recipient has read the conversation');
select ok((select not (payload::text ilike '%afløser%') from public.email_outbox where user_id = :'mads_u'),
  'the e-mail does not contain the message');

select tests.login_as(:'mads_u');
select is((select unread from public.my_conversations(:'org1') where id = (select id from conv)), 2,
  'the conversation shows two unread messages');
update public.conversation_participant set last_read_at = clock_timestamp()
where conversation_id = (select id from conv) and user_id = :'mads_u';
select is((select public.unread_message_count(:'org1')), 0, 'reading clears the count');
update public.message set body = 'Jeg er syg i morgen (feber)'
where conversation_id = (select id from conv) and body = 'Jeg er syg i morgen';
select isnt((select edited_at from public.message where body = 'Jeg er syg i morgen (feber)'), null,
  'a sender corrects their own message');
update public.message set body = 'hacked' where body = 'God bedring';
select is((select count(*)::integer from public.message where body = 'hacked'), 0,
  'but not someone else''s');
select tests.logout();

-- Without messages.send: only the leaders --------------------------------------
delete from public.permission_grant g using public.membership m
where m.user_id = :'ida_u' and m.organization_id = :'org1' and g.profile_id = m.profile_id
  and g.permission = 'messages.send';
select tests.login_as(:'ida_u');
select is((select array_agg(user_id) from public.message_recipients(:'org1')), array[:'lise'::uuid],
  '"Kun til ledere": only the leader can be chosen');
select throws_ok(format($$select public.start_conversation(%L, array[%L]::uuid[], null, 'Hej')$$, :'org1', :'mads_u'),
  '42501', null, 'a colleague cannot be written to');
select tests.logout();

-- Shift swap ------------------------------------------------------------------
set local app.publishing = 'on';
insert into public.shift (id, organization_id, department_id, employee_id, start_at, end_at, status, published, published_at)
select x.id, :'org1', :'butik', x.emp, x.st, x.st + interval '6 hours', 'published',
       jsonb_build_object('employee_id', x.emp, 'start_at', x.st, 'end_at', x.st + interval '6 hours',
                          'breaks', '[]'::jsonb, 'kind', 'work'), now()
from (values (:'s1'::uuid, :'mads'::uuid, date_trunc('day', now()) + interval '3 days 8 hours'),
             (:'s2'::uuid, :'ida'::uuid, date_trunc('day', now()) + interval '4 days 8 hours'),
             (:'s3'::uuid, :'mads'::uuid, date_trunc('day', now()) + interval '5 days 8 hours')) x(id, emp, st);
reset app.publishing;

select tests.login_as(:'mads_u');
select ok((select bool_or(employee_id = :'ida') and not bool_or(employee_id = :'mads')
           from public.swap_candidates(:'s1')),
  'colleagues in the department can take the shift');
select throws_ok(format($$select public.propose_shift_swap(%L, %L, null, null)$$, :'s2', :'ida'),
  'P0001', null, 'only one''s own shift can be offered');
create temp table sw on commit drop as select public.propose_shift_swap(:'s1', :'ida', :'s2', 'Kan vi bytte?') as id;
select is((select status::text from public.shift_swap where id = (select id from sw)), 'proposed', 'a swap is proposed');
select throws_ok(format($$select public.propose_shift_swap(%L, %L, null, null)$$, :'s1', :'ida'),
  'P0001', null, 'a shift can only be offered once at a time');
select tests.logout();

grant select on sw to authenticated, service_role;
select tests.login_as(:'ida_u');
select is((select count(*)::integer from public.waiting_items(:'org1') where kind = 'swap'), 1,
  'the colleague sees the proposal waiting');
select tests.logout();
set local role service_role;
select throws_ok(format($$select public.accept_shift_swap(%L, (select id from sw))$$, :'mads_u'),
  '42501', null, 'the requester cannot accept their own proposal');
select is((select public.accept_shift_swap(:'ida_u', (select id from sw)))::text, 'accepted',
  'the colleague accepts; the leader must approve');
select throws_ok(format($$select public.approve_shift_swap(%L, (select id from sw), null)$$, :'ida_u'),
  '42501', null, 'the colleague cannot approve');
reset role;
select tests.login_as(:'lise');
select is((select can_decide from public.swap_details(array[(select id from sw)])), true,
  'the leader sees the accepted swap and may decide');
select is((select count(*)::integer from public.waiting_items(:'org1') where kind = 'swap'), 1,
  'and it waits for the leader');
select tests.logout();
set local role service_role;
select lives_ok(format($$select public.approve_shift_swap(%L, (select id from sw), 'OK')$$, :'lise'),
  'the leader approves');
reset role;
select tests.logout();
select is((select string_agg(employee_id::text || '/' || (published ->> 'employee_id') || '/' || status, ',' order by start_at)
           from public.shift where id in (:'s1', :'s2')),
  :'ida' || '/' || :'ida' || '/published,' || :'mads' || '/' || :'mads' || '/published',
  'the shifts are exchanged and stay published');

-- A leader's change cancels an open swap.
select tests.login_as(:'mads_u');
select public.propose_shift_swap(:'s3', :'ida', null, null);
select tests.logout();
select tests.login_as(:'lise');
update public.shift set start_at = start_at + interval '1 hour', end_at = end_at + interval '1 hour' where id = :'s3';
select tests.logout();
select is((select status::text from public.shift_swap where shift_id = :'s3'), 'cancelled',
  'changing the shift cancels the open swap');

-- Afbud -----------------------------------------------------------------------
select tests.login_as(:'ida_u');
create temp table ca on commit drop as select public.report_shift_cancellation(:'s1', 'Syg barn') as id;
select throws_ok(format($$select public.report_shift_cancellation(%L, 'Igen')$$, :'s1'),
  'P0001', null, 'an afbud is reported once');
select tests.logout();
grant select on ca to authenticated;
select tests.login_as(:'lise');
select is((select count(*)::integer from public.message m join public.shift_cancellation c on c.conversation_id = m.conversation_id
           where c.id = (select id from ca) and m.kind = 'cancellation'), 1,
  'the leader receives the afbud');
select throws_ok(format($$select public.close_shift_cancellation(%L, 'withdraw')$$, (select id from ca)),
  '42501', null, 'only the employee withdraws it');
update public.shift set employee_id = :'mads' where id = :'s1';
select is((select status::text from public.shift_cancellation where id = (select id from ca)), 'resolved',
  'giving the shift to someone else handles the afbud');
select tests.logout();

select * from finish();
rollback;
