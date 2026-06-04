-- Phase 11: server-side OS badge support.
-- Adds profiles.likes_seen_at so the server shares the client's notion of "likes seen",
-- and a unread_badge_count(uuid) helper so dispatch_push can stamp an authoritative
-- badge on every push (the only way to update the OS badge while the app is backgrounded
-- or killed, since no client JS runs then).

-- 1. Server-side mirror of the client's "last time the Likes tab was opened".
--    The client writes it (best-effort) on Likes focus alongside its local SecureStore
--    marker; the badge function reads it to count unseen likes. NULL means "never opened"
--    → all received likes count as unseen, matching the client (useUnseenLikes).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS likes_seen_at timestamptz;

COMMENT ON COLUMN public.profiles.likes_seen_at IS
  'Last time the user opened the Likes tab. Mirrors the client SecureStore marker so the '
  'server can compute unseen-likes for the OS push badge. NULL = never opened.';

-- 2. Authoritative badge count = unread messages + unseen likes, matching the in-app
--    counters (useUnreadMessagesCount + useUnseenLikesCount) so the OS badge set by a
--    background push and the in-app badge recomputed on resume converge.
--
--    SECURITY DEFINER: called by dispatch_push under the service role; it bypasses RLS
--    anyway, but keeping it definer lets us grant a tight EXECUTE surface.
CREATE OR REPLACE FUNCTION public.unread_badge_count(p_user uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE((
      SELECT count(*)
      FROM public.messages m
      JOIN public.conversations c ON c.id = m.conversation_id
      WHERE (c.user_a = p_user OR c.user_b = p_user)
        AND m.sender_id <> p_user
        AND m.read_at IS NULL
    ), 0)
    +
    COALESCE((
      SELECT count(DISTINCT l.liker_id)
      FROM public.likes l
      JOIN public.voices v ON v.id = l.voice_id
      WHERE v.user_id = p_user
        AND l.liker_id <> p_user
        AND l.created_at > COALESCE(
          (SELECT p.likes_seen_at FROM public.profiles p WHERE p.id = p_user),
          'epoch'::timestamptz
        )
    ), 0);
$$;

COMMENT ON FUNCTION public.unread_badge_count(uuid) IS
  'OS push badge total: unread received messages + distinct likers since likes_seen_at. '
  'Mirrors the in-app counters so background-set and resume-recomputed badges converge.';

REVOKE ALL ON FUNCTION public.unread_badge_count(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.unread_badge_count(uuid) TO service_role;
