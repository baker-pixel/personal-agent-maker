
-- Add file storage path to steno sessions and create a private bucket for archived meeting text files
ALTER TABLE public.steno_sessions
  ADD COLUMN IF NOT EXISTS transcript_file_path text,
  ADD COLUMN IF NOT EXISTS archived_at timestamp with time zone;

INSERT INTO storage.buckets (id, name, public)
VALUES ('steno-transcripts', 'steno-transcripts', false)
ON CONFLICT (id) DO NOTHING;

-- RLS: each user can only access their own folder ({user_id}/...)
DROP POLICY IF EXISTS "Users can read own steno files" ON storage.objects;
CREATE POLICY "Users can read own steno files"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'steno-transcripts' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "Users can upload own steno files" ON storage.objects;
CREATE POLICY "Users can upload own steno files"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'steno-transcripts' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "Users can update own steno files" ON storage.objects;
CREATE POLICY "Users can update own steno files"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'steno-transcripts' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "Users can delete own steno files" ON storage.objects;
CREATE POLICY "Users can delete own steno files"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'steno-transcripts' AND auth.uid()::text = (storage.foldername(name))[1]);
