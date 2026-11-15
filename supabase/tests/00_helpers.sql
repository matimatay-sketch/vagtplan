-- Shared helpers for pgTAP tests. Files run in alphabetical order; each test
-- file runs in its own transaction, so helpers are (re)created per file via
-- this include pattern: tests call tests.* functions created here, which
-- persist because this file commits.
create extension if not exists pgtap with schema extensions;
create schema if not exists tests;
grant usage on schema tests to authenticated, anon;

create or replace function tests.login_as(uid uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

create or replace function tests.logout() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'postgres', true);
end $$;

-- Create a confirmed auth user; returns its id.
create or replace function tests.create_user(email text) returns uuid
language plpgsql security definer as $$
declare
  uid uuid := gen_random_uuid();
begin
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', email,
    'x', now(), '{}', '{}', now(), now());
  return uid;
end $$;
grant execute on all functions in schema tests to authenticated;

select plan(1);
select ok(true, 'helpers installed');
select * from finish();
