
ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS lead_nudge_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS lead_nudge_minutes integer NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS lead_escalate_drafted_minutes integer NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS lead_escalate_to_slack boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS lead_escalate_to_sms boolean NOT NULL DEFAULT false;
