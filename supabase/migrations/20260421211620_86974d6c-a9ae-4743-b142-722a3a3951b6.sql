ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS tts_provider text DEFAULT 'browser',
  ADD COLUMN IF NOT EXISTS tts_elevenlabs_voice_id text,
  ADD COLUMN IF NOT EXISTS tts_elevenlabs_model_id text DEFAULT 'eleven_multilingual_v2',
  ADD COLUMN IF NOT EXISTS tts_stability numeric DEFAULT 0.5,
  ADD COLUMN IF NOT EXISTS tts_similarity numeric DEFAULT 0.75;