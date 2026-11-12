-- Local development seed. All people and companies are fictitious.
-- Passwords for all demo users: Demo1234!

-- ---------------------------------------------------------------------------
-- System agreement templates (organization_id null) with fixed ids for the demo
-- contracts. Their documents come from packages/agreements (seeds/agreements.sql).
-- ---------------------------------------------------------------------------
insert into public.agreement (id, organization_id, key, name, kind, is_example, description) values
  ('a0000000-0000-0000-0000-000000000001', null, 'basis-dk', 'Basis DK (lovens minimum)', 'base', false,
   'Lovens minimumsregler. Danner grundlag for alle overenskomster.'),
  ('a0000000-0000-0000-0000-000000000002', null, 'eksempel-detail', 'EKSEMPEL – Detail (fiktiv)', 'agreement', true,
   'FIKTIV eksempel-overenskomst. Satser og regler er pladsholdere og må ikke bruges til løn.');

-- Versions with the full documents are loaded from seeds/agreements.sql (generated).


-- ---------------------------------------------------------------------------
-- Demo users
-- ---------------------------------------------------------------------------
do $$
declare
  u record;
begin
  for u in
    select * from (values
      ('10000000-0000-0000-0000-000000000001'::uuid, 'admin@demo.dk'),
      ('10000000-0000-0000-0000-000000000002'::uuid, 'leder@demo.dk'),
      ('10000000-0000-0000-0000-000000000003'::uuid, 'medarbejder@demo.dk'),
      ('10000000-0000-0000-0000-000000000004'::uuid, 'ung@demo.dk')
    ) as t(id, email)
  loop
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token
    ) values (
      '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email,
      extensions.crypt('Demo1234!', extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''
    );
    insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (
      gen_random_uuid(), u.id, u.id::text,
      jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
      'email', now(), now(), now()
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Demo organization
-- ---------------------------------------------------------------------------
insert into public.organization (id, name) values
  ('20000000-0000-0000-0000-000000000001', 'Demo Købmand ApS');

-- Default permission profiles: Administrator (owner), Leder, Medarbejder.
do $$
declare
  p record;
  org uuid := '20000000-0000-0000-0000-000000000001';
begin
  select * into p from private.create_default_profiles(org);
  insert into public.membership (organization_id, user_id, profile_id) values
    (org, '10000000-0000-0000-0000-000000000001', p.owner_id),
    (org, '10000000-0000-0000-0000-000000000002', p.manager_id),
    (org, '10000000-0000-0000-0000-000000000003', p.employee_id),
    (org, '10000000-0000-0000-0000-000000000004', p.employee_id);
end $$;

insert into public.department (id, organization_id, name) values
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'Butik'),
  ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', 'Café');

insert into public.department_manager (organization_id, department_id, user_id) values
  ('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002');

insert into public.pay_period_group (id, organization_id, name, frequency, anchor_date, month_start_day) values
  ('40000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'Månedslønnede', 'monthly', null, 1),
  ('40000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', 'Timelønnede (14 dage)', 'biweekly', '2026-01-05', null);

insert into public.employee (id, organization_id, employee_number, first_name, last_name, email, birth_date, school_obligated, hired_on, user_id) values
  ('50000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '1001', 'Lise',  'Leder',       'leder@demo.dk',       '1985-03-14', false, '2020-02-01', '10000000-0000-0000-0000-000000000002'),
  ('50000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', '1002', 'Mads',  'Medarbejder', 'medarbejder@demo.dk', '1998-09-02', false, '2023-08-15', '10000000-0000-0000-0000-000000000003'),
  ('50000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001', '1003', 'Ida',   'Ung',         'ung@demo.dk',         '2010-05-20', false, '2026-06-01', '10000000-0000-0000-0000-000000000004'),
  ('50000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000001', '2001', 'Carl',  'Café',        null,                  '1990-12-24', false, '2024-04-01', null);

insert into public.employee_department (organization_id, employee_id, department_id, is_primary) values
  ('20000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', true),
  ('20000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001', true),
  ('20000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000001', true),
  ('20000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000002', false),
  ('20000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000004', '30000000-0000-0000-0000-000000000002', true);

insert into public.contract (organization_id, employee_id, agreement_id, pay_form, weekly_norm_minutes, pay_period_group_id, staff_group, valid_from) values
  ('20000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 'monthly', 2220, '40000000-0000-0000-0000-000000000001', 'Funktionær', '2020-02-01'),
  ('20000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000002', 'hourly', 1500, '40000000-0000-0000-0000-000000000002', 'Ekspedient', '2023-08-15'),
  ('20000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000002', 'hourly',  480, '40000000-0000-0000-0000-000000000002', 'Ung under 18', '2026-06-01'),
  ('20000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000002', 'hourly', 1200, '40000000-0000-0000-0000-000000000002', 'Ekspedient', '2024-04-01');
