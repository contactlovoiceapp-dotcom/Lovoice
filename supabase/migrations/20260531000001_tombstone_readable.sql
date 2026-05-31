-- Allow authenticated clients to read the tombstone sentinel profile.
--
-- The tombstone (id = deadface-0000-0000-0000-000000000000) is the anonymous placeholder
-- that owns all conversations / references left behind after an account purge. Its
-- deleted_at column is intentionally set so it never appears in feeds, get_feed(), or
-- start_conversation() — but the existing read_profiles RLS policy (deleted_at IS NULL)
-- also blocks it from profile joins in the inbox and conversation queries.
--
-- Without this policy the mobile client sees an empty display name instead of
-- "Compte supprimé" for any conversation repointed to the tombstone.

CREATE POLICY "read_tombstone_profile" ON public.profiles
  FOR SELECT TO authenticated
  USING (id = public.tombstone_user_id());

COMMENT ON POLICY "read_tombstone_profile" ON public.profiles IS
  'Grants authenticated users read access to the tombstone sentinel profile so that deleted-'
  'account placeholders display correctly in conversation lists and chat headers.';
