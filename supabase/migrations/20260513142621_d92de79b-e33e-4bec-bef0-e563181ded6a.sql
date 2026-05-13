ALTER TABLE public.steno_sessions
  ADD COLUMN IF NOT EXISTS attendees text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS location text;

CREATE INDEX IF NOT EXISTS idx_steno_sessions_user_created
  ON public.steno_sessions (user_id, created_at DESC);