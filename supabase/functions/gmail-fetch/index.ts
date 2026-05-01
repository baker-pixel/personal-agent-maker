import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

async function deleteStoredToken(
  adminClient: any,
  userId: string,
  email: string | null,
  provider: string
) {
  let deleteQuery = adminClient
    .from("google_oauth_tokens")
    .delete()
    .eq("user_id", userId)
    .eq("provider", provider);

  if (email) deleteQuery = deleteQuery.eq("email", email);

  const { error } = await deleteQuery;
  if (error) console.error("Failed to delete invalid Google token row:", error);
}

async function refreshAccessToken(
  adminClient: any,
  userId: string,
  refreshToken: string,
  email: string | null,
  provider: string
): Promise<string> {
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: Deno.env.get("GOOGLE_CLIENT_ID")!,
      client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET")!,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  const data = await tokenResponse.json();
  const googleError = data?.error ? String(data.error) : null;
  if (!tokenResponse.ok || googleError) {
    console.error("Token refresh failed:", googleError ?? tokenResponse.status, data?.error_description ?? data);
    if (googleError === "invalid_grant") {
      await deleteStoredToken(adminClient, userId, email, provider);
      throw new Error("RECONNECT_REQUIRED");
    }
    throw new Error("REFRESH_FAILED");
  }

  if (!data.access_token || !data.expires_in) {
    console.error("Token refresh response missing access_token/expires_in:", data);
    throw new Error("REFRESH_FAILED");
  }

  const newAccessToken = data.access_token as string;
  const newExpiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString();

  let updateQuery = adminClient
    .from("google_oauth_tokens")
    .update({
      access_token: newAccessToken,
      token_expires_at: newExpiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("provider", provider);

  if (email) updateQuery = updateQuery.eq("email", email);

  const { error: updateError } = await updateQuery;
  if (updateError) {
    console.error("Failed to update refreshed token:", updateError);
    throw new Error("DB_UPDATE_FAILED");
  }

  console.log("Access token refreshed for user:", userId, "provider:", provider);
  return newAccessToken;
}

async function getValidAccessToken(adminClient: any, userId: string) {
  const { data: tokenRow, error: fetchError } = await adminClient
    .from("google_oauth_tokens")
    .select("access_token, refresh_token, token_expires_at, email")
    .eq("user_id", userId)
    .eq("provider", "gmail")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (fetchError) {
    console.error("DB fetch error:", fetchError);
    throw new Error("DB_FETCH_FAILED");
  }
  if (!tokenRow) {
    console.error("No Gmail token row found for user:", userId);
    throw new Error("NOT_CONNECTED");
  }
  if (!tokenRow.refresh_token) {
    console.error("No refresh_token stored — user must reconnect");
    await deleteStoredToken(adminClient, userId, tokenRow.email, "gmail");
    throw new Error("RECONNECT_REQUIRED");
  }

  const expiresAt = new Date(tokenRow.token_expires_at).getTime();
  const isExpired = !Number.isFinite(expiresAt) || Date.now() >= expiresAt - 60_000;

  if (isExpired) {
    console.log("Gmail access token expired — refreshing...");
    const newAccessToken = await refreshAccessToken(
      adminClient,
      userId,
      tokenRow.refresh_token,
      tokenRow.email,
      "gmail"
    );
    return { accessToken: newAccessToken, email: tokenRow.email, refreshToken: tokenRow.refresh_token };
  }

  return { accessToken: tokenRow.access_token, email: tokenRow.email, refreshToken: tokenRow.refresh_token };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Unauthorized", code: "UNAUTHORIZED" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: { user }, error: userError } = await adminClient.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (userError || !user) {
      console.error("Auth error:", userError);
      return new Response(
        JSON.stringify({ error: "Unauthorized", code: "UNAUTHORIZED" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let accessToken: string;
    try {
      const result = await getValidAccessToken(adminClient, user.id);
      accessToken = result.accessToken;
    } catch (tokenError: any) {
      if (tokenError.message === "NOT_CONNECTED") {
        return new Response(
          JSON.stringify({ error: "Gmail not connected", code: "NOT_CONNECTED" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (tokenError.message === "RECONNECT_REQUIRED" || tokenError.message === "REFRESH_FAILED") {
        return new Response(
          JSON.stringify({
            error: "Your Gmail session has expired. Please reconnect your account.",
            code: "RECONNECT_REQUIRED",
          }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      throw tokenError;
    }

    const url = new URL(req.url);
    const messageId = url.searchParams.get("messageId");

    // Single message full-body fetch
    if (messageId) {
      const msgRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (msgRes.status === 401) {
        return new Response(
          JSON.stringify({
            error: "Your Gmail session has expired. Please reconnect your account.",
            code: "RECONNECT_REQUIRED",
          }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const msgData = await msgRes.json();

      const headers = msgData.payload?.headers || [];
      const getHeader = (name: string) =>
        headers.find((h: { name: string }) => h.name.toLowerCase() === name.toLowerCase())?.value || "";

      function extractBody(payload: any): string {
        if (payload.body?.data) {
          return atob(payload.body.data.replace(/-/g, "+").replace(/_/g, "/"));
        }
        if (payload.parts) {
          const textPart = payload.parts.find((p: any) => p.mimeType === "text/plain");
          if (textPart?.body?.data) {
            return atob(textPart.body.data.replace(/-/g, "+").replace(/_/g, "/"));
          }
          const htmlPart = payload.parts.find((p: any) => p.mimeType === "text/html");
          if (htmlPart?.body?.data) {
            return atob(htmlPart.body.data.replace(/-/g, "+").replace(/_/g, "/"));
          }
          for (const part of payload.parts) {
            const nested = extractBody(part);
            if (nested) return nested;
          }
        }
        return "";
      }

      const body = extractBody(msgData.payload);
      const isHtml = body.trim().startsWith("<");

      return new Response(
        JSON.stringify({
          id: msgData.id,
          threadId: msgData.threadId,
          snippet: msgData.snippet,
          from: getHeader("From"),
          to: getHeader("To"),
          subject: getHeader("Subject"),
          date: getHeader("Date"),
          body,
          isHtml,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // List emails
    const maxResults = url.searchParams.get("maxResults") || "50";
    const query = url.searchParams.get("q") || "in:inbox newer_than:2d";

    const listRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${maxResults}&q=${encodeURIComponent(query)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (listRes.status === 401) {
      return new Response(
        JSON.stringify({
          error: "Your Gmail session has expired. Please reconnect your account.",
          code: "RECONNECT_REQUIRED",
        }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const listData = await listRes.json();

    if (!listData.messages || listData.messages.length === 0) {
      return new Response(
        JSON.stringify({ emails: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const messageIds = listData.messages.slice(0, 40);
    const emails = await Promise.all(
      messageIds.map(async (msg: { id: string }) => {
        const msgRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        const msgData = await msgRes.json();

        const headers = msgData.payload?.headers || [];
        const getHeader = (name: string) =>
          headers.find((h: { name: string }) => h.name.toLowerCase() === name.toLowerCase())?.value || "";

        return {
          id: msgData.id,
          threadId: msgData.threadId,
          snippet: msgData.snippet,
          from: getHeader("From"),
          to: getHeader("To"),
          subject: getHeader("Subject"),
          date: getHeader("Date"),
          labelIds: msgData.labelIds || [],
          isUnread: (msgData.labelIds || []).includes("UNREAD"),
        };
      })
    );

    return new Response(
      JSON.stringify({ emails }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("gmail-fetch fatal error:", error?.message || error);
    return new Response(
      JSON.stringify({ error: error?.message || "Internal server error", code: "INTERNAL_ERROR" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
