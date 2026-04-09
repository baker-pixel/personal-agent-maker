-- Re-enable security_invoker so the view respects the calling user's RLS
ALTER VIEW public.google_oauth_token_metadata SET (security_invoker = on);

-- Re-grant SELECT on the base table so the view can query it through RLS
-- RLS on google_oauth_tokens already ensures users only see their own rows
GRANT SELECT ON public.google_oauth_tokens TO authenticated;