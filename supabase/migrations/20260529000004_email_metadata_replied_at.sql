ALTER TABLE public.email_metadata
  ADD COLUMN IF NOT EXISTS replied_at timestamptz;
