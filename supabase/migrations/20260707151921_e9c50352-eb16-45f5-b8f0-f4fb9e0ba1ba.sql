
CREATE TABLE public.preregistrations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT INSERT ON public.preregistrations TO anon, authenticated;
GRANT ALL ON public.preregistrations TO service_role;
ALTER TABLE public.preregistrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can pre-register" ON public.preregistrations FOR INSERT TO anon, authenticated WITH CHECK (true);
