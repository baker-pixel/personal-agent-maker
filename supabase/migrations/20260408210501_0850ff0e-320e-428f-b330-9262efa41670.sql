-- Fix SECURITY DEFINER view warning by recreating with SECURITY INVOKER
DROP VIEW IF EXISTS public.google_oauth_token_metadata;

CREATE VIEW public.google_oauth_token_metadata
  WITH (security_invoker = true)
  AS SELECT id, user_id, provider, email, token_expires_at, created_at, updated_at
  FROM public.google_oauth_tokens;

-- Re-grant access
GRANT SELECT ON public.google_oauth_token_metadata TO authenticated;