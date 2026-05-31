// @ts-ignore npm compat
import webPush from "npm:web-push@3.6.7";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const VAPID_PUBLIC  = Deno.env.get("VAPID_PUBLIC_KEY");
  const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY");
  const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:yash.ch@navtech.io";

  if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
    return new Response(
      JSON.stringify({ error: "VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY env vars not set" }),
      { status: 500, headers: corsHeaders },
    );
  }

  webPush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let body: { user_id: string; title: string; body: string; url?: string; tag?: string };
  try { body = await req.json(); }
  catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers: corsHeaders });
  }

  const { user_id, title, body: msgBody, url = "/", tag = "normy" } = body;
  if (!user_id || !title) {
    return new Response(
      JSON.stringify({ error: "user_id and title required" }),
      { status: 400, headers: corsHeaders },
    );
  }

  const { data: subs, error } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", user_id);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
  }
  if (!subs?.length) {
    return new Response(JSON.stringify({ sent: 0, reason: "no subscriptions" }), { headers: corsHeaders });
  }

  const payload = JSON.stringify({ title, body: msgBody, url, tag });
  let sent = 0;
  const expired: string[] = [];

  await Promise.allSettled(
    subs.map(async (sub) => {
      try {
        await webPush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
          { TTL: 86400 },
        );
        sent++;
      } catch (e: any) {
        if (e?.statusCode === 410 || e?.statusCode === 404) {
          expired.push(sub.id);
        } else {
          console.error("Push send error:", e?.statusCode, e?.message);
        }
      }
    }),
  );

  if (expired.length) {
    await admin.from("push_subscriptions").delete().in("id", expired);
  }

  return new Response(
    JSON.stringify({ sent, expired: expired.length }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
