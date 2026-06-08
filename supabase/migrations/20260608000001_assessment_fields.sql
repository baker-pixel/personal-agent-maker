ALTER TABLE user_preferences
  ADD COLUMN IF NOT EXISTS assessment_session_id TEXT,
  ADD COLUMN IF NOT EXISTS assessment_status TEXT;
