-- Fixes purge_account: comprehensively delete all reports referencing the deleted user's
-- content BEFORE deleting voices/messages/profile, so the FK SET NULL actions never run
-- against rows where the deleted column was the only non-null target (which violates the
-- reports check constraint: at least one of target_user_id / target_voice_id /
-- target_message_id must be non-null).
--
-- The previous version only deleted reports WHERE reporter_id = p_user_id, missing:
--   - reports targeting the user's profile directly (target_user_id = p_user_id)
--   - reports targeting the user's voices (FK ON DELETE SET NULL → constraint violation)
--   - reports targeting the user's messages (same issue)
--
-- New approach: delete ALL reports that reference any of the user's content
-- (as reporter, as profile target, or as voice/message target) before touching
-- voices, messages, or auth.users.

CREATE OR REPLACE FUNCTION public.purge_account(p_user_id uuid)
RETURNS TABLE (voice_paths text[], message_paths text[])
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tombstone     uuid := public.tombstone_user_id();
  v_voice_paths   text[];
  v_message_paths text[];
  v_conv          record;
  v_other         uuid;
  v_new_a         uuid;
  v_new_b         uuid;
  v_existing      uuid;
BEGIN
  IF p_user_id IS NULL OR p_user_id = v_tombstone THEN
    RAISE EXCEPTION 'purge.invalid_user' USING ERRCODE = '22023';
  END IF;

  -- 1. Snapshot Storage object paths BEFORE deleting the owning rows.
  SELECT COALESCE(array_agg(storage_path), '{}')
    INTO v_voice_paths
  FROM public.voices
  WHERE user_id = p_user_id;

  SELECT COALESCE(array_agg(voice_path), '{}')
    INTO v_message_paths
  FROM public.messages
  WHERE sender_id = p_user_id
    AND kind = 'voice'
    AND voice_path IS NOT NULL;

  -- 2. Repoint conversations onto the tombstone so the correspondent's messages survive.
  FOR v_conv IN
    SELECT id, user_a, user_b, initiator_id, last_message_at
    FROM public.conversations
    WHERE user_a = p_user_id OR user_b = p_user_id
  LOOP
    v_other := CASE WHEN v_conv.user_a = p_user_id THEN v_conv.user_b ELSE v_conv.user_a END;

    IF v_other = v_tombstone THEN
      DELETE FROM public.conversations WHERE id = v_conv.id;
      CONTINUE;
    END IF;

    v_new_a := LEAST(v_tombstone, v_other);
    v_new_b := GREATEST(v_tombstone, v_other);

    SELECT id INTO v_existing
    FROM public.conversations
    WHERE user_a = v_new_a AND user_b = v_new_b AND id <> v_conv.id;

    IF v_existing IS NOT NULL THEN
      UPDATE public.messages SET conversation_id = v_existing WHERE conversation_id = v_conv.id;
      UPDATE public.conversations
         SET last_message_at = GREATEST(
               COALESCE(last_message_at, v_conv.last_message_at),
               COALESCE(v_conv.last_message_at, last_message_at))
       WHERE id = v_existing;
      DELETE FROM public.conversations WHERE id = v_conv.id;
    ELSE
      UPDATE public.conversations
         SET user_a = v_new_a,
             user_b = v_new_b,
             initiator_id = CASE WHEN initiator_id = p_user_id THEN v_tombstone ELSE initiator_id END
       WHERE id = v_conv.id;
    END IF;
  END LOOP;

  -- 3. Hard-delete the user's OWN messages rows first (Storage handled by caller).
  DELETE FROM public.messages WHERE sender_id = p_user_id;

  -- 4. Delete ALL reports that reference this user's content — done BEFORE deleting voices
  --    and before the auth.users cascade reaches profiles.
  --    The reports check constraint (at least one non-null target) means the FK ON DELETE
  --    SET NULL actions would fail for rows where the deleted column is the only target.
  --    Deleting reports here prevents those FK actions from ever running.
  DELETE FROM public.reports
  WHERE reporter_id        = p_user_id
     OR target_user_id    = p_user_id
     OR target_voice_id   IN (SELECT id FROM public.voices   WHERE user_id   = p_user_id)
     OR target_message_id IN (SELECT id FROM public.messages WHERE sender_id = p_user_id);

  -- 5. Delete other user-owned rows.
  DELETE FROM public.likes         WHERE liker_id   = p_user_id;
  DELETE FROM public.notifications WHERE user_id    = p_user_id OR actor_id  = p_user_id;
  DELETE FROM public.blocks        WHERE blocker_id = p_user_id OR blocked_id = p_user_id;
  DELETE FROM public.feed_seen     WHERE user_id    = p_user_id;

  -- 6. Hard-delete voices (cascades likes + feed_seen on those voices).
  DELETE FROM public.voices WHERE user_id = p_user_id;

  -- 7. Soft-delete + scrub the profile. Hard-delete happens when the caller removes
  --    auth.users (cascades to profiles). COALESCE keeps idempotency.
  UPDATE public.profiles
     SET deleted_at = COALESCE(deleted_at, now()),
         is_banned  = true,
         push_token = NULL
   WHERE id = p_user_id;

  RETURN QUERY SELECT v_voice_paths, v_message_paths;
END;
$$;

COMMENT ON FUNCTION public.purge_account(uuid) IS
  'Atomic GDPR purge of a user account: hard-deletes all reports referencing the user''s '
  'content (to avoid FK SET NULL check-constraint violations), then removes voices/messages/'
  'likes/notifications/blocks/reports/feed_seen, anonymizes shared conversations onto the '
  'tombstone, soft-deletes the profile, and returns Storage object paths for out-of-band '
  'removal. Idempotent. service_role only.';

REVOKE ALL ON FUNCTION public.purge_account(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purge_account(uuid) TO service_role;
