-- Link action_items back to the source email_metadata row.
-- Nullable (manual tasks and calendar tasks have no source email).
-- ON DELETE SET NULL: archiving an email doesn't cascade-delete its tasks.

ALTER TABLE public.action_items
  ADD COLUMN IF NOT EXISTS email_metadata_id UUID
  REFERENCES public.email_metadata(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_action_items_email_metadata_id
  ON public.action_items(email_metadata_id)
  WHERE email_metadata_id IS NOT NULL;
