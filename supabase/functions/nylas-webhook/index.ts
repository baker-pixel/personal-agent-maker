// Nylas v3 webhook receiver.
// - GET  ?challenge=xxx  → return challenge (Nylas endpoint verification)
// - POST               → verify HMAC-SHA256 sig → dispatch by event type
//
// verify_jwt is disabled — Nylas sends its own HMAC auth, not a Supabase JWT.
// Auth is done via X-Nylas-Signature header (HMAC-SHA256 of raw body).
//
// Handled events (prefix-matched so .truncated/.transformed variants route too):
//   message.created          → enqueue into email_processing_queue (AI worker picks up)
//   message.updated          → sync is_unread into email_metadata
//   event.created/updated/deleted → invalidate calendar_events cache for the user
//   grant.expired/deleted    → mark nylas_grants row + push-notify user to reconnect
//   grant.updated            → mark grant valid again (re-auth heals expiry)
//   contact.created/updated  → upsert into contacts (provider fields only)
// Everything else is acknowledged with 200 so Nylas doesn't retry or mark
// the endpoint as failing.

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";


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

// ── Handlers ──────────────────────────────────────────────────────────────────
// All handlers must be idempotent: Nylas retries on non-2xx, and the same
// event can arrive more than once.

type HandlerCtx = {
  admin: SupabaseClient;
  userId: string;
  grantId: string;
  object: any; // payload.data.object — untrusted provider data, never execute/interpret
};

async function enqueueMessage({ admin, userId, grantId, object }: HandlerCtx) {
  const messageId = object?.id;
  if (!messageId) return;
  // ignoreDuplicates silently skips if message already queued (Nylas retries)
  const { error } = await admin
    .from("email_processing_queue")
    .upsert(
      { user_id: userId, nylas_message_id: messageId, grant_id: grantId, status: "pending" },
      { onConflict: "user_id,nylas_message_id", ignoreDuplicates: true }
    );
  if (error) throw error;
  console.log(`nylas-webhook: queued ${messageId} for user ${userId}`);
}

// Kick the processor immediately so triage lands in seconds instead of
// waiting for the 2-minute pg_cron tick (which stays on as the safety net).
// claim_email_processing_jobs uses SKIP LOCKED, so trigger + cron overlapping
// is safe. waitUntil keeps the request alive past our response; without it
// the runtime may freeze the instance before the fetch completes.
function triggerEmailProcessor() {
  const trigger = fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/email-processor`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
    },
    body: "{}",
  }).catch((e) => console.warn("email-processor trigger failed:", e));
  // @ts-ignore EdgeRuntime is provided by the Supabase edge runtime
  if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(trigger);
}

async function patchEmailMetadata({ admin, userId, object }: HandlerCtx) {
  const messageId = object?.id;
  if (!messageId || typeof object?.unread !== "boolean") return;
  // Only sync read state for messages we've already triaged; no row → no-op
  const { error } = await admin
    .from("email_metadata")
    .update({ is_unread: object.unread })
    .eq("user_id", userId)
    .eq("nylas_message_id", messageId);
  if (error) throw error;
}

async function invalidateCalendarCache({ admin, userId }: HandlerCtx) {
  // The cache is written wholesale (delete-then-insert) by task-extract with a
  // 15-min TTL on fetched_at. Upserting a single event here would make one
  // fresh row look like a complete fresh cache and hide every other event —
  // so on any calendar change we drop the user's cache and let the next
  // reader refetch the full window from Nylas.
  const { error } = await admin
    .from("calendar_events")
    .delete()
    .eq("user_id", userId);
  if (error) throw error;

  // Signal open clients to refetch. calendar_events itself can't carry this
  // (no RLS select policy, and the cache may already be empty so the delete
  // above emits nothing) — sync_signals is in the realtime publication and
  // the calendar UI subscribes to it.
  const { error: sigErr } = await admin
    .from("sync_signals")
    .upsert(
      { user_id: userId, resource: "calendar", updated_at: new Date().toISOString() },
      { onConflict: "user_id,resource" }
    );
  if (sigErr) console.warn("nylas-webhook: sync_signals upsert failed:", sigErr.message);
  console.log(`nylas-webhook: invalidated calendar cache for user ${userId}`);
}

function notifyUser(userId: string, title: string, body: string, url: string, tag: string) {
  // Fire-and-forget, same pattern as email-triage
  fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/web-push`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
    },
    body: JSON.stringify({ user_id: userId, title, body, url, tag }),
  }).catch((e) => console.warn("web-push fire-and-forget failed:", e));
}

