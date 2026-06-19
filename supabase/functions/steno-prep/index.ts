import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";


const NYLAS_BASE = "https://api.us.nylas.com";

function formatAddress(people: Array<{ name?: string; email: string }>): string {
  if (!people?.length) return "";
  return people.map(p => p.name ? `${p.name} <${p.email}>` : p.email).join(", ");
}

async function getNylasGrant(adminClient: any, userId: string): Promise<{ grantId: string; email: string | null } | null> {
  try {
    const { data: grant, error } = await adminClient
      .from("nylas_grants")
      .select("grant_id, email")
      .eq("user_id", userId)
      .eq("provider", "google")
      .eq("status", "valid")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !grant) return null;
    return { grantId: grant.grant_id, email: grant.email };
  } catch {
    return null;
  }
}

function norm(s: string) {
  return (s || "").toLowerCase().trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: uerr } = await supabase.auth.getUser();
    if (uerr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const attendeesInput: string[] = Array.isArray(body?.attendees) ? body.attendees : [];
    const topic: string = (body?.topic || "").toString();

    const tokens = attendeesInput
      .flatMap((a: string) => norm(a).split(/[,;\s]+/))
      .filter((t) => t.length >= 2);

    // 1) Find best matching prior steno session by attendee/topic overlap
    const { data: sessions } = await supabase
      .from("steno_sessions")
      .select("id, title, summary, key_points, attendees, topics, session_date, created_at")
      .order("created_at", { ascending: false })
      .limit(50);

    let lastMeeting: any = null;
    if (sessions && sessions.length) {
      const scored = sessions.map((s: any) => {
        const hay = norm(
          [s.title, s.summary, ...(s.attendees || []), ...(s.topics || [])].join(" ")
        );
        let score = 0;
        for (const t of tokens) if (hay.includes(t)) score += 2;
        if (topic && hay.includes(norm(topic))) score += 3;
        return { s, score };
      });
      scored.sort((a, b) => b.score - a.score);
      lastMeeting = scored[0]?.score > 0 ? scored[0].s : sessions[0];
    }

    // 2) Open action items (Steno-sourced), filtered loosely by tokens if provided
    const { data: openActions } = await supabase
      .from("action_items")
      .select("id, title, description, due_date, priority, assignee, created_at, meeting_summary")
      .neq("status", "done")
      .order("created_at", { ascending: false })
      .limit(50);

    const filteredActions = (openActions || []).filter((a: any) => {
      if (tokens.length === 0) return true;
      const hay = norm([a.title, a.description, a.assignee, a.meeting_summary].join(" "));
      return tokens.some((t) => hay.includes(t));
    });

    // 3) Recent emails from/to attendees (last 7 days) via Nylas
    let recentEmails: any[] = [];
    let gmailWarning: string | null = null;
    try {
      const adminClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );
      const nylasApiKey = Deno.env.get("NYLAS_API_KEY")!;
      const grant = await getNylasGrant(adminClient, user.id);
      if (!grant) throw new Error("NOT_CONNECTED");

      const emailish = attendeesInput.filter((a) => /@/.test(a));
      const nameish = attendeesInput.filter((a) => !/@/.test(a) && a.trim().length > 1);

      if (emailish.length > 0 || nameish.length > 0) {
        const sevenDaysAgo = Math.floor((Date.now() - 7 * 24 * 60 * 60 * 1000) / 1000);
        const params = new URLSearchParams({
          limit: "20",
          in: "INBOX",
          received_after: String(sevenDaysAgo),
        });
        const listRes = await fetch(
          `${NYLAS_BASE}/v3/grants/${grant.grantId}/messages?${params.toString()}`,
          { headers: { Authorization: `Bearer ${nylasApiKey}` } }
        );
        if (listRes.ok) {
          const listData = await listRes.json();
          const msgs: any[] = listData.data || [];

          // Filter by attendee email/name
          const emailSet = new Set(emailish.map((e) => e.toLowerCase()));
          const nameLower = nameish.map((n) => n.toLowerCase());

          const relevant = msgs.filter((msg: any) => {
            const fromEmails = (msg.from || []).map((f: any) => f.email?.toLowerCase() || "");
            const fromNames = (msg.from || []).map((f: any) => (f.name || "").toLowerCase());
            if (emailish.length > 0 && fromEmails.some((e: string) => emailSet.has(e))) return true;
            if (nameish.length > 0 && fromNames.some((n: string) => nameLower.some((nl) => n.includes(nl)))) return true;
            return false;
          }).slice(0, 6);

          recentEmails = relevant.map((msg: any) => ({
            subject: msg.subject || "",
            from: formatAddress(msg.from || []),
            date: msg.date ? new Date(msg.date * 1000).toUTCString() : "",
            snippet: msg.snippet || "",
          }));
        }
      }
    } catch (e) {
      gmailWarning = e instanceof Error ? e.message : "Gmail unavailable";
    }

    return new Response(
      JSON.stringify({
        lastMeeting,
        openActions: filteredActions.slice(0, 10),
        recentEmails,
        gmailWarning,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Prep failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
