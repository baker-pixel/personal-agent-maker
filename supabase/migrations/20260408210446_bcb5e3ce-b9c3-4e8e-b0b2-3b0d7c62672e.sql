-- Fix 1: Add missing UPDATE and DELETE policies on daily_briefings
CREATE POLICY "Users can update own briefings"
  ON public.daily_briefings
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own briefings"
  ON public.daily_briefings
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Fix 2: Create restricted view for OAuth token metadata (no sensitive columns)
CREATE VIEW public.google_oauth_token_metadata AS
  SELECT id, user_id, provider, email, token_expires_at, created_at, updated_at
  FROM public.google_oauth_tokens;

-- Grant view access to authenticated users
GRANT SELECT ON public.google_oauth_token_metadata TO authenticated;

-- Revoke direct SELECT on the raw tokens table
REVOKE SELECT ON public.google_oauth_tokens FROM authenticated;