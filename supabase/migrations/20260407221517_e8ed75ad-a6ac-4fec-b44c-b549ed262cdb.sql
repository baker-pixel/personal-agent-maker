
CREATE TABLE public.email_triage_preferences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  vip_senders TEXT[] NOT NULL DEFAULT '{}',
  dismiss_senders TEXT[] NOT NULL DEFAULT '{}',
  priority_keywords TEXT[] NOT NULL DEFAULT '{}',
  dismiss_keywords TEXT[] NOT NULL DEFAULT '{}',
  custom_instructions TEXT DEFAULT '',
  learned_patterns JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE public.email_triage_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own triage prefs"
  ON public.email_triage_preferences
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
