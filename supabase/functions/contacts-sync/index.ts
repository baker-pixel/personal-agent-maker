import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const NYLAS_BASE = "https://api.us.nylas.com";

async function getNylasGrants(adminClient: any, userId: string): Promise<Array<{ grantId: string; email: string }>> {
  const { data: rows } = await adminClient
    .from("nylas_grants")
    .select("grant_id, email")
    .eq("user_id", userId)
    .eq("provider", "google");
  if (!rows?.length) return [];
  return rows.map((r: any) => ({ grantId: r.grant_id, email: r.email || "primary" }));
}

async function fetchAllContacts(grantId: string, nylasApiKey: string): Promise<any[]> {
  const all: any[] = [];
  let pageToken: string | null = null;

  do {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 15000);
    try {
      const params = new URLSearchParams({ limit: "1000" });
      if (pageToken) params.set("page_token", pageToken);
      const res = await fetch(
        `${NYLAS_BASE}/v3/grants/${grantId}/contacts?${params.toString()}`,
        { headers: { Authorization: `Bearer ${nylasApiKey}` }, signal: ctrl.signal }
      );
      clearTimeout(tid);
      if (!res.ok) { console.error("Nylas contacts fetch failed:", res.status); break; }
      const data = await res.json();
      all.push(...(data.data || []));
      pageToken = data.next_cursor || null;
    } catch (e) {
      clearTimeout(tid);
      console.error("fetchAllContacts error:", e);
      break;
    }
  } while (pageToken);

  return all;
}

// Fetch email interactions — only NEW ones since lastSyncedAt to avoid double-counting.
async function fetchEmailInteractions(
  grantId: string,
  nylasApiKey: string,
  lastSyncedAt: string | null,
): Promise<Map<string, { count: number; lastAt: string; summary: string }>> {
  const map = new Map<string, { count: number; lastAt: string; summary: string }>();
  try {
    // If we have a prior sync date, only fetch since then. Otherwise last 30 days.
    const cutoff = lastSyncedAt
      ? Math.floor(new Date(lastSyncedAt).getTime() / 1000)
      : Math.floor((Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000);
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 12000);
    const params = new URLSearchParams({ limit: "200", received_after: String(cutoff) });
    const res = await fetch(
      `${NYLAS_BASE}/v3/grants/${grantId}/messages?${params.toString()}`,
      { headers: { Authorization: `Bearer ${nylasApiKey}` }, signal: ctrl.signal }
    );
    clearTimeout(tid);
    if (!res.ok) return map;
    const data = await res.json();

    for (const msg of data.data || []) {
      const fromPerson = (msg.from || [])[0];
      if (!fromPerson?.email) continue;
      const email = fromPerson.email.toLowerCase();
      const ts = msg.date ? new Date(msg.date * 1000).toISOString() : new Date().toISOString();
      const existing = map.get(email);
      map.set(email, {
        count: (existing?.count || 0) + 1,
        lastAt: !existing || existing.lastAt < ts ? ts : existing.lastAt,
        summary: !existing || existing.lastAt < ts
          ? (msg.subject ? `Email: ${msg.subject}` : "Email")
          : existing.summary,
      });
    }
  } catch (e) {
    console.error("Email interaction fetch error:", e);
  }
  return map;
}

