ALTER TABLE public.user_preferences
ADD COLUMN IF NOT EXISTS tts_voice_uri text,
ADD COLUMN IF NOT EXISTS tts_rate numeric DEFAULT 1.05,
ADD COLUMN IF NOT EXISTS tts_pitch numeric DEFAULT 1.0,
ADD COLUMN IF NOT EXISTS tts_enabled boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS voice_conversation_enabled boolean DEFAULT false;