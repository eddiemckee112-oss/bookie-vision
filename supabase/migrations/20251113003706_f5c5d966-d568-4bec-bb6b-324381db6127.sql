-- Make receipts storage bucket private
UPDATE storage.buckets 
SET public = false 
WHERE id = 'receipts';

-- Add RLS policies for storage.objects to control access to receipts
CREATE POLICY "Org members can view their org's receipts"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'receipts' 
  AND (storage.foldername(name))[1] IN (
    SELECT org_id::text 
    FROM org_users 
    WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Org members can upload receipts"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'receipts'
  AND (storage.foldername(name))[1] IN (
    SELECT org_id::text 
    FROM org_users 
    WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Admins can delete receipts"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'receipts'
  AND EXISTS (
    SELECT 1 
    FROM org_users 
    WHERE org_id = ((storage.foldername(name))[1])::uuid
    AND user_id = auth.uid()
    AND role IN ('admin', 'owner')
  )
);