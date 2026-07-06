-- Block likes from users who have not recorded an active voice yet.

DROP POLICY IF EXISTS insert_own_likes ON public.likes;

CREATE POLICY insert_own_likes ON public.likes
  FOR INSERT TO authenticated
  WITH CHECK (
    liker_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.voices lv
      WHERE lv.user_id = auth.uid()
        AND lv.is_active = true
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.voices v
      JOIN public.blocks b
        ON (b.blocker_id = auth.uid() AND b.blocked_id = v.user_id)
        OR (b.blocker_id = v.user_id  AND b.blocked_id = auth.uid())
      WHERE v.id = likes.voice_id
    )
  );
