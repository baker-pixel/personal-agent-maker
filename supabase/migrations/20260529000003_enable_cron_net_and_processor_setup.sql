-- Enable extensions — let each use its default schema
CREATE EXTENSION IF NOT EXISTS pg_cron;  -- installs into pg_catalog / cron schema
CREATE EXTENSION IF NOT EXISTS pg_net;   -- installs into net schema

-- ============================================================
-- Atomic job claim: FOR UPDATE SKIP LOCKED prevents two
-- concurrent cron runs from processing the same job.
-- ============================================================
CREATE OR REPLACE FUNCTION public.claim_email_processing_jobs(batch_size int DEFAULT 10)
RETURNS SETOF public.email_processing_queue
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.email_processing_queue
  SET
    status   = 'processing',
    attempts = attempts + 1
  WHERE id IN (
    SELECT id
    FROM   public.email_processing_queue
    WHERE  status   = 'pending'
    AND    attempts < 3
    ORDER  BY created_at
    LIMIT  batch_size
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
$$;

REVOKE ALL   ON FUNCTION public.claim_email_processing_jobs(int) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.claim_email_processing_jobs(int) TO service_role;

-- ============================================================
-- pg_cron: run email-processor every 2 minutes
--
-- Bearer token is read from a DB GUC — set it ONCE in the
-- Supabase SQL editor (not in migrations — keeps key out of git):
--
--   ALTER DATABASE postgres
--     SET "app.supabase_service_role_key" = '<your-service-role-key>';
--
-- Find your service role key in:
--   Supabase Dashboard → Settings → API → service_role key
-- ============================================================
SELECT cron.schedule(
  'email-processor-every-2-min',
  '*/2 * * * *',
  $cron$
  SELECT net.http_post(
    url     := 'https://ybjrqyyarfxskiavbozs.supabase.co/functions/v1/email-processor',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key', true)
    ),
    body    := '{}'::jsonb
  ) AS request_id;
  $cron$
);
