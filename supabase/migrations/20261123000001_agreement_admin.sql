-- Agreement administration: drafts are edited freely (RLS), publishing goes
-- through publish_agreement_version, which closes the previous version the
-- day before the new one starts. Published versions never change otherwise.

create function public.publish_agreement_version(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v public.agreement_version;
  org uuid;
begin
  select * into v from public.agreement_version where id = p_id for update;
  if v.id is null then raise exception 'not found' using errcode = 'P0002'; end if;
  select organization_id into org from public.agreement where id = v.agreement_id;
  if org is null or not private.has_org_permission(org, 'agreements.manage') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v.status <> 'draft' then raise exception 'only drafts are published' using errcode = '22023'; end if;
  if exists (select 1 from public.agreement_version x
             where x.agreement_id = v.agreement_id and x.status = 'published' and x.valid_from >= v.valid_from) then
    raise exception 'a new version must start after the published versions' using errcode = '23514';
  end if;
  -- The open (or overlapping) previous version ends the day before.
  update public.agreement_version x set
    valid_to = v.valid_from - 1,
    document = jsonb_set(x.document, '{valid_to}', to_jsonb((v.valid_from - 1)::text))
  where x.agreement_id = v.agreement_id and x.status = 'published'
    and (x.valid_to is null or x.valid_to >= v.valid_from);
  update public.agreement_version set
    status = 'published', published_at = now(), published_by = (select auth.uid()),
    document = jsonb_set(jsonb_set(document, '{valid_from}', to_jsonb(v.valid_from::text)), '{valid_to}',
      coalesce(to_jsonb(v.valid_to::text), 'null'::jsonb))
  where id = v.id;
end $$;
grant execute on function public.publish_agreement_version(uuid) to authenticated;
revoke execute on function public.publish_agreement_version(uuid) from public, anon;

-- Published versions are read-only except through publish_agreement_version.
create function private.protect_published_version() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.status = 'published' and current_user not in ('postgres', 'supabase_admin')
     and coalesce(current_setting('app.bootstrap', true), '') <> 'on' then
    raise exception 'a published version cannot be changed; make a new version' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger agreement_version_protect before update or delete on public.agreement_version
  for each row execute function private.protect_published_version();
