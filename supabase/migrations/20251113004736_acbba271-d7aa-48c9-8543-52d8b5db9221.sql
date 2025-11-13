-- Drop existing problematic policies on org_users
DROP POLICY IF EXISTS "Users can view org members" ON public.org_users;
DROP POLICY IF EXISTS "Admins can add org members" ON public.org_users;
DROP POLICY IF EXISTS "Admins can update org members" ON public.org_users;
DROP POLICY IF EXISTS "Owners can delete org members" ON public.org_users;

-- Create a SECURITY DEFINER function to check if user is in an org
CREATE OR REPLACE FUNCTION public.user_in_org(_user_id uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.org_users
    WHERE user_id = _user_id AND org_id = _org_id
  );
$$;

-- New policies using SECURITY DEFINER functions to avoid recursion
CREATE POLICY "Users can view org members"
ON public.org_users
FOR SELECT
TO authenticated
USING (public.user_in_org(auth.uid(), org_id));

CREATE POLICY "Admins can add org members"
ON public.org_users
FOR INSERT
TO authenticated
WITH CHECK (public.has_min_role(auth.uid(), org_id, 'admin'::user_role));

CREATE POLICY "Admins can update org members"
ON public.org_users
FOR UPDATE
TO authenticated
USING (public.has_min_role(auth.uid(), org_id, 'admin'::user_role));

CREATE POLICY "Owners can delete org members"
ON public.org_users
FOR DELETE
TO authenticated
USING (public.has_min_role(auth.uid(), org_id, 'owner'::user_role));