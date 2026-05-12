-- Allows owners to update editable fields (title, theme) on their own voice rows.
-- We use a SECURITY DEFINER function rather than a permissive UPDATE RLS policy so users
-- cannot tamper with sensitive columns (status, is_active, storage_path, …) via the REST API.

CREATE OR REPLACE FUNCTION public.update_own_voice(
  p_voice_id uuid,
  p_title    text,
  p_theme    text
)
RETURNS SETOF voices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_title IS NOT NULL AND char_length(p_title) > 60 THEN
    RAISE EXCEPTION 'voice.title_too_long'
      USING ERRCODE = '23514';
  END IF;

  IF p_theme IS NOT NULL AND p_theme NOT IN ('sunset', 'chill', 'electric', 'midnight') THEN
    RAISE EXCEPTION 'voice.theme_invalid'
      USING ERRCODE = '23514';
  END IF;

  RETURN QUERY
    UPDATE voices
      SET title = p_title,
          theme = p_theme
      WHERE id = p_voice_id
        AND user_id = auth.uid()
      RETURNING *;
END;
$$;

COMMENT ON FUNCTION public.update_own_voice(uuid, text, text) IS
  'Updates editable fields (title, theme) on a voice owned by auth.uid(); returns the updated row.';

GRANT EXECUTE ON FUNCTION public.update_own_voice(uuid, text, text) TO authenticated;
