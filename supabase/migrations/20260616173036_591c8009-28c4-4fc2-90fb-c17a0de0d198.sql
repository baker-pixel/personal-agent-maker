
ALTER TABLE public.nylas_grants ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';
ALTER TABLE public.user_preferences ADD COLUMN IF NOT EXISTS sonic_voice_id TEXT;
