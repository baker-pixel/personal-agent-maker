-- Lead status enum
CREATE TYPE public.lead_status AS ENUM ('new', 'drafted', 'responded', 'qualified', 'closed', 'archived');

-- Lead rule type enum
CREATE TYPE public.lead_rule_type AS ENUM ('sender_domain', 'subject_keyword', 'recipient_inbox');

-- Leads table
CREATE TABLE public.leads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  gmail_message_id TEXT,
  thread_id TEXT,
  from_name TEXT,
  from_email TEXT NOT NULL,
  subject TEXT,
  snippet TEXT,
  source TEXT,
  source_type TEXT NOT NULL DEFAULT 'auto',
  confidence INTEGER NOT NULL DEFAULT 50,
  status public.lead_status NOT NULL DEFAULT 'new',
  draft_id UUID,
  notes TEXT,
  received_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  responded_at TIMESTAMP WITH TIME ZONE,
  nudged_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, gmail_message_id)
);

CREATE INDEX idx_leads_user_status ON public.leads(user_id, status);
CREATE INDEX idx_leads_user_received ON public.leads(user_id, received_at DESC);
CREATE INDEX idx_leads_nudge ON public.leads(status, received_at) WHERE status = 'new';

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own leads" ON public.leads FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own leads" ON public.leads FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own leads" ON public.leads FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own leads" ON public.leads FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER update_leads_updated_at
  BEFORE UPDATE ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Lead rules table
CREATE TABLE public.lead_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  rule_type public.lead_rule_type NOT NULL,
  pattern TEXT NOT NULL,
  label TEXT,
  priority INTEGER NOT NULL DEFAULT 50,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_lead_rules_user ON public.lead_rules(user_id, enabled);

ALTER TABLE public.lead_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own lead rules" ON public.lead_rules FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own lead rules" ON public.lead_rules FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own lead rules" ON public.lead_rules FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own lead rules" ON public.lead_rules FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER update_lead_rules_updated_at
  BEFORE UPDATE ON public.lead_rules
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();