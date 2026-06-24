ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS voice_onboarded boolean DEFAULT false;
