-- Phase 6: enables unlike, blocks blocked-user interactions across likes/conversations/messages,
-- and dispatches a notification to the voice owner whenever someone likes their voice.

-- 1. Allow users to unlike (delete their own like rows).
CREATE POLICY delete_own_likes ON public.likes
  FOR DELETE TO authenticated
  USING (liker_id = auth.uid());

-- 2. Replace insert_own_likes to also reject when a block exists between the liker and the voice owner.
DROP POLICY IF EXISTS insert_own_likes ON public.likes;

CREATE POLICY insert_own_likes ON public.likes
  FOR INSERT TO authenticated
  WITH CHECK (
    liker_id = auth.uid()
    AND NOT EXISTS (
      SELECT 1
      FROM public.voices v
      JOIN public.blocks b
        ON (b.blocker_id = auth.uid() AND b.blocked_id = v.user_id)
        OR (b.blocker_id = v.user_id  AND b.blocked_id = auth.uid())
      WHERE v.id = likes.voice_id
    )
  );

-- 3. Replace insert_own_conversations to reject creation if a block exists in either direction.
DROP POLICY IF EXISTS insert_own_conversations ON public.conversations;

CREATE POLICY insert_own_conversations ON public.conversations
  FOR INSERT TO authenticated
  WITH CHECK (
    (user_a = auth.uid() OR user_b = auth.uid())
    AND NOT EXISTS (
      SELECT 1 FROM public.blocks b
      WHERE (b.blocker_id = user_a AND b.blocked_id = user_b)
         OR (b.blocker_id = user_b AND b.blocked_id = user_a)
    )
  );

-- 4. Replace send_own_messages to reject sending if a block exists between the sender and the other participant.
DROP POLICY IF EXISTS send_own_messages ON public.messages;

CREATE POLICY send_own_messages ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = messages.conversation_id
        AND (c.user_a = auth.uid() OR c.user_b = auth.uid())
        AND NOT EXISTS (
          SELECT 1 FROM public.blocks b
          WHERE (b.blocker_id = c.user_a AND b.blocked_id = c.user_b)
             OR (b.blocker_id = c.user_b AND b.blocked_id = c.user_a)
        )
    )
  );

-- 5. Trigger function + trigger: insert a kind='like' notification for the voice owner on every new like.
CREATE OR REPLACE FUNCTION public.notify_on_like()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner_id uuid;
BEGIN
  SELECT user_id INTO v_owner_id FROM public.voices WHERE id = NEW.voice_id;

  -- Skip if the voice no longer exists or the liker is somehow the owner.
  IF v_owner_id IS NULL OR v_owner_id = NEW.liker_id THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.notifications (user_id, kind, actor_id, payload)
  VALUES (
    v_owner_id,
    'like',
    NEW.liker_id,
    jsonb_build_object('voice_id', NEW.voice_id, 'like_id', NEW.id)
  );

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.notify_on_like() IS
  'Inserts a kind="like" notification for the voice owner when someone likes their voice.';

DROP TRIGGER IF EXISTS on_like_insert ON public.likes;

CREATE TRIGGER on_like_insert
  AFTER INSERT ON public.likes
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_like();
