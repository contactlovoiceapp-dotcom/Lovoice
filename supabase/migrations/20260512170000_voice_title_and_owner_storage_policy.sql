-- Adds the optional voice catchphrase column and lets owners read their own voice files regardless of moderation status.
ALTER TABLE public.voices
  ADD COLUMN title text CHECK (title IS NULL OR char_length(title) <= 60);

COMMENT ON COLUMN public.voices.title IS 'Optional short catchphrase shown above the voice card; max 60 characters, edited from the profile screen.';

-- Owners must be able to replay their own voice immediately after publishing,
-- including before any future auto-moderation pass might flip the row to 'pending'.
-- The path convention is `{user_id}/{voice_id}.m4a` inside the `voices` bucket,
-- so the first folder segment is the owner's auth uid.
CREATE POLICY read_own_voice_audio ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'voices'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
