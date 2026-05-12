-- Creates the commit_voice_upload RPC used by the commit_upload Edge Function.
-- SECURITY DEFINER so the function can atomically deactivate old voices and insert the new one
-- without the caller needing direct write access via RLS (which the Edge Function bypasses via JWT).

CREATE OR REPLACE FUNCTION public.commit_voice_upload(
  p_storage_path text,
  p_duration_ms  int,
  p_prompt_id    uuid,
  p_title        text,
  p_theme        text
)
RETURNS SETOF voices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Exactly one active voice per user: deactivate any prior active voice first.
  UPDATE voices
    SET is_active = false
    WHERE user_id = auth.uid()
      AND is_active = true;

  -- Insert the new active voice and return it so the Edge Function can relay it to the client.
  RETURN QUERY
    INSERT INTO voices (
      user_id,
      storage_path,
      duration_ms,
      prompt_id,
      title,
      theme,
      is_active,
      status
    )
    VALUES (
      auth.uid(),
      p_storage_path,
      p_duration_ms,
      p_prompt_id,
      p_title,
      p_theme,
      true,
      'approved'
    )
    RETURNING *;
END;
$$;

-- Only authenticated users may call this function; the body enforces they operate on their own data.
GRANT EXECUTE ON FUNCTION public.commit_voice_upload(text, int, uuid, text, text) TO authenticated;
