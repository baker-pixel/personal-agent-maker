import { createClient } from "https://esm.sh/@supabase/supabase-js@2.100.0";

Deno.serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const results: string[] = [];

  try {
    // 1. Make bucket private
    const { error: bucketError } = await supabaseAdmin.storage.updateBucket('chat-attachments', { public: false });
    results.push(bucketError ? `Bucket: ${bucketError.message}` : 'Bucket set to private');

    // 2. RLS policies need direct SQL - use pg connection
    const { Pool } = await import("https://deno.land/x/postgres@v0.17.0/mod.ts");
    const dbUrl = Deno.env.get("SUPABASE_DB_URL");
    if (!dbUrl) {
      results.push("No SUPABASE_DB_URL available for SQL execution");
      return new Response(JSON.stringify({ results }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const pool = new Pool(dbUrl, 1);
    const conn = await pool.connect();

    const statements = [
      // Drop all existing storage policies to start clean
      `DO $$ DECLARE pol RECORD; BEGIN FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='storage' AND tablename='objects' LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', pol.policyname); END LOOP; END $$`,
      // Owner-scoped SELECT
      `CREATE POLICY "Users can read own chat attachments" ON storage.objects FOR SELECT TO authenticated USING (bucket_id='chat-attachments' AND (storage.foldername(name))[1]=auth.uid()::text)`,
      // Owner-scoped INSERT 
      `CREATE POLICY "Users can upload own chat attachments" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id='chat-attachments' AND (storage.foldername(name))[1]=auth.uid()::text)`,
      // Owner-scoped UPDATE
      `CREATE POLICY "Users can update own chat attachments" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id='chat-attachments' AND (storage.foldername(name))[1]=auth.uid()::text)`,
      // Owner-scoped DELETE
      `CREATE POLICY "Users can delete own chat attachments" ON storage.objects FOR DELETE TO authenticated USING (bucket_id='chat-attachments' AND (storage.foldername(name))[1]=auth.uid()::text)`,
      // Chat messages UPDATE policy
      `CREATE POLICY "Users can update own messages" ON public.chat_messages FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM chat_conversations c WHERE c.id=chat_messages.conversation_id AND c.user_id=auth.uid()))`,
      // Chat messages DELETE policy
      `CREATE POLICY "Users can delete own messages" ON public.chat_messages FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM chat_conversations c WHERE c.id=chat_messages.conversation_id AND c.user_id=auth.uid()))`,
    ];

    for (const sql of statements) {
      try {
        await conn.queryArray(sql);
        results.push(`OK: ${sql.substring(0, 60)}...`);
      } catch (e) {
        results.push(`ERR: ${e.message} | ${sql.substring(0, 60)}...`);
      }
    }

    conn.release();
    await pool.end();

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message, results }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