// Extract unique attendees from calendar events (last 90 days).
async function fetchCalendarAttendees(
  grantId: string,
  nylasApiKey: string,
  selfEmail: string,
): Promise<Map<string, { name: string; lastAt: string; summary: string }>> {
  const map = new Map<string, { name: string; lastAt: string; summary: string }>();
  try {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 10000);
    const start = Math.floor((Date.now() - 90 * 24 * 60 * 60 * 1000) / 1000);
    const end = Math.floor(Date.now() / 1000);
    const params = new URLSearchParams({
      calendar_id: "primary",
      start: String(start),
      end: String(end),
      limit: "100",
    });
    const res = await fetch(
      `${NYLAS_BASE}/v3/grants/${grantId}/events?${params.toString()}`,
      { headers: { Authorization: `Bearer ${nylasApiKey}` }, signal: ctrl.signal }
    );
    clearTimeout(tid);
    if (!res.ok) return map;
    const data = await res.json();

    for (const event of data.data || []) {
      const when = event.when || {};
      const lastAt = when.start_time
        ? new Date(when.start_time * 1000).toISOString()
        : (when.start_date ? when.start_date + "T00:00:00Z" : new Date().toISOString());
      const summary = event.title ? `Meeting: ${event.title}` : "Calendar event";

      for (const p of event.participants || []) {
        if (!p.email) continue;
        const email = p.email.toLowerCase();
        if (email === selfEmail.toLowerCase()) continue; // skip self
        const existing = map.get(email);
        if (!existing || existing.lastAt < lastAt) {
          map.set(email, { name: p.name || p.email.split("@")[0], lastAt, summary });
        }
      }
    }
  } catch (e) {
    console.error("fetchCalendarAttendees error:", e);
  }
  return map;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
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
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const nylasApiKey = Deno.env.get("NYLAS_API_KEY")!;
    const grants = await getNylasGrants(admin, user.id);

    if (!grants.length) {
      return new Response(
        JSON.stringify({ ok: true, synced: 0, message: "No Google account connected" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch last sync time to avoid double-counting interactions
    const { data: syncMeta } = await admin
      .from("contacts")
      .select("updated_at")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const lastSyncedAt: string | null = syncMeta?.updated_at || null;

    let totalSynced = 0;

    for (const grant of grants) {
      const [contacts, interactions, calendarAttendees] = await Promise.all([
        fetchAllContacts(grant.grantId, nylasApiKey),
        fetchEmailInteractions(grant.grantId, nylasApiKey, lastSyncedAt),
        fetchCalendarAttendees(grant.grantId, nylasApiKey, grant.email),
      ]);

      // Build unified upsert list: Google Contacts + calendar attendees
      const toUpsert: Array<{ email: string; name: string; company?: string | null; role?: string | null; phone?: string | null; source: "contacts" | "calendar" }> = [];

      for (const contact of contacts) {
        const emails: Array<{ email: string; type?: string }> = contact.emails || [];
        if (!emails.length) continue;
        const primary = emails.find((e) => e.type === "work") || emails.find((e) => e.type === "home") || emails[0];
        const email = primary.email?.toLowerCase();
        if (!email || !email.includes("@")) continue;
        const name = contact.display_name || [contact.given_name, contact.surname].filter(Boolean).join(" ") || email.split("@")[0];
        const phones: Array<{ number: string; type?: string }> = contact.phone_numbers || [];
        const phone = (phones.find((p) => p.type === "work") || phones[0])?.number || null;
        toUpsert.push({ email, name, company: contact.company_name || null, role: contact.job_title || null, phone, source: "contacts" });
      }

      // Add calendar attendees not already in Google Contacts
      const contactEmails = new Set(toUpsert.map((c) => c.email));
      for (const [email, att] of calendarAttendees) {
        if (!contactEmails.has(email)) {
          toUpsert.push({ email, name: att.name, company: null, role: null, phone: null, source: "calendar" });
        }
      }

      for (const item of toUpsert) {
        const { data: existing } = await admin
          .from("contacts")
          .select("id, name, interaction_count, is_vip, notes, tags, last_interaction_at")
          .eq("user_id", user.id)
          .eq("email", item.email)
          .maybeSingle();

        const emailInteraction = interactions.get(item.email);
        const calInteraction = calendarAttendees.get(item.email);

        // Pick the most recent interaction across email + calendar
        let latestInteraction: { lastAt: string; summary: string; source: string } | null = null;
        if (emailInteraction) latestInteraction = { lastAt: emailInteraction.lastAt, summary: emailInteraction.summary, source: "email" };
        if (calInteraction && (!latestInteraction || calInteraction.lastAt > latestInteraction.lastAt)) {
          latestInteraction = { lastAt: calInteraction.lastAt, summary: calInteraction.summary, source: "calendar" };
        }

        const payload: Record<string, any> = {
          user_id: user.id,
          email: item.email,
          name: existing?.name || item.name,
          updated_at: new Date().toISOString(),
        };

        // Only overwrite company/role from Google Contacts source (calendar doesn't have these)
        if (item.source === "contacts") {
          payload.company = item.company;
          payload.role = item.role;
          if (item.phone) payload.phone = item.phone;
        }

        if (latestInteraction) {
          // Only update last_interaction if newer than what we have
          const existingLastAt = existing?.last_interaction_at;
          if (!existingLastAt || latestInteraction.lastAt > existingLastAt) {
            payload.last_interaction_at = latestInteraction.lastAt;
            payload.last_interaction_source = latestInteraction.source;
            payload.last_interaction_summary = latestInteraction.summary;
          }
          // Increment count only by new interactions found since last sync (not cumulative re-count)
          if (emailInteraction) {
            payload.interaction_count = (existing?.interaction_count || 0) + emailInteraction.count;
          }
        }

        if (existing) {
          await admin.from("contacts").update(payload).eq("id", existing.id);
        } else {
          await admin.from("contacts").insert(payload);
        }
        totalSynced++;
      }
    }

    return new Response(
      JSON.stringify({ ok: true, synced: totalSynced }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e: any) {
    console.error("contacts-sync error:", e);
    return new Response(
      JSON.stringify({ error: e.message || "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
