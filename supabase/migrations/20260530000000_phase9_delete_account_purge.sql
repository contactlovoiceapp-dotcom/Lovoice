-- Phase 9: GDPR / Apple 5.1.1(v) account purge.
--
-- Provides the SQL side of the user-initiated `delete_account` Edge Function (ARCHITECTURE §9):
--   1. A stable "tombstone" sentinel user (auth.users + profiles) that owns every
--      anonymized reference left behind by a purge. It carries deleted_at = now() so it
--      never surfaces in feeds, public reads, or start_conversation() (which filters
--      deleted_at IS NULL).
--   2. public.tombstone_user_id() — the stable tombstone uuid, single source of truth.
--   3. public.purge_account(p_user_id) — the atomic DB purge. It hard-deletes the user's
--      own rows, repoints conversations the user took part in onto the tombstone (so the
--      CORRESPONDENT's messages survive the upcoming profile delete), soft-deletes the
--      profile, and returns the Storage object paths the caller must remove out-of-band.
--
-- Why repoint conversations onto the tombstone instead of letting the cascade run:
--   conversations.user_a / user_b are ON DELETE CASCADE and conversations.initiator_id is
--   ON DELETE RESTRICT (no clause). Deleting the profile would therefore either (a) be
--   blocked by initiator_id, or (b) cascade-delete the whole conversation and with it the
--   correspondent's messages. Repointing to the tombstone first preserves the correspondent's
--   side of the thread while erasing the deleted user's identity.
--
-- Storage objects (voices / messages buckets) cannot be removed from SQL; purge_account
-- returns their paths and the Edge Function deletes them with the service-role client.
--
-- purge_account is SECURITY DEFINER and callable ONLY by service_role (the Edge Function);
-- EXECUTE is revoked from PUBLIC so no authenticated client can wipe an arbitrary account.

-- ============================================================
-- 1. Tombstone sentinel user
-- ============================================================

-- A real auth.users row is required because profiles.id REFERENCES auth.users(id), and
-- profiles is itself the target of every FK we repoint. The id is a recognizable sentinel.
INSERT INTO auth.users (id, aud, role, email, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
VALUES (
  'deadface-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'deleted-account@lovoice.invalid',
  now(),
  now(),
  '{"provider":"system","providers":["system"]}'::jsonb,
  '{}'::jsonb
)
ON CONFLICT (id) DO NOTHING;

-- deleted_at is set so the row is excluded from read_profiles, get_feed and start_conversation.
INSERT INTO public.profiles (id, display_name, birthdate, gender, looking_for, city, country, deleted_at, is_banned)
VALUES (
  'deadface-0000-0000-0000-000000000000',
  'Compte supprimé',
  '1970-01-01',
  'other',
  ARRAY['other']::text[],
  'N/A',
  'FR',
  now(),
  false
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 2. tombstone_user_id() — stable sentinel id
-- ============================================================

CREATE OR REPLACE FUNCTION public.tombstone_user_id()
RETURNS uuid
LANGUAGE sql
IMMUTABLE
AS $$ SELECT 'deadface-0000-0000-0000-000000000000'::uuid $$;

COMMENT ON FUNCTION public.tombstone_user_id() IS
  'Stable uuid of the tombstone sentinel profile that owns anonymized references left by purge_account().';

-- ============================================================
-- 3. purge_account(p_user_id) — atomic DB purge
-- ============================================================

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

  -- 2. Repoint every conversation the user took part in onto the tombstone so the
  --    correspondent's messages survive the profile delete. user_a < user_b and the
  --    UNIQUE(user_a, user_b) constraint are preserved; a pre-existing tombstone
  --    conversation with the same correspondent (from another already-purged user)
  --    is merged into rather than duplicated.
  FOR v_conv IN
    SELECT id, user_a, user_b, initiator_id, last_message_at
    FROM public.conversations
    WHERE user_a = p_user_id OR user_b = p_user_id
  LOOP
    v_other := CASE WHEN v_conv.user_a = p_user_id THEN v_conv.user_b ELSE v_conv.user_a END;

    -- Degenerate: the only counterpart is already the tombstone (both parties deleted).
    -- Nothing to preserve — drop the thread (cascades its messages).
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
      -- Collapse onto the existing tombstone conversation with this correspondent.
      UPDATE public.messages SET conversation_id = v_existing WHERE conversation_id = v_conv.id;
      UPDATE public.conversations
         SET last_message_at = GREATEST(
               COALESCE(last_message_at, v_conv.last_message_at),
               COALESCE(v_conv.last_message_at, last_message_at)
             )
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

  -- 3. Hard-delete the user's OWN messages (rows). Storage handled by the caller.
  DELETE FROM public.messages WHERE sender_id = p_user_id;

  -- 4. Hard-delete every row authored by / belonging to the user.
  DELETE FROM public.likes WHERE liker_id = p_user_id;
  DELETE FROM public.notifications WHERE user_id = p_user_id OR actor_id = p_user_id;
  DELETE FROM public.blocks WHERE blocker_id = p_user_id OR blocked_id = p_user_id;
  DELETE FROM public.reports WHERE reporter_id = p_user_id;
  DELETE FROM public.feed_seen WHERE user_id = p_user_id;

  -- 5. Hard-delete the user's voices (cascades likes + feed_seen referencing them;
  --    reports.target_voice_id is SET NULL by its FK).
  DELETE FROM public.voices WHERE user_id = p_user_id;

  -- 6. Soft-delete + scrub the profile. The row is fully removed when the caller deletes
  --    auth.users; this leaves a compliant, idempotent intermediate state if that step
  --    fails midway (a re-run resumes from here). Only deleted_at / is_banned / push_token
  --    are touched, so the profiles validation trigger (display_name/birthdate/looking_for)
  --    does not fire.
  UPDATE public.profiles
     SET deleted_at = COALESCE(deleted_at, now()),
         is_banned  = true,
         push_token = NULL
   WHERE id = p_user_id;

  RETURN QUERY SELECT v_voice_paths, v_message_paths;
END;
$$;

COMMENT ON FUNCTION public.purge_account(uuid) IS
  'Atomic GDPR purge of a user account: hard-deletes the user''s own voices/messages/likes/'
  'notifications/blocks/reports/feed_seen, anonymizes shared conversations onto the tombstone '
  'so the correspondent''s messages survive, soft-deletes the profile, and returns the Storage '
  'object paths (voices + message voices) the caller must remove. Idempotent. service_role only.';

-- Lock execution down to the service role used by the Edge Functions.
REVOKE ALL ON FUNCTION public.purge_account(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purge_account(uuid) TO service_role;
