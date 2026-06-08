-- Utility function to fully delete a user and all their data.
-- Deletes all public table rows by user_id, then removes the auth user.
-- Usage (SQL editor, service role only):
--   SELECT delete_user_completely('<user-uuid>');

CREATE OR REPLACE FUNCTION public.delete_user_completely(target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  DELETE FROM public.push_subscriptions        WHERE user_id = target_user_id;
  DELETE FROM public.nylas_grants               WHERE user_id = target_user_id;
  DELETE FROM public.google_oauth_tokens        WHERE user_id = target_user_id;
  DELETE FROM public.google_oauth_token_metadata WHERE user_id = target_user_id;
  DELETE FROM public.email_triage_preferences   WHERE user_id = target_user_id;
  DELETE FROM public.email_processing_queue     WHERE user_id = target_user_id;
  DELETE FROM public.email_reminders            WHERE user_id = target_user_id;
  DELETE FROM public.email_metadata             WHERE user_id = target_user_id;
  DELETE FROM public.draft_actions              WHERE user_id = target_user_id;
  DELETE FROM public.daily_briefings            WHERE user_id = target_user_id;
  DELETE FROM public.contact_reminders          WHERE user_id = target_user_id;
  DELETE FROM public.contacts                   WHERE user_id = target_user_id;
  DELETE FROM public.leads                      WHERE user_id = target_user_id;
  DELETE FROM public.lead_rules                 WHERE user_id = target_user_id;
  DELETE FROM public.scheduling_preferences     WHERE user_id = target_user_id;
  DELETE FROM public.action_items               WHERE user_id = target_user_id;
  DELETE FROM public.steno_sessions             WHERE user_id = target_user_id;
  -- chat_messages cascade-deletes when conversations are removed
  DELETE FROM public.chat_conversations         WHERE user_id = target_user_id;
  DELETE FROM public.user_preferences           WHERE user_id = target_user_id;
  -- Remove the auth user last (invalidates all active sessions immediately)
  DELETE FROM auth.users WHERE id = target_user_id;
END;
$$;

-- Restrict to service role only — no direct user invocation
REVOKE ALL ON FUNCTION public.delete_user_completely(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_user_completely(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.delete_user_completely(uuid) FROM authenticated;
