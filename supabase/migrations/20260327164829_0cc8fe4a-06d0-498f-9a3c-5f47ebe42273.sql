CREATE TABLE public.daily_briefings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  briefing_date date NOT NULL DEFAULT CURRENT_DATE,
  summary text NOT NULL,
  email_count integer DEFAULT 0,
  meeting_count integer DEFAULT 0,
  urgent_items integer DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(user_id, briefing_date)
);

ALTER TABLE public.daily_briefings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own briefings" ON public.daily_briefings
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own briefings" ON public.daily_briefings
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);