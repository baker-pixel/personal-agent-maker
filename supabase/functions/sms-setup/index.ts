import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Use PostgREST to check if table exists, if not we create via pg_net or management API
    // Actually, let's use the SQL endpoint available in Supabase
    const sql = `
      CREATE TABLE IF NOT EXISTS public.sms_conversations (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL,
        phone_number text NOT NULL UNIQUE,
        messages jsonb NOT NULL DEFAULT '[]'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      ALTER TABLE public.sms_conversations ENABLE ROW LEVEL SECURITY;
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='sms_conversations' AND policyname='Users can manage own sms conversations') THEN
          CREATE POLICY "Users can manage own sms conversations"
            ON public.sms_conversations FOR ALL TO authenticated
            USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
        END IF;
      END $$;
      DO $$ BEGIN
        IF NOT EXISTS (SELECT column_name FROM information_schema.columns WHERE table_name='user_preferences' AND column_name='phone_number') THEN
          ALTER TABLE public.user_preferences ADD COLUMN phone_number text;
        END IF;
      END $$;
    `;

    const response = await fetch(`${SUPABASE_URL}/pg/query`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: sql }),
    });

    if (!response.ok) {
      const text = await response.text();
      return new Response(JSON.stringify({ error: `SQL failed [${response.status}]: ${text}` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    return new Response(JSON.stringify({ success: true, data }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
