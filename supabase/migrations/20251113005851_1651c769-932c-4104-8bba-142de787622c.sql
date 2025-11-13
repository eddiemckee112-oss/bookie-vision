-- 1) SECURITY DEFINER function to create an org and add the creator as owner
--    Avoids RLS chicken-and-egg on org_users by executing with elevated privileges
create or replace function public.create_org(_name text)
returns public.orgs
language plpgsql
security definer
set search_path = public
as $$
declare
  new_org public.orgs;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  -- Create org
  insert into public.orgs (name)
  values (_name)
  returning * into new_org;

  -- Add creator as owner
  insert into public.org_users (org_id, user_id, role)
  values (new_org.id, auth.uid(), 'owner'::user_role);

  return new_org;
end;
$$;

-- Ensure authenticated users can call the function
grant execute on function public.create_org(text) to authenticated;


-- 2) Storage RLS policies for private 'receipts' bucket
--    Enables org-scoped upload/view and admin/owner delete

-- Drop existing policies if they exist
drop policy if exists "Org members can upload receipts" on storage.objects;
drop policy if exists "Org members can view receipts" on storage.objects;
drop policy if exists "Admins can delete receipts" on storage.objects;

-- Allow org members to upload receipts into their org folder: {org_id}/{filename}
create policy "Org members can upload receipts"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] in (
      select org_id::text from public.org_users where user_id = auth.uid()
    )
  );

-- Allow org members to view receipts for their org
create policy "Org members can view receipts"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] in (
      select org_id::text from public.org_users where user_id = auth.uid()
    )
  );

-- Allow admins/owners to delete receipts for their org
create policy "Admins can delete receipts"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'receipts'
    and exists (
      select 1
      from public.org_users ou
      where ou.user_id = auth.uid()
        and ou.org_id = ((storage.foldername(name))[1])::uuid
        and ou.role in ('admin', 'owner')
    )
  );