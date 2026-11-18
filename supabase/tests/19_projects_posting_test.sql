-- Projects as a posting dimension: conversion and who may maintain the values.
begin;
select plan(9);

\set org1 20000000-0000-0000-0000-000000000001
\set admin 10000000-0000-0000-0000-000000000001
\set manager 10000000-0000-0000-0000-000000000002
\set dim 76000000-0000-0000-0000-000000000001
\set cc 76000000-0000-0000-0000-000000000002
\set p1 76000000-0000-0000-0000-0000000000a1

-- Conversion of the old project rows.
select is(
  private.projects_to_posting('[{"project_id": "P", "start_at": null, "end_at": null, "minutes": 120}]', '[]', :'dim'),
  format('[{"values": {"%s": "P"}, "start_at": null, "end_at": null, "minutes": 120}]', :'dim')::jsonb,
  'a project row becomes a posting row');
select is(
  private.projects_to_posting('[{"project_id": "P", "start_at": null, "end_at": null, "minutes": 120}]',
    '[{"values": {"cc": "1100"}, "start_at": null, "end_at": null, "minutes": null}]', :'dim'),
  format('[{"values": {"cc": "1100", "%s": "P"}, "start_at": null, "end_at": null, "minutes": 120},
           {"values": {"cc": "1100"}, "start_at": null, "end_at": null, "minutes": null}]', :'dim')::jsonb,
  'an existing whole-shift posting is merged and kept for the rest');
select is(
  private.projects_to_posting('[]', '[{"values": {"cc": "1"}}]', :'dim'),
  '[{"values": {"cc": "1"}}]'::jsonb, 'without projects the posting is unchanged');

-- The manager gets projects.manage (not posting.manage) for this test.
insert into public.permission_grant (organization_id, profile_id, permission, scope)
select :'org1', id, 'projects.manage', 'organization' from public.permission_profile
where organization_id = :'org1' and name = 'Leder';

select tests.login_as(:'manager');
select lives_ok(
  format($$insert into public.posting_dimension (id, organization_id, key, name, is_project) values (%L, %L, 'projekt', 'Projekt', true)$$, :'dim', :'org1'),
  'projects.manage may create the project dimension');
select throws_ok(
  format($$insert into public.posting_dimension (id, organization_id, key, name) values (%L, %L, 'cc', 'Omkostningssted')$$, :'cc', :'org1'),
  '42501', null, 'but not another dimension');
select lives_ok(
  format($$insert into public.posting_value (id, organization_id, dimension_id, code, name, description) values (%L, %L, %L, 'P-1', 'Ombygning', 'Kunde A/S')$$, :'p1', :'org1', :'dim'),
  'projects.manage may create projects (values)');
select lives_ok(
  format($$insert into public.posting_value_department (organization_id, value_id, department_id) values (%L, %L, '30000000-0000-0000-0000-000000000001')$$, :'org1', :'p1'),
  'and limit them to departments');
select tests.logout();

select tests.login_as(:'admin');
insert into public.posting_dimension (id, organization_id, key, name) values (:'cc', :'org1', 'cc', 'Omkostningssted');
select throws_ok(
  format($$insert into public.posting_dimension (organization_id, key, name, is_project) values (%L, 'projekt2', 'Projekt 2', true)$$, :'org1'),
  '23505', null, 'only one project dimension per organization');
select tests.logout();

select tests.login_as(:'manager');
select throws_ok(
  format($$insert into public.posting_value (organization_id, dimension_id, code, name) values (%L, %L, '1100', 'Butik')$$, :'org1', :'cc'),
  '42501', null, 'projects.manage cannot add values to other dimensions');
select tests.logout();

select * from finish();
rollback;
