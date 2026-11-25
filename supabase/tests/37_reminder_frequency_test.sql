-- When automatic reminders are due: weekly, monthly, quarterly and yearly.
begin;
select plan(10);

select is(private.reminder_due('weekly', '{1,3}', 1, 1, '2026-11-23'), true, 'weekly on a chosen weekday');
select is(private.reminder_due('weekly', '{1,3}', 1, 1, '2026-11-24'), false, 'not on other weekdays');
select is(private.reminder_due('monthly', '{}', 15, 1, '2026-11-15'), true, 'monthly on the day');
select is(private.reminder_due('monthly', '{}', 31, 1, '2026-11-30'), true, 'the last day of a shorter month');
select is(private.reminder_due('monthly', '{}', 31, 1, '2026-12-30'), false, 'but not the day before the 31st');
select is(private.reminder_due('monthly', '{}', 30, 1, '2028-02-29'), true, 'leap year');
select is(private.reminder_due('quarterly', '{}', 5, 1, '2027-04-05'), true, 'quarterly in the first month of the quarter');
select is(private.reminder_due('quarterly', '{}', 5, 1, '2027-05-05'), false, 'not in the second month');
select is(private.reminder_due('yearly', '{}', 29, 2, '2027-02-28'), true, 'yearly on 29 February moves to the 28th');
select throws_ok($$insert into public.reminder_rule (organization_id, name, kind, frequency, month)
  values ('20000000-0000-0000-0000-000000000001', 'Kvartal', 'time_approval', 'quarterly', 4)$$, '23514', null,
  'a quarterly rule has a month 1–3 of the quarter');

select * from finish();
rollback;
