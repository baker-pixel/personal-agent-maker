-- Steno sessions table
CREATE TABLE public.steno_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  title TEXT NOT NULL DEFAULT 'Untitled session',
  transcript TEXT NOT NULL,
  summary TEXT,
  topics TEXT[] NOT NULL DEFAULT '{}',
  item_count INTEGER NOT NULL DEFAULT 0,
  session_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.steno_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own steno sessions"
ON public.steno_sessions FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_steno_sessions_updated_at
BEFORE UPDATE ON public.steno_sessions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_steno_sessions_user_date ON public.steno_sessions(user_id, session_date DESC);

-- Link extracted items back to source session
ALTER TABLE public.action_items ADD COLUMN steno_session_id UUID REFERENCES public.steno_sessions(id) ON DELETE SET NULL;
ALTER TABLE public.email_reminders ADD COLUMN steno_session_id UUID REFERENCES public.steno_sessions(id) ON DELETE SET NULL;
ALTER TABLE public.contact_reminders ADD COLUMN steno_session_id UUID REFERENCES public.steno_sessions(id) ON DELETE SET NULL;