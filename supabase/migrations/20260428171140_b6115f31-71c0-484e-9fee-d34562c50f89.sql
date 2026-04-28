ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS ai_summary text;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS ai_topics text[] DEFAULT '{}'::text[];
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS birthday date;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS stay_in_touch_days integer;

CREATE INDEX IF NOT EXISTS idx_contacts_user_email ON public.contacts(user_id, email);
CREATE INDEX IF NOT EXISTS idx_contacts_last_interaction ON public.contacts(user_id, last_interaction_at DESC NULLS LAST);