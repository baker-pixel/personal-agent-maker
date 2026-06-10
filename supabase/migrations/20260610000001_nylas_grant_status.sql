-- Grant health tracking: webhook marks grants expired/revoked so the app
-- can prompt re-auth instead of silently failing on every Nylas call.

ALTER TABLE public.nylas_grants
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'valid'
  CHECK (status IN ('valid', 'expired', 'revoked'));
