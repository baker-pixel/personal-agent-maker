import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// --- Token helpers ---
async function getValidToken(userId: string, provider: string) {
  const adminClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { data: tokenRow, error } = await adminClient
    .from("google_oauth_tokens")
    .select("*")
    .eq("user_id", userId)
    .eq("provider", provider)
    .maybeSingle();

  if (error || !tokenRow) return null;

  const expiresAt = new Date(tokenRow.token_expires_at);
  if (expiresAt > new Date(Date.now() + 60000)) {
    return tokenRow.access_token;
  }

  if (!tokenRow.refresh_token) return null;

  try {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: Deno.env.get("GOOGLE_CLIENT_ID")!,
        client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET")!,
        refresh_token: tokenRow.refresh_token,
        grant_type: "refresh_token",
      }),
    });
    const data = await response.json();
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

// --- Gmail fetch ---
async function fetchRecentEmails(accessToken: string, maxResults = 10) {
  try {
    const listRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${maxResults}&q=is:inbox`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const listData = await listRes.json();
    if (!listData.messages?.length) return [];

    const emails = await Promise.all(
      listData.messages.slice(0, maxResults).map(async (msg: { id: string }) => {
        const msgRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        const msgData = await msgRes.json();
        const headers = msgData.payload?.headers || [];
        const getHeader = (name: string) =>
          headers.find((h: { name: string }) => h.name.toLowerCase() === name.toLowerCase())?.value || "";

        return {
          from: getHeader("From"),
          subject: getHeader("Subject"),
          date: getHeader("Date"),
          snippet: msgData.snippet,
          isUnread: (msgData.labelIds || []).includes("UNREAD"),
        };
      })
    );
    return emails;
  } catch (e) {
    console.error("Gmail fetch error:", e);
    return [];
  }
}

// --- Calendar fetch ---
async function fetchTodayEvents(accessToken: string) {
  try {
    const now = new Date();
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);

    const params = new URLSearchParams({
      timeMin: now.toISOString(),
      timeMax: endOfDay.toISOString(),
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "15",
    });

    const calRes = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params.toString()}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const calData = await calRes.json();
    if (calData.error) return [];

    return (calData.items || []).map((event: any) => ({
      summary: event.summary || "(No title)",
      start: event.start?.dateTime || event.start?.date,
      end: event.end?.dateTime || event.end?.date,
      attendees: (event.attendees || []).map((a: any) => a.displayName || a.email).join(", "),
      location: event.location || "",
    }));
  } catch (e) {
    console.error("Calendar fetch error:", e);
    return [];
  }
}

// --- Detect if user is asking about real data ---
function needsRealData(latestMessage: string): { emails: boolean; calendar: boolean } {
  const lower = latestMessage.toLowerCase();
  const emailKeywords = ["email", "inbox", "mail", "triage", "follow-up", "follow up", "reply", "replies", "unread", "urgent email", "briefing", "brief me", "fill me in", "catch me up", "what did i miss", "what's new", "update me", "morning briefing", "what's going on", "what happened"];
  const calKeywords = ["meeting", "calendar", "schedule", "agenda", "today", "briefing", "brief me", "fill me in", "catch me up", "what's next", "morning briefing", "what's going on", "prep me"];

  return {
    emails: emailKeywords.some((k) => lower.includes(k)),
    calendar: calKeywords.some((k) => lower.includes(k)),
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, agentName } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const now = new Date();
    const timeOfDay = now.getHours() < 12 ? "morning" : now.getHours() < 17 ? "afternoon" : "evening";
    const today = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

    // Check if we need real data
    const latestUserMsg = messages.filter((m: any) => m.role === "user").pop()?.content || "";
    const dataNeeds = needsRealData(latestUserMsg);

    // Try to get user context from auth header
    let realDataContext = "";
    const authHeader = req.headers.get("Authorization");

    if (authHeader && (dataNeeds.emails || dataNeeds.calendar)) {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } }
      );

      const { data: { user } } = await supabase.auth.getUser();

      if (user) {
        const [gmailToken, calToken] = await Promise.all([
          dataNeeds.emails ? getValidToken(user.id, "gmail") : null,
          dataNeeds.calendar ? getValidToken(user.id, "google-calendar") : null,
        ]);

        const [emails, events] = await Promise.all([
          gmailToken ? fetchRecentEmails(gmailToken, 10) : [],
          calToken ? fetchTodayEvents(calToken) : [],
        ]);

        if (emails.length > 0) {
          realDataContext += "\n\n--- REAL INBOX DATA (from user's actual Gmail) ---\n";
          emails.forEach((e: any, i: number) => {
            realDataContext += `\n[Email ${i + 1}] ${e.isUnread ? "🔵 UNREAD" : ""}
From: ${e.from}
Subject: ${e.subject}
Date: ${e.date}
Preview: ${e.snippet}\n`;
          });
          realDataContext += "\n--- END INBOX DATA ---\n";
        } else if (dataNeeds.emails) {
          realDataContext += "\n\n[Gmail is not connected. Let the user know they need to connect Gmail via Integrations (gear icon > Integrations) to get real email data.]\n";
        }

        if (events.length > 0) {
          realDataContext += "\n\n--- REAL CALENDAR DATA (from user's actual Google Calendar) ---\n";
          events.forEach((e: any, i: number) => {
            realDataContext += `\n[Event ${i + 1}]
Title: ${e.summary}
Time: ${e.start} – ${e.end}
Attendees: ${e.attendees || "None"}
Location: ${e.location || "None"}\n`;
          });
          realDataContext += "\n--- END CALENDAR DATA ---\n";
        } else if (dataNeeds.calendar) {
          realDataContext += "\n\n[Google Calendar is not connected. Let the user know they need to connect Google Calendar via Integrations (gear icon > Integrations) to get real calendar data.]\n";
        }
      }
    }

    const systemPrompt = `You are ${agentName || "Normy Agent"}, an AI-powered executive assistant and orchestrator. Today is ${today}, ${timeOfDay}.

## Your Role
You are the SINGLE point of contact. You are proactive, organized, and action-oriented. You anticipate needs and take initiative.

## CRITICAL RULE
When the user asks about their emails, meetings, calendar, or anything related to their real data:
- ONLY reference the REAL DATA provided below. Never invent fake emails, fake meetings, or fake contacts.
- If no real data is provided, tell the user to connect their accounts via Integrations (the plug icon in the top right).
- If real data IS provided, summarize it clearly with sender names, subjects, and actionable insights.

## Capabilities
- **Email Triage**: Categorize real inbox as Urgent / Needs Reply / FYI / Newsletter. Draft responses.
- **Follow-Up Tracking**: Identify emails needing follow-up
- **Meeting Prep**: Provide context for upcoming meetings
- **Smart Scheduling**: Suggest optimal meeting times
- **Weekly Reports**: Generate weekly summaries
- **Document Summaries**: Summarize any pasted text
- **General EA tasks**: Drafting, planning, organizing, decision-making support

## Response Style
- Be concise. Use markdown with headers, bullets, bold.
- Use emoji for visual scanning (📧 ✅ ⚠️ 📅 💡)
- Always suggest next steps
- Confirm before taking significant actions
${realDataContext}`;

    const response = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: systemPrompt },
            ...messages,
          ],
          stream: true,
        }),
      }
    );

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add funds in Settings > Workspace > Usage." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const text = await response.text();
      console.error("AI gateway error:", response.status, text);
      return new Response(
        JSON.stringify({ error: "AI service unavailable" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("chat error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
