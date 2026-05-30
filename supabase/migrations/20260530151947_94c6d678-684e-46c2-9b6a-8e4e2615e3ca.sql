CREATE TYPE public.beta_user_status AS ENUM ('invited','signed_up','active','churned','declined');
CREATE TYPE public.beta_user_tier AS ENUM ('vip','standard','waitlist');

CREATE TABLE public.beta_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL,
  company text,
  role text,
  phone text,
  source text,
  status public.beta_user_status NOT NULL DEFAULT 'invited',
  tier public.beta_user_tier NOT NULL DEFAULT 'standard',
  notes text,
  invited_at timestamptz,
  signed_up_at timestamptz,
  activated_at timestamptz,
  last_contacted_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_beta_users_status ON public.beta_users(status);
CREATE INDEX idx_beta_users_email ON public.beta_users(lower(email));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.beta_users TO authenticated;
GRANT ALL ON public.beta_users TO service_role;

ALTER TABLE public.beta_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team can view beta users" ON public.beta_users FOR SELECT TO authenticated USING (true);
CREATE POLICY "Team can insert beta users" ON public.beta_users FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Team can update beta users" ON public.beta_users FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Team can delete beta users" ON public.beta_users FOR DELETE TO authenticated USING (true);

CREATE TRIGGER update_beta_users_updated_at
BEFORE UPDATE ON public.beta_users
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();