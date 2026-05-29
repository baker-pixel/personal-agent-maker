ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS features_enabled jsonb NOT NULL DEFAULT '{
    "email_triage": true,
    "calendar_sync": true,
    "lead_detection": true,
    "daily_briefing": true,
    "follow_up_tracking": true,
    "contact_sync": true
  }'::jsonb;
