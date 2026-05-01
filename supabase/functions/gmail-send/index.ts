import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

async function getValidToken(userId: string) {
  const adminClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { data: tokenRow, error } = await adminClient
    .from("google_oauth_tokens")
    .select("access_token, refresh_token, token_expires_at, email")
    .eq("user_id", userId)
    .eq("provider", "gmail")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !tokenRow) {
    const e = new Error("Gmail not connected");
    (e as any).code = "NOT_CONNECTED";
    throw e;
  }

  const expiresAt = new Date(tokenRow.token_expires_at);
  if (expiresAt > new Date(Date.now() + 60000)) {
    return tokenRow.access_token;
  }

  if (!tokenRow.refresh_token) {
    const e = new Error("Re-authentication required");
    (e as any).code = "RECONNECT_REQUIRED";
    throw e;
  }

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
  if (!response.ok || data.error) {
    if (data.error === "invalid_grant") {
      // Refresh token revoked — drop the row so the user is forced to reconnect.
      let dq = adminClient
        .from("google_oauth_tokens")
        .delete()
        .eq("user_id", userId)
        .eq("provider", "gmail");
      if (tokenRow.email) dq = dq.eq("email", tokenRow.email);
      await dq;
      const e = new Error("Your Gmail session has expired. Please reconnect your account.");
      (e as any).code = "RECONNECT_REQUIRED";
      throw e;
    }
    throw new Error(data.error_description || data.error || "Token refresh failed");
  }

  let updateQuery = adminClient
    .from("google_oauth_tokens")
    .update({
      access_token: data.access_token,
      token_expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("provider", "gmail");
  if (tokenRow.email) updateQuery = updateQuery.eq("email", tokenRow.email);
  await updateQuery;

  return data.access_token;
}

function buildRawEmail(to: string, subject: string, body: string, threadId?: string, inReplyTo?: string): string {
  const lines: string[] = [];
  lines.push(`To: ${to}`);
  lines.push(`Subject: ${subject}`);
  lines.push("Content-Type: text/plain; charset=UTF-8");
  if (inReplyTo) {
    lines.push(`In-Reply-To: ${inReplyTo}`);
    lines.push(`References: ${inReplyTo}`);
  }
  lines.push("");
  lines.push(body);

  const raw = lines.join("\r\n");
  // Base64url encode
  const encoded = btoa(unescape(encodeURIComponent(raw)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return encoded;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const userId = claimsData.claims.sub as string;

    const { draftId } = await req.json();
    if (!draftId) {
      return new Response(
        JSON.stringify({ error: "draftId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch the draft using service role to bypass RLS timing issues
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: draft, error: draftError } = await adminClient
      .from("draft_actions")
      .select("*")
      .eq("id", draftId)
      .eq("user_id", userId)
      .single();

    if (draftError || !draft) {
      return new Response(
        JSON.stringify({ error: "Draft not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (draft.status !== "pending") {
      return new Response(
        JSON.stringify({ error: "Draft already processed" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get Gmail token
    const accessToken = await getValidToken(userId);

    // Build and send the email
    const raw = buildRawEmail(
      draft.to_email,
      draft.subject,
      draft.body,
      draft.thread_id,
      draft.in_reply_to
    );

    const sendUrl = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";
    const sendBody: Record<string, string> = { raw };
    if (draft.thread_id) {
      sendBody.threadId = draft.thread_id;
    }

    const sendRes = await fetch(sendUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(sendBody),
    });

    const sendData = await sendRes.json();

    if (!sendRes.ok) {
      // Update draft status to failed
      await adminClient
        .from("draft_actions")
        .update({ status: "failed", updated_at: new Date().toISOString() })
        .eq("id", draftId);

      return new Response(
        JSON.stringify({ error: sendData.error?.message || "Failed to send email" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update draft status to sent
    await adminClient
      .from("draft_actions")
      .update({
        status: "sent",
        gmail_message_id: sendData.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", draftId);

    return new Response(
      JSON.stringify({ success: true, messageId: sendData.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
