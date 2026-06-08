ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS onboarding_step integer DEFAULT 0;
