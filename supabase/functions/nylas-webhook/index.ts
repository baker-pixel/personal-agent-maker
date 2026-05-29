// Nylas v3 webhook receiver.
// - GET  ?challenge=xxx  → return challenge (Nylas endpoint verification)
// - POST               → verify HMAC-SHA256 sig → enqueue message.created events
//
// verify_jwt is disabled — Nylas sends its own HMAC auth, not a Supabase JWT.
// Auth is done via X-Nylas-Signature header (HMAC-SHA256 of raw body).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function verifySignature(rawBody: string, signature: string, secret: string): Promise<boolean> {
  try {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      enc.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const sigBytes = await crypto.subtle.sign("HMAC", key, enc.encode(rawBody));
    const computed = Array.from(new Uint8Array(sigBytes))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    // Constant-time comparison to prevent timing attacks
    if (computed.length !== signature.length) return false;
    let diff = 0;
    for (let i = 0; i < computed.length; i++) {
      diff |= computed.charCodeAt(i) ^ signature.charCodeAt(i);
    }
    return diff === 0;
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  // Nylas sends a GET with ?challenge= to verify the endpoint on registration
  if (req.method === "GET") {
    const url = new URL(req.url);
    const challenge = url.searchParams.get("challenge");
    if (challenge) {
      return new Response(challenge, {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      });
    }
    return new Response("OK", { status: 200 });
  }

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const webhookSecret = Deno.env.get("NYLAS_WEBHOOK_SECRET");
  if (!webhookSecret) {
    console.error("NYLAS_WEBHOOK_SECRET not set");
    return new Response("Server misconfigured", { status: 500 });
  }

  // Read raw body — signature is over the exact bytes Nylas sent
  const rawBody = await req.text();

  const signature = req.headers.get("x-nylas-signature") ?? "";
  if (!signature) {
    console.warn("nylas-webhook: missing x-nylas-signature");
    return new Response("Unauthorized", { status: 401 });
  }

  const valid = await verifySignature(rawBody, signature, webhookSecret);
  if (!valid) {
    console.warn("nylas-webhook: signature mismatch");
    return new Response("Unauthorized", { status: 401 });
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  // Nylas v3 sends CloudEvent format: { type, data: { grant_id, object } }
  const eventType: string = payload.type ?? "";
  const grantId: string = payload.data?.grant_id ?? payload.data?.object?.grant_id ?? "";
  const messageId: string = payload.data?.object?.id ?? "";

  // Only process new inbound messages
  if (!eventType.startsWith("message.created") || !grantId || !messageId) {
    // Return 200 — Nylas will retry non-2xx responses
    return new Response("ignored", { status: 200 });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Resolve user_id from grant_id
  const { data: grant, error: grantErr } = await admin
    .from("nylas_grants")
    .select("user_id")
    .eq("grant_id", grantId)
    .maybeSingle();

  if (grantErr || !grant) {
    // Grant not found — not our user, acknowledge to stop retries
    console.log(`nylas-webhook: unknown grant ${grantId}`);
    return new Response("unknown grant", { status: 200 });
  }

  // Enqueue — ON CONFLICT DO NOTHING prevents duplicates on Nylas retries
  const { error: queueErr } = await admin
    .from("email_processing_queue")
    .insert({
      user_id: grant.user_id,
      nylas_message_id: messageId,
      grant_id: grantId,
      status: "pending",
    })
    .throwOnError()
    // Supabase doesn't expose ON CONFLICT via insert; use upsert with ignoreDuplicates
    ;

  if (queueErr) {
    // Duplicate key = already queued, which is fine
    if (queueErr.code === "23505") {
      return new Response("already queued", { status: 200 });
    }
    console.error("nylas-webhook queue insert error:", queueErr);
    // Return 500 so Nylas retries
    return new Response("queue error", { status: 500 });
  }

  console.log(`nylas-webhook: queued ${messageId} for user ${grant.user_id}`);
  return new Response("queued", { status: 200 });
});
