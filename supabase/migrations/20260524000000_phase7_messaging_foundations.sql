-- Phase 7 Block 1: Backend foundations for messaging.
-- Adds first_reply_at + initiator_id to conversations, enables Realtime for messages/conversations,
-- introduces the start_conversation RPC, four-state lifecycle trigger on messages INSERT,
-- conversation updater trigger, recipient notification trigger, read_at guard trigger + RLS,
-- and performance indexes.
--
-- Frozen SQLSTATE 23514 error codes the mobile client must map:
--   messages.conversation_not_found
--   messages.not_a_participant
--   messages.blocked
--   messages.not_initiator
--   messages.first_message_must_be_voice
--   messages.awaiting_reply
--   messages.reply_must_be_voice
--   messages.text_locked_24h
--   messages.update_forbidden

-- ============================================================
-- 1. Schema additions to conversations
-- ============================================================

ALTER TABLE public.conversations
  ADD COLUMN first_reply_at timestamptz,
  ADD COLUMN initiator_id   uuid NOT NULL REFERENCES public.profiles(id);

COMMENT ON COLUMN public.conversations.first_reply_at IS
  'Set automatically when the non-initiator sends their first message. Drives the 24h voice-only lock.';

COMMENT ON COLUMN public.conversations.initiator_id IS
  'Denormalised id of the user who sent the very first message. Set at conversation creation via start_conversation().';

-- ============================================================
-- 2. Realtime publication — idempotent across environments
-- ============================================================

DO $$
DECLARE
  v_pub_all_tables boolean;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    RETURN;
  END IF;

  SELECT puballtables INTO v_pub_all_tables
  FROM pg_publication WHERE pubname = 'supabase_realtime';

  IF v_pub_all_tables THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'conversations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
  END IF;
END;
$$;

-- ============================================================
-- 3. start_conversation(p_other_user_id) RPC
-- ============================================================

CREATE OR REPLACE FUNCTION public.start_conversation(p_other_user_id uuid)
RETURNS SETOF public.conversations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me     uuid := auth.uid();
  v_user_a uuid;
  v_user_b uuid;
  v_conv   public.conversations;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'messages.unauthenticated' USING ERRCODE = '28000';
  END IF;

  IF p_other_user_id = v_me THEN
    RAISE EXCEPTION 'messages.self_conversation' USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = v_me
      AND is_banned = false
      AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'messages.caller_unavailable' USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_other_user_id
      AND is_banned = false
      AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'messages.recipient_unavailable' USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.blocks
    WHERE (blocker_id = v_me AND blocked_id = p_other_user_id)
       OR (blocker_id = p_other_user_id AND blocked_id = v_me)
  ) THEN
    RAISE EXCEPTION 'messages.blocked' USING ERRCODE = '23514';
  END IF;

  v_user_a := LEAST(v_me, p_other_user_id);
  v_user_b := GREATEST(v_me, p_other_user_id);

  SELECT * INTO v_conv
  FROM public.conversations
  WHERE user_a = v_user_a AND user_b = v_user_b;

  IF FOUND THEN
    RETURN NEXT v_conv;
    RETURN;
  END IF;

  INSERT INTO public.conversations (user_a, user_b, initiator_id)
  VALUES (v_user_a, v_user_b, v_me)
  RETURNING * INTO v_conv;

  RETURN NEXT v_conv;
END;
$$;

COMMENT ON FUNCTION public.start_conversation(uuid) IS
  'Creates or returns the canonical conversation between auth.uid() and p_other_user_id. '
  'Rejects blocked pairs, banned/deleted users, and self-conversations. Idempotent.';

GRANT EXECUTE ON FUNCTION public.start_conversation(uuid) TO authenticated;

-- ============================================================
-- 4. Trigger: enforce four-state conversation lifecycle on INSERT
-- ============================================================

CREATE OR REPLACE FUNCTION public.enforce_message_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conv      public.conversations;
  v_msg_count integer;
BEGIN
  SELECT * INTO v_conv
  FROM public.conversations
  WHERE id = NEW.conversation_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'messages.conversation_not_found' USING ERRCODE = '23514';
  END IF;

  IF NEW.sender_id <> v_conv.user_a AND NEW.sender_id <> v_conv.user_b THEN
    RAISE EXCEPTION 'messages.not_a_participant' USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.blocks
    WHERE (blocker_id = v_conv.user_a AND blocked_id = v_conv.user_b)
       OR (blocker_id = v_conv.user_b AND blocked_id = v_conv.user_a)
  ) THEN
    RAISE EXCEPTION 'messages.blocked' USING ERRCODE = '23514';
  END IF;

  SELECT COUNT(*) INTO v_msg_count
  FROM public.messages
  WHERE conversation_id = NEW.conversation_id;

  IF v_msg_count = 0 THEN
    IF NEW.sender_id <> v_conv.initiator_id THEN
      RAISE EXCEPTION 'messages.not_initiator' USING ERRCODE = '23514';
    END IF;
    IF NEW.kind <> 'voice' THEN
      RAISE EXCEPTION 'messages.first_message_must_be_voice' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF v_conv.first_reply_at IS NULL THEN
    IF NEW.sender_id = v_conv.initiator_id THEN
      RAISE EXCEPTION 'messages.awaiting_reply' USING ERRCODE = '23514';
    END IF;
    IF NEW.kind <> 'voice' THEN
      RAISE EXCEPTION 'messages.reply_must_be_voice' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF now() - v_conv.first_reply_at < INTERVAL '24 hours' THEN
    IF NEW.kind <> 'voice' THEN
      RAISE EXCEPTION 'messages.text_locked_24h' USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_message_rules() IS
  'Enforces the four-state conversation lifecycle (EMPTY / AWAITING_REPLY / VOICE_ONLY / OPEN) '
  'before every message INSERT. Raises SQLSTATE 23514 with stable messages.* codes for client mapping.';

