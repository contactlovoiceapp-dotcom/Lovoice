-- Adds the pending_reports view and is_admin_email RPC consumed by the admin back-office.

-- Security model: WITH (security_invoker = on) means the view executes under the
-- calling user's identity, so existing RLS policies govern visibility. Non-admins
-- receive zero rows because admins_read_reports, admins_read_all_voices,
-- admins_read_all_messages, and admins_read_profiles all gate on is_admin().
-- Admins see every pending report regardless of the underlying row state.
-- Using security_invoker instead of security_definer keeps the privilege blast
-- radius minimal: a SQL injection inside the view cannot escalate above the caller.
CREATE OR REPLACE VIEW public.pending_reports
  WITH (security_invoker = on)
AS
SELECT
  r.id                                                        AS report_id,
  r.reason,
  r.free_text,
  r.created_at                                                AS report_created_at,

  -- Computed once to avoid re-evaluating IS NOT NULL checks downstream.
  CASE
    WHEN r.target_voice_id   IS NOT NULL THEN 'voice'
    WHEN r.target_message_id IS NOT NULL THEN 'message'
    ELSE                                      'profile'
  END                                                         AS target_kind,

  -- Reporter profile
  reporter.id                                                 AS reporter_id,
  reporter.display_name                                       AS reporter_display_name,
  reporter.gender                                             AS reporter_gender,
  reporter.birthdate                                          AS reporter_birthdate,
  reporter.country                                            AS reporter_country,
  reporter.city                                               AS reporter_city,

  -- Author (target) profile — resolved from whichever target column is populated.
  -- COALESCE order: direct profile report > voice report > message report.
  COALESCE(
    r.target_user_id,
    v_target.user_id,
    m_target.sender_id
  )                                                           AS author_id,
  author.display_name                                         AS author_display_name,
  author.gender                                               AS author_gender,
  author.birthdate                                            AS author_birthdate,
  author.country                                              AS author_country,
  author.city                                                 AS author_city,
  author.is_banned                                            AS author_is_banned,

  -- Target voice (NULL when the report targets a profile or message)
  v_target.id                                                 AS voice_id,
  v_target.storage_path                                       AS voice_storage_path,
  v_target.duration_ms                                        AS voice_duration_ms,
  v_target.title                                              AS voice_title,
  v_target.status                                             AS voice_status,
  v_target.theme                                              AS voice_theme,
  v_target.created_at                                         AS voice_created_at,

  -- Target message (NULL when the report targets a profile or voice)
  m_target.id                                                 AS message_id,
  m_target.conversation_id                                    AS message_conversation_id,
  m_target.kind                                               AS message_kind,
  m_target.body_text                                          AS message_body_text,
  m_target.voice_path                                         AS message_voice_path,
  m_target.voice_duration_ms                                  AS message_voice_duration_ms,
  m_target.status                                             AS message_status,
  m_target.created_at                                         AS message_created_at

FROM public.reports r

JOIN public.profiles reporter
  ON reporter.id = r.reporter_id

LEFT JOIN public.voices v_target
  ON v_target.id = r.target_voice_id

LEFT JOIN public.messages m_target
  ON m_target.id = r.target_message_id

LEFT JOIN public.profiles author
  ON author.id = COALESCE(
    r.target_user_id,
    v_target.user_id,
    m_target.sender_id
  )

WHERE r.status = 'pending'

ORDER BY r.created_at DESC;

COMMENT ON VIEW public.pending_reports IS
  'Read-only admin view of pending moderation reports pre-joined with reporter and '
  'author profiles and the target voice or message. Uses security_invoker so the '
  'caller''s RLS policies apply: non-admins get zero rows (admins_read_reports '
  'gates on is_admin()), admins see all pending reports.';

GRANT SELECT ON public.pending_reports TO authenticated;

-- Used by the back-office magic-link route handler to gate signInWithOtp calls
-- without exposing the admin allow-list. Intentionally lowercase-insensitive on
-- email so "Admin@Example.com" and "admin@example.com" both match.
-- Granted to anon so it can be called before the user has a Supabase session.
CREATE OR REPLACE FUNCTION public.is_admin_email(p_email text)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.admin_users
    WHERE lower(email) = lower(p_email)
  )
$$;

COMMENT ON FUNCTION public.is_admin_email(text) IS
  'Returns true if the given email belongs to a row in admin_users. '
  'Called server-side from the back-office magic-link route to gate signInWithOtp '
  'without exposing the admin allow-list to clients. '
  'Lowercase-insensitive to avoid case mismatches at provisioning time.';

GRANT EXECUTE ON FUNCTION public.is_admin_email(text) TO anon, authenticated;
