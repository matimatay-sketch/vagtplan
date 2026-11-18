-- Testmedarbejdere til et testmiljø i skyen.
--
-- Kør i Supabase → SQL Editor. Sæt din e-mail i linjen `v_email` nedenfor.
-- Scriptet bruger den virksomhed, du senest er blevet tilknyttet, og opretter:
--   * afdelingerne Butik, Lager og Café (hvis de ikke findes),
--   * lønperiode-grupperne "Timelønnede (14 dage)" og "Månedslønnede" (hvis de ikke findes),
--   * 24 fiktive medarbejdere med kontrakt på "EKSEMPEL – Detail (fiktiv)".
-- Satserne i eksempeloverenskomsten er opdigtede og må aldrig bruges til løn.
-- Medarbejderne har ingen login. De kan inviteres fra medarbejdersiden.
-- Scriptet kan køres flere gange: eksisterende medarbejdernumre springes over.

do $$
declare
  v_email text := 'din@email.dk';
  v_org uuid;
  v_agreement uuid;
  v_hourly uuid;
  v_monthly uuid;
  v_dept uuid;
  v_emp uuid;
  r record;
  n integer := 0;
begin
  select m.organization_id into v_org
  from public.membership m join auth.users u on u.id = m.user_id
  where lower(u.email) = lower(v_email)
  order by m.created_at desc limit 1;
  if v_org is null then
    raise exception 'Fandt ingen virksomhed for %. Er e-mailen rigtig, og er du tilknyttet en virksomhed?', v_email;
  end if;

  select id into v_agreement from public.agreement
  where organization_id is null and key = 'eksempel-detail';
  if v_agreement is null then
    raise exception 'Overenskomstskabelonerne mangler. Kør "Deploy database" i GitHub Actions først.';
  end if;

  select id into v_hourly from public.pay_period_group
  where organization_id = v_org and frequency = 'biweekly' and archived_at is null limit 1;
  if v_hourly is null then
    insert into public.pay_period_group (organization_id, name, frequency, anchor_date)
    values (v_org, 'Timelønnede (14 dage)', 'biweekly', '2026-01-05') returning id into v_hourly;
  end if;
  select id into v_monthly from public.pay_period_group
  where organization_id = v_org and frequency = 'monthly' and archived_at is null limit 1;
  if v_monthly is null then
    insert into public.pay_period_group (organization_id, name, frequency, month_start_day)
    values (v_org, 'Månedslønnede', 'monthly', 1) returning id into v_monthly;
  end if;

  insert into public.department (organization_id, name)
  select v_org, d from unnest(array['Butik', 'Lager', 'Café']) d
  where not exists (select 1 from public.department x
                    where x.organization_id = v_org and lower(x.name) = lower(d) and x.archived_at is null);

  for r in
    select * from (values
      -- nr, fornavn, efternavn, fødselsdato, afdeling, løn, timer/uge, gruppe, ansat
      ('3001', 'Maja',     'Jensen',      date '1987-04-12', 'Butik', 'monthly', 37, 'Funktionær',       date '2019-03-01'),
      ('3002', 'Frederik', 'Nielsen',     date '1992-11-03', 'Butik', 'hourly',  37, 'Ekspedient',       date '2021-08-01'),
      ('3003', 'Sofie',    'Hansen',      date '1995-06-21', 'Butik', 'hourly',  30, 'Ekspedient',       date '2022-02-15'),
      ('3004', 'Mikkel',   'Pedersen',    date '2000-01-30', 'Butik', 'hourly',  25, 'Ekspedient',       date '2023-05-01'),
      ('3005', 'Emma',     'Andersen',    date '2003-09-09', 'Butik', 'hourly',  15, 'Ekspedient',       date '2024-06-01'),
      ('3006', 'Lucas',    'Christensen', date '1979-02-14', 'Butik', 'hourly',  37, 'Ekspedient',       date '2016-10-01'),
      ('3007', 'Ida',      'Larsen',      date '2001-12-01', 'Butik', 'hourly',  20, 'Ekspedient',       date '2024-01-15'),
      ('3008', 'Oliver',   'Sørensen',    date '1998-07-17', 'Butik', 'hourly',  32, 'Ekspedient',       date '2022-09-01'),
      ('3009', 'Clara',    'Rasmussen',   date '2009-03-05', 'Butik', 'hourly',  10, 'Ung under 18',     date '2025-08-01'),
      ('3010', 'Noah',     'Jørgensen',   date '2010-10-22', 'Butik', 'hourly',   8, 'Ung under 18',     date '2026-06-01'),
      ('3011', 'Anna',     'Petersen',    date '1984-05-08', 'Lager', 'monthly', 37, 'Funktionær',       date '2018-01-01'),
      ('3012', 'William',  'Madsen',      date '1990-08-25', 'Lager', 'hourly',  37, 'Lagermedarbejder', date '2020-04-01'),
      ('3013', 'Laura',    'Kristensen',  date '1996-02-02', 'Lager', 'hourly',  37, 'Lagermedarbejder', date '2021-11-01'),
      ('3014', 'Elias',    'Olsen',       date '1993-12-12', 'Lager', 'hourly',  30, 'Lagermedarbejder', date '2023-03-01'),
      ('3015', 'Freja',    'Thomsen',     date '1999-04-30', 'Lager', 'hourly',  25, 'Lagermedarbejder', date '2024-09-01'),
      ('3016', 'Victor',   'Christiansen',date '1988-09-18', 'Lager', 'hourly',  37, 'Lagermedarbejder', date '2019-06-15'),
      ('3017', 'Ella',     'Poulsen',     date '1991-01-11', 'Café',  'monthly', 37, 'Funktionær',       date '2020-08-01'),
      ('3018', 'Magnus',   'Johansen',    date '1997-03-27', 'Café',  'hourly',  30, 'Café',             date '2022-05-01'),
      ('3019', 'Alma',     'Møller',      date '2002-07-07', 'Café',  'hourly',  20, 'Café',             date '2023-08-15'),
      ('3020', 'Carl',     'Mortensen',   date '1994-10-10', 'Café',  'hourly',  25, 'Café',             date '2021-03-01'),
      ('3021', 'Agnes',    'Knudsen',     date '2004-05-19', 'Café',  'hourly',  15, 'Café',             date '2025-02-01'),
      ('3022', 'Oscar',    'Jakobsen',    date '1986-11-28', 'Café',  'hourly',  37, 'Café',             date '2017-09-01'),
      ('3023', 'Karla',    'Jacobsen',    date '2000-06-06', 'Butik', 'hourly',  12, 'Ekspedient',       date '2025-10-01'),
      ('3024', 'Alfred',   'Mikkelsen',   date '1982-03-03', 'Lager', 'hourly',  37, 'Lagermedarbejder', date '2015-04-01')
    ) as t(nr, first_name, last_name, birth_date, dept, pay_form, hours, staff_group, hired_on)
  loop
    continue when exists (select 1 from public.employee
                          where organization_id = v_org and employee_number = r.nr);
    select id into v_dept from public.department
    where organization_id = v_org and lower(name) = lower(r.dept) and archived_at is null;
    insert into public.employee (organization_id, employee_number, first_name, last_name, birth_date, hired_on)
    values (v_org, r.nr, r.first_name, r.last_name, r.birth_date, r.hired_on)
    returning id into v_emp;
    insert into public.employee_department (organization_id, employee_id, department_id, is_primary)
    values (v_org, v_emp, v_dept, true);
    insert into public.contract (organization_id, employee_id, agreement_id, pay_form, weekly_norm_minutes,
                                 pay_period_group_id, staff_group, valid_from)
    values (v_org, v_emp, v_agreement, r.pay_form::public.pay_form, r.hours * 60,
            case when r.pay_form = 'monthly' then v_monthly else v_hourly end, r.staff_group, r.hired_on);
    n := n + 1;
  end loop;
  raise notice 'Oprettet % testmedarbejdere.', n;
end $$;
