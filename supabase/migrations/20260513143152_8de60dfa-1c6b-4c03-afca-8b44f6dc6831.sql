ALTER TABLE public.steno_sessions
  ADD COLUMN IF NOT EXISTS key_points text[] NOT NULL DEFAULT '{}'::text[];