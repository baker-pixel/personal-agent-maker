import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Parse "Display Name <email@x.com>" or "email@x.com"
function parseEmailHeader(raw: string): { name: string; email: string } | null {
  if (!raw) return null;
  const match = raw.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (match) {
    const name = match[1].trim() || match[2].split("@")[0];
    return { name, email: match[2].toLowerCase().trim() };
  }
  const emailOnly = raw.trim().toLowerCase();
  if (emailOnly.includes("@")) {
    return { name: emailOnly.split("@")[0], email: emailOnly };
  }
  return null;
}

// Skip noisy/automated senders
function isSkippable(email: string): boolean {
  const noise = ["noreply", "no-reply", "donotreply", "do-not-reply", "notifications@", "mailer-daemon", "postmaster", "support@", "hello@", "team@"];
  return noise.some((n) => email.includes(n));
}

async function getValidToken(adminClient: any, userId: string, provider: string) {
  const { data: tokenRow } = await adminClient
    .from("google_oauth_tokens")
    .select("*")
    .eq("user_id", userId)
    .eq("provider", provider)
    .maybeSingle();
  if (!tokenRow) return null;
  const expiresAt = new Date(tokenRow.token_expires_at);
  if (expiresAt > new Date(Date.now() + 60000)) return tokenRow.access_token;
  if (!tokenRow.refresh_token) return null;
  try {
    const r = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: Deno.env.get("GOOGLE_CLIENT_ID")!,
        client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET")!,
        refresh_token: tokenRow.refresh_token,
        grant_type: "refresh_token",
      }),
    });
    const data = await r.json();
    if (data.error) return null;
    await adminClient
      .from("google_oauth_tokens")
      .update({
        access_token: data.access_token,
        token_expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId)
      .eq("provider", provider);
    return data.access_token;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

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
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const gmailToken = await getValidToken(admin, user.id, "gmail");
    const calToken = await getValidToken(admin, user.id, "google-calendar");

    // Aggregate contacts: email -> { name, count, lastAt, source, summary }
    const map = new Map<string, { name: string; count: number; lastAt: string; source: string; summary: string }>();

    // ----- Gmail: last 30 days, up to 100 messages -----
    if (gmailToken) {
      try {
        const listRes = await fetch(
          "https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=100&q=newer_than:30d",
          { headers: { Authorization: `Bearer ${gmailToken}` } }
        );
        const listData = await listRes.json();
        const messages = listData.messages || [];
        await Promise.all(
          messages.slice(0, 100).map(async (m: { id: string }) => {
            try {
              const r = await fetch(
                `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`,
                { headers: { Authorization: `Bearer ${gmailToken}` } }
              );
              const msg = await r.json();
              const headers = msg.payload?.headers || [];
              const get = (n: string) =>
                headers.find((h: any) => h.name.toLowerCase() === n.toLowerCase())?.value || "";
              const from = parseEmailHeader(get("From"));
              const subject = get("Subject");
              const date = get("Date");
              const ts = date ? new Date(date).toISOString() : new Date().toISOString();
              if (from && !isSkippable(from.email)) {
                const existing = map.get(from.email);
                if (!existing || existing.lastAt < ts) {
                  map.set(from.email, {
                    name: from.name,
                    count: (existing?.count || 0) + 1,
                    lastAt: ts,
                    source: "email",
                    summary: subject ? `Email: ${subject}` : "Email",
                  });
                } else {
                  existing.count += 1;
                }
              }
            } catch { /* skip individual message errors */ }
          })
        );
      } catch (e) {
        console.error("Gmail sync error:", e);
      }
    }

    // ----- Calendar: next/past 30 days attendees -----
    if (calToken) {
      try {
        const now = new Date();
        const past = new Date(now); past.setDate(past.getDate() - 30);
        const future = new Date(now); future.setDate(future.getDate() + 30);
        const params = new URLSearchParams({
          timeMin: past.toISOString(),
          timeMax: future.toISOString(),
          singleEvents: "true",
          orderBy: "startTime",
          maxResults: "100",
        });
        const calRes = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
          { headers: { Authorization: `Bearer ${calToken}` } }
        );
        const calData = await calRes.json();
        for (const ev of calData.items || []) {
          const ts = ev.start?.dateTime || ev.start?.date;
          if (!ts) continue;
          const isoTs = new Date(ts).toISOString();
          for (const a of ev.attendees || []) {
            if (!a.email || a.self) continue;
            const email = a.email.toLowerCase();
            if (isSkippable(email)) continue;
            const name = a.displayName || email.split("@")[0];
            const existing = map.get(email);
            if (!existing || existing.lastAt < isoTs) {
              map.set(email, {
                name: existing?.name || name,
                count: (existing?.count || 0) + 1,
                lastAt: isoTs,
                source: existing && existing.lastAt > isoTs ? existing.source : "calendar",
                summary: existing && existing.lastAt > isoTs ? existing.summary : `Meeting: ${ev.summary || "Untitled"}`,
              });
            } else {
              existing.count += 1;
            }
          }
        }
      } catch (e) {
        console.error("Calendar sync error:", e);
      }
    }

    // ----- Upsert into contacts -----
    let upserts = 0;
    for (const [email, info] of map.entries()) {
      // Try to fetch existing to preserve name/notes
      const { data: existing } = await admin
        .from("contacts")
        .select("id, name, interaction_count, notes, company, role, is_vip")
        .eq("user_id", user.id)
        .eq("email", email)
        .maybeSingle();

      const payload = {
        user_id: user.id,
        email,
        name: existing?.name || info.name,
        last_interaction_at: info.lastAt,
        last_interaction_source: info.source,
        last_interaction_summary: info.summary,
        interaction_count: (existing?.interaction_count || 0) + info.count,
        updated_at: new Date().toISOString(),
      };

      if (existing) {
        await admin.from("contacts").update(payload).eq("id", existing.id);
      } else {
        await admin.from("contacts").insert(payload);
      }
      upserts++;
    }

    return new Response(
      JSON.stringify({ ok: true, synced: upserts, gmail: !!gmailToken, calendar: !!calToken }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("contacts-sync error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
