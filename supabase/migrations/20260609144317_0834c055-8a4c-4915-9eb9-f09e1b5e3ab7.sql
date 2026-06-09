
-- 1) Add missing columns to user_preferences
ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS onboarding_completed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS onboarding_step integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS user_display_name text,
  ADD COLUMN IF NOT EXISTS tone text,
  ADD COLUMN IF NOT EXISTS email_length text,
  ADD COLUMN IF NOT EXISTS priority_visibility text,
  ADD COLUMN IF NOT EXISTS decision_style text,
  ADD COLUMN IF NOT EXISTS assessment_status text;

-- 2) nylas_grants — tracks connected Google (Gmail/Calendar) accounts
CREATE TABLE IF NOT EXISTS public.nylas_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  provider text NOT NULL,
  email text,
  grant_id text,
  scopes text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider, email)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.nylas_grants TO authenticated;
GRANT ALL ON public.nylas_grants TO service_role;

ALTER TABLE public.nylas_grants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own nylas grants"
  ON public.nylas_grants FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_nylas_grants_updated_at
  BEFORE UPDATE ON public.nylas_grants
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) push_subscriptions — Web Push endpoints for PWA notifications
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, endpoint)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;
GRANT ALL ON public.push_subscriptions TO service_role;

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own push subscriptions"
  ON public.push_subscriptions FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_push_subscriptions_updated_at
  BEFORE UPDATE ON public.push_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
