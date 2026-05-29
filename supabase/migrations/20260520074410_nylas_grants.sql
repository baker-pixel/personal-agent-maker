-- Nylas grants table: replaces google_oauth_tokens for token management.
-- One row per connected Google account per user (provider = 'google').
-- Nylas manages all token refresh internally; we only store grant_id.

CREATE TABLE IF NOT EXISTS public.nylas_grants (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  grant_id    text NOT NULL,
  email       text,
  provider    text NOT NULL DEFAULT 'google',
  created_at  timestamptz DEFAULT now() NOT NULL,
  updated_at  timestamptz DEFAULT now() NOT NULL,
  UNIQUE (user_id, provider, email)
);

CREATE INDEX IF NOT EXISTS nylas_grants_user_id_idx ON public.nylas_grants (user_id);

ALTER TABLE public.nylas_grants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own nylas grants"
  ON public.nylas_grants FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own nylas grants"
  ON public.nylas_grants FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
-- INSERT/UPDATE only via service role (edge functions)
