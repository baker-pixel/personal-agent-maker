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
    const DB_URL = Deno.env.get("SUPABASE_DB_URL");
    if (!DB_URL) {
      return new Response(JSON.stringify({ error: "SUPABASE_DB_URL not available" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Connect via Deno's postgres
    const { Client } = await import("https://deno.land/x/postgres@v0.19.3/mod.ts");
    const client = new Client(DB_URL);
    await client.connect();

    await client.queryObject(`
      CREATE TABLE IF NOT EXISTS public.sms_conversations (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL,
        phone_number text NOT NULL UNIQUE,
        messages jsonb NOT NULL DEFAULT '[]'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    await client.queryObject(`ALTER TABLE public.sms_conversations ENABLE ROW LEVEL SECURITY;`);

    await client.queryObject(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='sms_conversations' AND policyname='Users can manage own sms conversations') THEN
          CREATE POLICY "Users can manage own sms conversations"
            ON public.sms_conversations FOR ALL TO authenticated
            USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
        END IF;
      END $$;
    `);

    await client.queryObject(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT column_name FROM information_schema.columns WHERE table_name='user_preferences' AND column_name='phone_number') THEN
          ALTER TABLE public.user_preferences ADD COLUMN phone_number text;
        END IF;
      END $$;
    `);

    await client.end();

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