function makeGrantStatusHandler(status: "valid" | "expired" | "revoked") {
  return async ({ admin, userId, grantId }: HandlerCtx) => {
    const { error } = await admin
      .from("nylas_grants")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("grant_id", grantId);
    if (error) throw error;
    console.log(`nylas-webhook: grant ${grantId} → ${status}`);
    if (status !== "valid") {
      notifyUser(
        userId,
        "Google account disconnected",
        "Normy lost access to your Google account. Reconnect to keep email and calendar features working.",
        "/settings",
        "grant-expired"
      );
    }
  };
}

async function upsertContact({ admin, userId, object }: HandlerCtx) {
  // Same field mapping as contacts-sync. Only provider-owned fields are
  // written; user-owned fields (notes, tags, is_vip, interaction_*) untouched.
  const emails: Array<{ email: string; type?: string }> = object?.emails || [];
  const primary = emails.find((e) => e.type === "work") || emails.find((e) => e.type === "home") || emails[0];
  const email = primary?.email?.toLowerCase();
  if (!email || !email.includes("@")) return; // contacts are keyed on (user_id, email)

  const name =
    object.display_name ||
    [object.given_name, object.surname].filter(Boolean).join(" ") ||
    email.split("@")[0];
  const phones: Array<{ number: string; type?: string }> = object.phone_numbers || [];
  const phone = (phones.find((p) => p.type === "work") || phones[0])?.number || null;

  const { data: existing, error: selErr } = await admin
    .from("contacts")
    .select("id, name")
    .eq("user_id", userId)
    .eq("email", email)
    .maybeSingle();
  if (selErr) throw selErr;

  const payload: Record<string, any> = {
    user_id: userId,
    email,
    name: existing?.name || name,
    company: object.company_name || null,
    role: object.job_title || null,
    updated_at: new Date().toISOString(),
  };
  if (phone) payload.phone = phone;

  const { error } = existing
    ? await admin.from("contacts").update(payload).eq("id", existing.id)
    : await admin.from("contacts").insert(payload);
  if (error) throw error;
}

// contact.deleted is intentionally unhandled: the payload only carries the
// Nylas contact id, and the contacts table is keyed by email with no stored
// Nylas id — there is nothing to match the deletion against.
const handlers: Record<string, (ctx: HandlerCtx) => Promise<void>> = {
  "message.created": enqueueMessage,
  "message.updated": patchEmailMetadata,
  "event.created": invalidateCalendarCache,
  "event.updated": invalidateCalendarCache,
  "event.deleted": invalidateCalendarCache,
  "grant.expired": makeGrantStatusHandler("expired"),
  "grant.deleted": makeGrantStatusHandler("revoked"),
  "grant.updated": makeGrantStatusHandler("valid"),
  "contact.created": upsertContact,
  "contact.updated": upsertContact,
};

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
  // For grant.* events the object IS the grant, so object.id is the grant id.
  const grantId: string =
    payload.data?.grant_id ??
    payload.data?.object?.grant_id ??
    (eventType.startsWith("grant.") ? payload.data?.object?.id : undefined) ??
    "";

  // Prefix match: "message.created" also catches ".truncated"/".transformed" variants
  const handler = Object.entries(handlers).find(([prefix]) => eventType.startsWith(prefix))?.[1];

  if (!handler || !grantId) {
    // Return 200 — Nylas retries non-2xx, and sustained failures mark the endpoint failing
    return new Response("ignored", { status: 200 });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Resolve user_ids from grant_id. One grant can be connected by several
  // users (same Google account on multiple app accounts) — fan the event out
  // to all of them so every connected account stays in sync. maybeSingle()
  // here used to error on duplicates and silently drop the event.
  const { data: grantRows, error: grantErr } = await admin
    .from("nylas_grants")
    .select("user_id")
    .eq("grant_id", grantId);

  const userIds = [...new Set((grantRows ?? []).map((r) => r.user_id))];

  if (grantErr || userIds.length === 0) {
    // Grant not found — not our user, acknowledge to stop retries
    console.log(`nylas-webhook: unknown grant ${grantId} (${eventType})`);
    return new Response("unknown grant", { status: 200 });
  }

  try {
    await Promise.all(
      userIds.map((userId) =>
        handler({ admin, userId, grantId, object: payload.data?.object ?? {} })
      )
    );
  } catch (e: any) {
    console.error(`nylas-webhook: ${eventType} handler error:`, e?.message ?? e);
    // Handlers are idempotent — 503 asks Nylas to retry (3 attempts total)
    return new Response("handler error", { status: 503 });
  }
  // One processor kick per webhook delivery, after all users are enqueued
  if (eventType.startsWith("message.created")) triggerEmailProcessor();

  return new Response("ok", { status: 200 });
});
