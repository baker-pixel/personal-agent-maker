import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const body = await req.json();
    const { name, email, phone, company, role, notes, is_vip, birthday } = body;

    if (!name?.trim()) {
      return new Response(JSON.stringify({ error: "name is required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const adminClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    // Validate email format if provided
    if (email && !emailRegex.test(email.trim())) {
      return new Response(
        JSON.stringify({ error: "Invalid email address format" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check for duplicate by email
    if (email) {
      const { data: existing } = await adminClient
        .from("contacts")
        .select("id, name, email")
        .eq("user_id", user.id)
        .eq("email", email.trim().toLowerCase())
        .maybeSingle();
      if (existing) {
        return new Response(
          JSON.stringify({ error: `Contact already exists: ${existing.name} <${existing.email}>`, code: "DUPLICATE" }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Check for duplicate by name (same user — catches no-email duplicates)
    const { data: sameName } = await adminClient
      .from("contacts")
      .select("id, name")
      .eq("user_id", user.id)
      .ilike("name", name.trim())
      .maybeSingle();
    if (sameName) {
      return new Response(
        JSON.stringify({ error: `A contact named "${sameName.name}" already exists`, code: "DUPLICATE_NAME" }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: contact, error: insertErr } = await adminClient
      .from("contacts")
      .insert({
        user_id: user.id,
        name: name.trim(),
        email: email?.trim().toLowerCase() || null,
        phone: phone?.trim() || null,
        company: company?.trim() || null,
        role: role?.trim() || null,
        notes: notes?.trim() || null,
        is_vip: is_vip ?? false,
        birthday: birthday || null,
      })
      .select()
      .single();

    if (insertErr) throw insertErr;

    return new Response(JSON.stringify({ contact }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
