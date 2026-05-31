-- Enable Realtime on likes so the in-app Likes tab badge updates without visiting
-- that tab (useRealtimeLikes in app/(main)/_layout.tsx).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'likes'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.likes;
  END IF;
END $$;
