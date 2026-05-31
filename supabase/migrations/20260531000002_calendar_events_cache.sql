-- Cache table for Nylas calendar events.
-- task-extract checks this before hitting the Nylas API (15-min TTL).
-- Rows are replaced wholesale on cache miss, so no FK to action_items needed.

CREATE TABLE public.calendar_events (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_id    TEXT        NOT NULL,
  title       TEXT        NOT NULL,
  start_time  TIMESTAMPTZ,
  attendees   TEXT,
  description TEXT,
  fetched_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT calendar_events_user_event_unique UNIQUE (user_id, event_id)
);

ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own calendar events"
  ON public.calendar_events FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Covering index: freshness check + full row reads both use (user_id, fetched_at)
CREATE INDEX idx_calendar_events_user_fetched
  ON public.calendar_events(user_id, fetched_at DESC);
