
CREATE TABLE public.draft_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  type text NOT NULL DEFAULT 'email_reply',
  status text NOT NULL DEFAULT 'pending',
  to_email text,
  to_name text,
  subject text,
  body text,
  thread_id text,
  gmail_message_id text,
  in_reply_to text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.draft_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own drafts"
  ON public.draft_actions FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own drafts"
  ON public.draft_actions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own drafts"
  ON public.draft_actions FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own drafts"
  ON public.draft_actions FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
