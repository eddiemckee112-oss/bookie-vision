-- Add token column to org_invites for secure invite links
ALTER TABLE public.org_invites 
ADD COLUMN IF NOT EXISTS token TEXT UNIQUE DEFAULT gen_random_uuid()::text;

-- Create index for faster token lookups
CREATE INDEX IF NOT EXISTS idx_org_invites_token ON public.org_invites(token);

-- Add RLS policy for accepting invites via token
CREATE POLICY "Users can view invites by token" 
ON public.org_invites 
FOR SELECT 
USING (token IS NOT NULL);