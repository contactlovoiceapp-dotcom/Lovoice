-- Fix: include 'extensions' schema in get_feed search_path so PostGIS
-- types (geography) and functions (ST_DWithin) resolve on Supabase Cloud
-- where PostGIS is installed in the extensions schema.

CREATE OR REPLACE FUNCTION public.get_feed(
  p_distance_m          int         DEFAULT NULL,
  p_limit               int         DEFAULT 20,
  p_cursor_created_at   timestamptz DEFAULT NULL
)
RETURNS TABLE (
  voice_id      uuid,
  storage_path  text,
  duration_ms   int,
  theme         text,
  title         text,
  prompt_body   text,
  created_at    timestamptz,
  user_id       uuid,
  display_name  text,
  birthdate     date,
  city          text,
  bio_emojis    text[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_id           uuid;
  v_caller_gender       text;
  v_caller_looking_for  text[];
  v_caller_location     geography;
  v_limit               int;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'auth_required' USING ERRCODE = '42501';
  END IF;

  SELECT gender, looking_for, location
  INTO v_caller_gender, v_caller_looking_for, v_caller_location
  FROM profiles
  WHERE id = v_caller_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile_required' USING ERRCODE = '42501';
  END IF;

  v_limit := LEAST(p_limit, 50);

  RETURN QUERY
  SELECT
    v.id            AS voice_id,
    v.storage_path,
    v.duration_ms,
    v.theme,
    v.title,
    pr.body         AS prompt_body,
    v.created_at,
    v.user_id,
    p.display_name,
    p.birthdate,
    p.city,
    p.bio_emojis
  FROM voices v
  JOIN profiles p ON p.id = v.user_id
  LEFT JOIN prompts pr ON pr.id = v.prompt_id
  WHERE v.status = 'approved'
    AND v.is_active = true
    AND p.deleted_at IS NULL
    AND p.is_banned = false
    AND p.id <> v_caller_id
    AND NOT EXISTS (
      SELECT 1 FROM feed_seen fs
      WHERE fs.user_id = v_caller_id AND fs.voice_id = v.id
    )
    AND NOT EXISTS (
      SELECT 1 FROM blocks b
      WHERE (b.blocker_id = v_caller_id AND b.blocked_id = p.id)
         OR (b.blocker_id = p.id AND b.blocked_id = v_caller_id)
    )
    AND p.gender = ANY(v_caller_looking_for)
    AND v_caller_gender = ANY(p.looking_for)
    AND (
      p_distance_m IS NULL
      OR v_caller_location IS NULL
      OR p.location IS NULL
      OR ST_DWithin(p.location, v_caller_location, p_distance_m)
    )
    AND (p_cursor_created_at IS NULL OR v.created_at < p_cursor_created_at)
  ORDER BY v.created_at DESC, random()
  LIMIT v_limit;
END;
$$;
