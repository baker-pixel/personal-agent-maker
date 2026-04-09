-- Fix: allow the metadata view to read base table by disabling security_invoker
-- This lets the view run as its owner (postgres), while authenticated users
-- still cannot query the base table directly.
ALTER VIEW public.google_oauth_token_metadata SET (security_invoker = off);