ALTER TABLE public.user_preferences
  ADD COLUMN slack_notification_channel_id TEXT DEFAULT NULL,
  ADD COLUMN slack_notification_channel_name TEXT DEFAULT NULL;