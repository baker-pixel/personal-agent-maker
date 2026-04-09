
-- 1. Make chat-attachments bucket private
UPDATE storage.buckets SET public = false WHERE id = 'chat-attachments';

-- 2. Drop the old public SELECT policy
DROP POLICY IF EXISTS "Anyone can view chat attachments" ON storage.objects;
DROP POLICY IF EXISTS "Public read access for chat attachments" ON storage.objects;

-- 3. Revoke direct SELECT on google_oauth_tokens from authenticated
REVOKE SELECT ON public.google_oauth_tokens FROM authenticated;

-- 4. Add DELETE policy on user_preferences
CREATE POLICY "Users can delete own preferences"
ON public.user_preferences
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);
