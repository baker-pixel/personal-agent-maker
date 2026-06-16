
CREATE TABLE public.mvp_checklist_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category TEXT NOT NULL,
  label TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'not_started',
  notes TEXT DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  updated_by TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mvp_checklist_items TO anon, authenticated;
GRANT ALL ON public.mvp_checklist_items TO service_role;

ALTER TABLE public.mvp_checklist_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read mvp checklist" ON public.mvp_checklist_items FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "public insert mvp checklist" ON public.mvp_checklist_items FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "public update mvp checklist" ON public.mvp_checklist_items FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "public delete mvp checklist" ON public.mvp_checklist_items FOR DELETE TO anon, authenticated USING (true);

CREATE TRIGGER update_mvp_checklist_items_updated_at
BEFORE UPDATE ON public.mvp_checklist_items
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER PUBLICATION supabase_realtime ADD TABLE public.mvp_checklist_items;
ALTER TABLE public.mvp_checklist_items REPLICA IDENTITY FULL;

-- Seed initial checklist
INSERT INTO public.mvp_checklist_items (category, label, status, sort_order) VALUES
('Auth & Onboarding','Google OAuth sign-in','done',10),
('Auth & Onboarding','Email/password sign-in','done',20),
('Auth & Onboarding','3-step onboarding flow','done',30),
('Auth & Onboarding','PWA install prompt','done',40),
('Auth & Onboarding','Password recovery flow','done',50),
('Core Admin','Email triage with priorities','done',60),
('Core Admin','VIP rules engine','done',70),
('Core Admin','Calendar CRUD (Google)','done',80),
('Core Admin','Daily briefing generation','done',90),
('Core Admin','Weekly report widget','done',100),
('Core Admin','EOD wrap-up','done',110),
('Tasks & Contacts','AI task extraction from email','done',120),
('Tasks & Contacts','Tasks page + dashboard widget','done',130),
('Tasks & Contacts','Contacts sync + VIP','done',140),
('Tasks & Contacts','Contact reminders (stay in touch)','done',150),
('AI & Voice','Orchestrator chat (Decision/Detail)','done',160),
('AI & Voice','Sonic TTS voice replies','done',170),
('AI & Voice','Voice conversation mode','done',180),
('AI & Voice','Steno meeting transcription','done',190),
('Integrations','Slack outbound notifications','done',200),
('Integrations','Twilio SMS gateway','done',210),
('Integrations','Google Drive file search','done',220),
('Integrations','Nylas OAuth (awaiting credentials)','blocked',230),
('UI/UX','Dashboard with 5 department cards','done',240),
('UI/UX','2D Office hub','done',250),
('UI/UX','Pricing page','done',260),
('UI/UX','Investors page','done',270),
('UI/UX','Landing page','done',280),
('Backend/Security','40+ Edge Functions deployed','done',290),
('Backend/Security','RLS on all user tables','done',300),
('Backend/Security','Privacy policy + ToS','done',310),
('QA & Post-Launch','Mobile device verification','in_progress',320),
('QA & Post-Launch','Email triage accuracy testing','in_progress',330),
('QA & Post-Launch','Voice stress test','in_progress',340),
('QA & Post-Launch','Analytics instrumentation','not_started',350),
('QA & Post-Launch','Error monitoring (Sentry)','not_started',360),
('QA & Post-Launch','Onboarding funnel tracking','not_started',370),
('QA & Post-Launch','Customer support inbox','not_started',380),
('QA & Post-Launch','Status page','not_started',390),
('QA & Post-Launch','Backup/restore drill','not_started',400),
('QA & Post-Launch','Load testing','not_started',410);
