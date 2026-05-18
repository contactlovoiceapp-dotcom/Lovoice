-- Allows owners to soft-delete their active voice by setting is_active = false.
-- SECURITY DEFINER so the user cannot directly UPDATE is_active via the REST API
-- (same rationale as update_own_voice and commit_voice_upload).
-- Returns the number of rows affected (1 on success, 0 if no active voice found).

CREATE OR REPLACE FUNCTION public.delete_own_voice(p_voice_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected integer;
BEGIN
  UPDATE voices
    SET is_active = false
    WHERE id = p_voice_id
      AND user_id = auth.uid()
      AND is_active = true;

  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

COMMENT ON FUNCTION public.delete_own_voice(uuid) IS
  'Soft-deletes (deactivates) the voice owned by auth.uid(); returns 1 if deleted, 0 if not found.';

GRANT EXECUTE ON FUNCTION public.delete_own_voice(uuid) TO authenticated;
