-- Stop merging purged accounts into one shared tombstone conversation.
--
-- Each purge creates a dedicated anonymized stub profile so the correspondent keeps
-- one inbox row per deleted interlocutor (UNIQUE(user_a, user_b) no longer collapses
-- every deleted peer into a single thread).
--
-- Also lets authenticated users read any deleted-at profile they share a conversation
-- with (per-user stubs, not only the legacy deadface sentinel).

-- ============================================================
-- 1. RLS — read deleted conversation partners
-- ============================================================

CREATE POLICY read_deleted_conversation_partners ON public.profiles
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.conversations c
      WHERE (c.user_a = auth.uid() OR c.user_b = auth.uid())
        AND (c.user_a = profiles.id OR c.user_b = profiles.id)
    )
  );

COMMENT ON POLICY read_deleted_conversation_partners ON public.profiles IS
  'Allows inbox/conversation profile joins for purged correspondents (one stub per deleted account).';

-- ============================================================
-- 2. Helper — create one anonymized stub per purge
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_deleted_account_stub()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_stub uuid := gen_random_uuid();
BEGIN
  INSERT INTO auth.users (
    id, aud, role, email, created_at, updated_at, raw_app_meta_data, raw_user_meta_data
  )
  VALUES (
    v_stub,
    'authenticated',
    'authenticated',
    'deleted+' || v_stub::text || '@lovoice.invalid',
    now(),
    now(),
    '{"provider":"system","providers":["system"]}'::jsonb,
    '{}'::jsonb
  );

  INSERT INTO public.profiles (
    id, display_name, birthdate, gender, looking_for, city, country, deleted_at, is_banned
  )
  VALUES (
    v_stub,
    'Compte supprimé',
    '1970-01-01',
    'other',
    ARRAY['other']::text[],
    'N/A',
    'FR',
    now(),
    true
  );

  RETURN v_stub;
END;
$$;

COMMENT ON FUNCTION public.create_deleted_account_stub() IS
  'Creates a one-off auth+profile stub for a purged user so conversations stay separate.';

REVOKE ALL ON FUNCTION public.create_deleted_account_stub() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_deleted_account_stub() TO service_role;

-- ============================================================
-- 3. purge_account — one stub per purge, no merge
-- ============================================================

CREATE OR REPLACE FUNCTION public.purge_account(p_user_id uuid)
RETURNS TABLE (voice_paths text[], message_paths text[])
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_tombstone     uuid := public.tombstone_user_id();
  v_stub          uuid;
  v_voice_paths   text[];
  v_message_paths text[];
  v_conv          record;
  v_other         uuid;
  v_new_a         uuid;
  v_new_b         uuid;
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

  -- 2. One anonymized stub for this purge — every conversation with p_user_id
  --    repoints onto it without collapsing distinct deleted peers together.
  v_stub := public.create_deleted_account_stub();

  FOR v_conv IN
    SELECT id, user_a, user_b, initiator_id, last_message_at
    FROM public.conversations
    WHERE user_a = p_user_id OR user_b = p_user_id
  LOOP
    v_other := CASE WHEN v_conv.user_a = p_user_id THEN v_conv.user_b ELSE v_conv.user_a END;

    -- Legacy rows already repointed to the shared sentinel: drop the empty shell.
    IF v_other = v_tombstone THEN
      DELETE FROM public.conversations WHERE id = v_conv.id;
      CONTINUE;
    END IF;

    v_new_a := LEAST(v_stub, v_other);
    v_new_b := GREATEST(v_stub, v_other);

    UPDATE public.conversations
       SET user_a = v_new_a,
           user_b = v_new_b,
           initiator_id = CASE WHEN initiator_id = p_user_id THEN v_stub ELSE initiator_id END
     WHERE id = v_conv.id;
  END LOOP;

  -- 3. Hard-delete the user's OWN messages rows first (Storage handled by caller).
  DELETE FROM public.messages WHERE sender_id = p_user_id;

  -- 4. Delete ALL reports referencing this user's content.
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

  -- 6. Hard-delete voices.
  DELETE FROM public.voices WHERE user_id = p_user_id;

  -- 7. Soft-delete + scrub the profile before auth.users removal.
  UPDATE public.profiles
     SET deleted_at = COALESCE(deleted_at, now()),
         is_banned  = true,
         push_token = NULL
   WHERE id = p_user_id;

  RETURN QUERY SELECT v_voice_paths, v_message_paths;
END;
$$;

COMMENT ON FUNCTION public.purge_account(uuid) IS
  'Atomic GDPR purge: reports/content cleanup, one anonymized stub per purge (no inbox merge), '
  'soft-deletes the profile, returns Storage paths. Idempotent. service_role only.';

REVOKE ALL ON FUNCTION public.purge_account(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purge_account(uuid) TO service_role;
