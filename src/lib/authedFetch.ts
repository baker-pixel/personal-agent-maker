import { supabase } from "@/integrations/supabase/client";

const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const withTimeout = <T,>(p: Promise<T>, ms: number): Promise<T | null> =>
  Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), ms))]);

// After a suspend/resume the cached session is often already expired while
// auth-js's own refresh lags behind — trusting getSession() yields 401s
// (observed in edge logs: groq-stt/groq-tts 401 bursts right after resume).
// This forces the refresh when the token is dead or about to die.
export async function getFreshAccessToken(): Promise<string> {
  const session = await withTimeout(
    supabase.auth.getSession().then(({ data }) => data.session),
    3000
  );
  const expiresAtMs = (session?.expires_at ?? 0) * 1000;
  if (session && expiresAtMs - Date.now() > 30_000) return session.access_token;

  const refreshed = await withTimeout(
    supabase.auth.refreshSession().then(({ data }) => data.session),
    8000
  );
  return refreshed?.access_token ?? session?.access_token ?? ANON_KEY;
}

// fetch with supabase auth headers; on 401, refreshes the session once and
// retries. Callers keep full control of method/body/signal via init.
export async function authedFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const make = (token: string) =>
    fetch(url, {
      ...init,
      headers: {
        ...(init.headers ?? {}),
        apikey: ANON_KEY,
        Authorization: `Bearer ${token}`,
      },
    });

  let res = await make(await getFreshAccessToken());
  if (res.status === 401) {
    const refreshed = await withTimeout(
      supabase.auth.refreshSession().then(({ data }) => data.session),
      8000
    );
    if (refreshed?.access_token) res = await make(refreshed.access_token);
  }
  return res;
}
