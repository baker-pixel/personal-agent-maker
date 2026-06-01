ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS email_signature text;