DROP TRIGGER IF EXISTS enforce_message_rules_trg ON public.messages;

CREATE TRIGGER enforce_message_rules_trg
  BEFORE INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_message_rules();

-- ============================================================
-- 5. Trigger: update last_message_at and first_reply_at after INSERT
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_conversation_on_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.conversations
  SET
    last_message_at = NEW.created_at,
    first_reply_at  = CASE
      WHEN first_reply_at IS NULL AND NEW.sender_id <> initiator_id
      THEN NEW.created_at
      ELSE first_reply_at
    END
  WHERE id = NEW.conversation_id;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.update_conversation_on_message() IS
  'Stamps conversations.last_message_at on every new message and sets first_reply_at '
  'the first time the non-initiator sends a message.';

DROP TRIGGER IF EXISTS update_conversation_on_message_trg ON public.messages;

CREATE TRIGGER update_conversation_on_message_trg
  AFTER INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.update_conversation_on_message();

-- ============================================================
-- 6. Trigger: notify recipient on message INSERT
-- ============================================================

CREATE OR REPLACE FUNCTION public.notify_on_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_recipient_id uuid;
BEGIN
  SELECT CASE
    WHEN c.user_a = NEW.sender_id THEN c.user_b
    ELSE c.user_a
  END INTO v_recipient_id
  FROM public.conversations c
  WHERE c.id = NEW.conversation_id;

  IF v_recipient_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.blocks
    WHERE (blocker_id = NEW.sender_id    AND blocked_id = v_recipient_id)
       OR (blocker_id = v_recipient_id   AND blocked_id = NEW.sender_id)
  ) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.notifications (user_id, kind, actor_id, payload)
  VALUES (
    v_recipient_id,
    'message',
    NEW.sender_id,
    jsonb_build_object(
      'message_id',      NEW.id,
      'conversation_id', NEW.conversation_id,
      'kind',            NEW.kind
    )
  );

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.notify_on_message() IS
  'Inserts a kind="message" notification for the other participant on every new message. '
  'Skipped silently when a block exists (defense-in-depth; should not happen after the BEFORE trigger).';

DROP TRIGGER IF EXISTS notify_on_message_trg ON public.messages;

CREATE TRIGGER notify_on_message_trg
  AFTER INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_message();

-- ============================================================
-- 6b. Harden insert_own_conversations policy to require initiator_id = auth.uid()
-- Defense-in-depth: prevents a client from forging the lifecycle state by
-- inserting a conversation with someone else's id as the initiator.
-- The canonical path remains the start_conversation() RPC (SECURITY DEFINER).
-- ============================================================

DROP POLICY IF EXISTS insert_own_conversations ON public.conversations;

CREATE POLICY insert_own_conversations ON public.conversations
  FOR INSERT TO authenticated
  WITH CHECK (
    (user_a = auth.uid() OR user_b = auth.uid())
    AND initiator_id = auth.uid()
    AND NOT EXISTS (
      SELECT 1 FROM public.blocks b
      WHERE (b.blocker_id = user_a AND b.blocked_id = user_b)
         OR (b.blocker_id = user_b AND b.blocked_id = user_a)
    )
  );

-- ============================================================
-- 7a. RLS: allow recipient to update read_at on received messages
-- ============================================================

CREATE POLICY update_received_messages_read_at ON public.messages
  FOR UPDATE TO authenticated
  USING (
    sender_id != auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = messages.conversation_id
        AND (c.user_a = auth.uid() OR c.user_b = auth.uid())
    )
  )
  WITH CHECK (
    sender_id != auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = messages.conversation_id
        AND (c.user_a = auth.uid() OR c.user_b = auth.uid())
    )
  );

-- ============================================================
-- 7b. Trigger: guard non-sender updates to read_at column only
-- ============================================================

CREATE OR REPLACE FUNCTION public.guard_message_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.sender_id <> auth.uid() THEN
    IF OLD.conversation_id    IS DISTINCT FROM NEW.conversation_id
    OR OLD.sender_id          IS DISTINCT FROM NEW.sender_id
    OR OLD.kind               IS DISTINCT FROM NEW.kind
    OR OLD.body_text          IS DISTINCT FROM NEW.body_text
    OR OLD.voice_path         IS DISTINCT FROM NEW.voice_path
    OR OLD.voice_duration_ms  IS DISTINCT FROM NEW.voice_duration_ms
    OR OLD.status             IS DISTINCT FROM NEW.status
    OR OLD.created_at         IS DISTINCT FROM NEW.created_at THEN
      RAISE EXCEPTION 'messages.update_forbidden' USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.guard_message_update() IS
  'Prevents non-sender clients from modifying any column other than read_at on received messages. '
  'Closes the column-restriction gap in PostgreSQL RLS UPDATE policies.';

DROP TRIGGER IF EXISTS guard_message_update_trg ON public.messages;

CREATE TRIGGER guard_message_update_trg
  BEFORE UPDATE ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_message_update();

-- ============================================================
-- 8. Indexes
-- ============================================================

CREATE INDEX messages_conversation_unread_idx
  ON public.messages (conversation_id, sender_id)
  WHERE read_at IS NULL;

CREATE INDEX conversations_initiator_idx
  ON public.conversations (initiator_id);

CREATE INDEX conversations_last_message_at_idx
  ON public.conversations (last_message_at DESC)
  WHERE last_message_at IS NOT NULL;
