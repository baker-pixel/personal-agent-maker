-- ============================================================
-- email_metadata: persistent store for AI-triaged emails
-- Stores only metadata + AI outputs, never raw email body
-- ============================================================
CREATE TABLE IF NOT EXISTS public.email_metadata (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nylas_message_id  text NOT NULL,
  nylas_thread_id   text,
  from_address      text NOT NULL,
  from_name         text,
  subject           text,
  received_at       timestamptz NOT NULL,
  is_unread         boolean NOT NULL DEFAULT true,
  category          text CHECK (category IN ('urgent','needs_reply','fyi','newsletter')),
  priority_score    smallint CHECK (priority_score BETWEEN 1 AND 10),
  ai_summary        text,
  ai_reason         text,
  processed_at      timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, nylas_message_id)
);

CREATE INDEX IF NOT EXISTS email_metadata_user_received_idx
  ON public.email_metadata (user_id, received_at DESC);

CREATE INDEX IF NOT EXISTS email_metadata_user_category_idx
  ON public.email_metadata (user_id, category, priority_score DESC);

CREATE INDEX IF NOT EXISTS email_metadata_unprocessed_idx
  ON public.email_metadata (user_id, processed_at)
  WHERE processed_at IS NULL;

ALTER TABLE public.email_metadata ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own email_metadata"
  ON public.email_metadata FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Service role handles all writes from edge functions

-- ============================================================
-- email_processing_queue: webhook → AI worker pipeline
-- One row per incoming message; deduped on nylas_message_id
-- ============================================================
CREATE TABLE IF NOT EXISTS public.email_processing_queue (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nylas_message_id  text NOT NULL,
  grant_id          text NOT NULL,
  status            text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','processing','done','failed')),
  attempts          smallint NOT NULL DEFAULT 0,
  error_message     text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (nylas_message_id)
);

-- Partial index: only rows the worker needs to scan
CREATE INDEX IF NOT EXISTS email_processing_queue_pending_idx
  ON public.email_processing_queue (created_at)
  WHERE status = 'pending';

ALTER TABLE public.email_processing_queue ENABLE ROW LEVEL SECURITY;

-- No authenticated access; service role only

-- ============================================================
-- Extend draft_actions: add Nylas ID + link to email_metadata
-- Keeps full backward compat with existing approval inbox
-- ============================================================
ALTER TABLE public.draft_actions
  ADD COLUMN IF NOT EXISTS nylas_message_id    text,
  ADD COLUMN IF NOT EXISTS email_metadata_id   uuid
    REFERENCES public.email_metadata(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS draft_actions_nylas_message_id_idx
  ON public.draft_actions (nylas_message_id)
  WHERE nylas_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS draft_actions_email_metadata_id_idx
  ON public.draft_actions (email_metadata_id)
  WHERE email_metadata_id IS NOT NULL;

-- ============================================================
-- Enable Realtime for email_metadata
-- Frontend subscribes for instant triaged-inbox updates
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.email_metadata;
