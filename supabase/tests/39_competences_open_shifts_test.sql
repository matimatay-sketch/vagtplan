-- Competences and taking open shifts.
begin;
select plan(14);

\set org1 20000000-0000-0000-0000-000000000001
\set butik 30000000-0000-0000-0000-000000000001
\set admin 10000000-0000-0000-0000-000000000001
\set lise 10000000-0000-0000-0000-000000000002
\set mads_user 10000000-0000-0000-0000-000000000003
\set ida_user 10000000-0000-0000-0000-000000000004
\set mads 50000000-0000-0000-0000-000000000002
\set ida 50000000-0000-0000-0000-000000000003

-- A competence, an open shift that needs it, and one that needs nothing.
insert into public.competence (id, organization_id, name)
values ('ae000000-0000-0000-0000-000000000001', :'org1', 'Fødevarehygiejne');
select set_config('app.publishing', 'on', true);
insert into public.shift (id, organization_id, department_id, employee_id, start_at, end_at, status, published, published_at, required_competence_ids)
values
  ('af000000-0000-0000-0000-000000000001', :'org1', :'butik', null, now() + interval '3 days', now() + interval '3 days 4 hours',
   'published', jsonb_build_object('employee_id', null, 'start_at', now() + interval '3 days', 'end_at', now() + interval '3 days 4 hours', 'breaks', '[]'::jsonb), now(),
   array['ae000000-0000-0000-0000-000000000001']::uuid[]),
  ('af000000-0000-0000-0000-000000000002', :'org1', :'butik', null, now() + interval '4 days', now() + interval '4 days 4 hours',
   'published', jsonb_build_object('employee_id', null, 'start_at', now() + interval '4 days', 'end_at', now() + interval '4 days 4 hours', 'breaks', '[]'::jsonb), now(),
   '{}');
select set_config('app.publishing', 'off', true);

-- ---------------------------------------------------------------- competences
select tests.login_as(:'mads_user');
select throws_ok(format($$insert into public.competence (organization_id, name) values (%L, 'X')$$, :'org1'),
  '42501', null, 'an employee cannot create competences');
select throws_ok(format($$insert into public.employee_competence (organization_id, employee_id, competence_id)
  values (%L, %L, 'ae000000-0000-0000-0000-000000000001')$$, :'org1', :'mads'),
  '42501', null, 'nor give themselves one');
select tests.logout();

select tests.login_as(:'admin');
select lives_ok(format($$insert into public.employee_competence (organization_id, employee_id, competence_id, valid_from, valid_to)
  values (%L, %L, 'ae000000-0000-0000-0000-000000000001', current_date - 10, current_date + 1)$$, :'org1', :'mads'),
  'an administrator gives an employee a competence that expires tomorrow');
select tests.logout();

select is(private.missing_competences(:'mads', current_date, array['ae000000-0000-0000-0000-000000000001']::uuid[]),
  '{}'::uuid[], 'held today');
select is(private.missing_competences(:'mads', current_date + 3, array['ae000000-0000-0000-0000-000000000001']::uuid[]),
  array['ae000000-0000-0000-0000-000000000001']::uuid[], 'but not on the shift''s date, when it has expired');

-- ---------------------------------------------------------------- taking open shifts
select throws_ok(format($$select public.take_open_shift(%L, 'af000000-0000-0000-0000-000000000001')$$, :'mads_user'),
  'P0001', null, 'a shift needing a competence the employee lacks cannot be taken');

-- Butik needs approval (the default): the first is a request.
select is(public.take_open_shift(:'ida_user', 'af000000-0000-0000-0000-000000000002'), 'requested',
  'with approval the employee asks for the shift');
select is(public.take_open_shift(:'mads_user', 'af000000-0000-0000-0000-000000000002'), 'requested',
  'a colleague may ask too');
select throws_ok(format($$select public.take_open_shift(%L, 'af000000-0000-0000-0000-000000000002')$$, :'ida_user'),
  'P0001', null, 'but not twice');

select throws_ok(format($$select public.decide_open_shift_request(%L, (select id from public.open_shift_request where employee_id = %L), true)$$,
  :'mads_user', :'ida'), '42501', null, 'an employee cannot approve');
select lives_ok(format($$select public.decide_open_shift_request(%L, (select id from public.open_shift_request where employee_id = %L), true)$$,
  :'lise', :'ida'), 'the leader approves Ida');
select is((select employee_id from public.shift where id = 'af000000-0000-0000-0000-000000000002'), :'ida'::uuid,
  'Ida has the shift');
select is((select status::text from public.open_shift_request where employee_id = :'mads'), 'rejected',
  'and Mads'' request is closed');

-- Without approval the shift is taken at once.
update public.department set open_shift_requires_approval = false where id = :'butik';
update public.employee_competence set valid_to = null where employee_id = :'mads';
select is(public.take_open_shift(:'mads_user', 'af000000-0000-0000-0000-000000000001'), 'taken',
  'without approval, and with the competence, the shift is taken at once');

select * from finish();
rollback;
