-- Mileage and expenses: setup rights, own items, locking, decisions, receipts.
begin;
select plan(17);

\set org1 20000000-0000-0000-0000-000000000001
\set admin 10000000-0000-0000-0000-000000000001
\set manager 10000000-0000-0000-0000-000000000002
\set emp 10000000-0000-0000-0000-000000000003
\set young 10000000-0000-0000-0000-000000000004
\set butik 30000000-0000-0000-0000-000000000001
\set mads 50000000-0000-0000-0000-000000000002
\set ida 50000000-0000-0000-0000-000000000003
\set cat 73000000-0000-0000-0000-000000000001
\set trip 74000000-0000-0000-0000-000000000001
\set exp 75000000-0000-0000-0000-000000000001

-- The owner (expenses.manage) enters the year's rates and a category.
select tests.login_as(:'admin');
select lives_ok(
  format($$insert into public.mileage_rate (organization_id, year, high_rate_ore, low_rate_ore, high_limit_km, pay_code_high, pay_code_low, source)
    values (%L, 2027, 100, 50, 1000, 'KM_HOEJ', 'KM_LAV', 'Test')$$, :'org1'),
  'the owner can enter the km rates of a year');
select lives_ok(
  format($$insert into public.expense_category (id, organization_id, name, pay_code) values (%L, %L, 'Parkering', 'UDLAEG_P')$$, :'cat', :'org1'),
  'the owner can create an expense category');
select tests.logout();

select tests.login_as(:'manager');
select throws_ok(
  format($$insert into public.mileage_rate (organization_id, year, high_rate_ore, low_rate_ore, high_limit_km, pay_code_high, pay_code_low, source)
    values (%L, 2028, 1, 1, 1, 'A', 'B', 'x')$$, :'org1'),
  '42501', null, 'without expenses.manage the rates cannot be entered');
select tests.logout();

-- Mads registers his own trip and expense.
select tests.login_as(:'emp');
select lives_ok(
  format($$insert into public.mileage_trip (id, organization_id, employee_id, department_id, trip_date, purpose, from_address, to_address, stops, meters)
    values (%L, %L, %L, %L, '2027-03-02', 'Kundebesøg', 'Butikken', 'Kunden', '["Lageret"]', 42500)$$, :'trip', :'org1', :'mads', :'butik'),
  'an employee registers a trip');
select throws_ok(
  format($$insert into public.mileage_trip (organization_id, employee_id, department_id, trip_date, purpose, from_address, to_address, meters)
    values (%L, %L, %L, '2027-03-02', 'Kundebesøg', 'A', 'B', 1000)$$, :'org1', :'ida', :'butik'),
  '42501', null, 'an employee cannot register a trip for a colleague');
select throws_ok(
  format($$insert into public.mileage_trip (organization_id, employee_id, department_id, trip_date, purpose, from_address, to_address, meters, status)
    values (%L, %L, %L, '2027-03-02', 'Kundebesøg', 'A', 'B', 1000, 'approved')$$, :'org1', :'mads', :'butik'),
  '42501', null, 'a trip cannot be created as approved');
select throws_ok(
  format($$insert into public.expense (organization_id, employee_id, department_id, expense_date, category_id, description, amount_ore)
    values (%L, %L, %L, '2027-03-02', %L, 'P-billet', 4500)$$, :'org1', :'mads', :'butik', :'cat'),
  '23514', null, 'the category needs a receipt');
select throws_ok(
  format($$insert into public.expense (organization_id, employee_id, department_id, expense_date, category_id, description, amount_ore, receipt_path)
    values (%L, %L, %L, '2027-03-02', %L, 'P-billet', 4500, %L)$$, :'org1', :'mads', :'butik', :'cat', :'org1' || '/' || :'ida' || '/x.pdf'),
  '22023', null, 'the receipt must be in the employee''s own folder');
select lives_ok(
  format($$insert into storage.objects (bucket_id, name) values ('receipts', %L)$$, :'org1' || '/' || :'mads' || '/p.pdf'),
  'an employee uploads a receipt to the own folder');
select throws_ok(
  format($$insert into storage.objects (bucket_id, name) values ('receipts', %L)$$, :'org1' || '/' || :'ida' || '/p.pdf'),
  '42501', null, 'an employee cannot upload to a colleague''s folder');
select lives_ok(
  format($$insert into public.expense (id, organization_id, employee_id, department_id, expense_date, category_id, description, amount_ore, receipt_path)
    values (%L, %L, %L, %L, '2027-03-02', %L, 'P-billet', 4500, %L)$$, :'exp', :'org1', :'mads', :'butik', :'cat', :'org1' || '/' || :'mads' || '/p.pdf'),
  'an expense with a receipt is registered');
select throws_ok(
  format($$select public.decide_expense_items(array[%L]::uuid[], null, 'approved')$$, :'trip'),
  '42501', null, 'an employee cannot approve');
select tests.logout();

-- A colleague sees neither the trip nor the receipt.
select tests.login_as(:'young');
select is((select count(*) from public.mileage_trip) + (select count(*) from storage.objects where bucket_id = 'receipts'),
  0::bigint, 'a colleague sees no trips or receipts');
select tests.logout();

-- The manager (time.approve in Butik) sees the receipt and decides.
select tests.login_as(:'manager');
select is((select count(*) from storage.objects where bucket_id = 'receipts'), 1::bigint, 'the approver can read the receipt');
select throws_ok(
  format($$select public.decide_expense_items(null, array[%L]::uuid[], 'rejected', '')$$, :'exp'),
  '23514', null, 'a rejection needs a reason');
select is(public.decide_expense_items(array[:'trip'::uuid], array[:'exp'::uuid], 'approved'), 2, 'the approver approves both');
select tests.logout();

select tests.login_as(:'emp');
select throws_ok(
  format($$update public.mileage_trip set meters = 1 where id = %L$$, :'trip'),
  '42501', null, 'an approved trip is locked');
select tests.logout();

select * from finish();
rollback;
