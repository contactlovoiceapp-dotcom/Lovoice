-- Helper script to provision a new admin in the Lovoice back-office.
--
-- HOW TO RUN:
--   Run this script manually against the production Supabase Postgres URL:
--
--     psql "$SUPABASE_DB_URL" -f scripts/seed-admin.sql
--
--   Or paste the INSERT below into the Supabase Studio SQL editor.
--
--   NEVER run this file via `supabase db push` — it is not a migration and must
--   never be applied automatically. It is a one-shot operator tool.
--
-- PREREQUISITE:
--   The target person must already have a row in auth.users. The simplest way
--   is to ask them to visit the back-office login page and request a magic link
--   (the route handler calls signInWithOtp with shouldCreateUser: false, so the
--   user must exist first). Alternatively, create the user manually in
--   Supabase Studio → Authentication → Users → Invite user.
--
-- PARAMETERS (replace the placeholders before running):
--   :auth_user_id  — the uuid from auth.users (Dashboard → Auth → Users → User ID)
--   :email         — the email address (must match auth.users.email exactly)
--   :display_name  — the name shown in the audit log and back-office sidebar

INSERT INTO public.admin_users (id, email, display_name)
VALUES (
  '<:auth_user_id>',   -- uuid from auth.users
  '<:email>',          -- must match auth.users.email exactly
  '<:display_name>'    -- displayed in the back-office sidebar and audit log
)
ON CONFLICT (id) DO NOTHING;

-- Verify the row was inserted (should return 1 row):
SELECT id, email, display_name, created_at
FROM public.admin_users
WHERE email = '<:email>';

-- To revoke admin access, delete the row:
-- WARNING: this only removes back-office access. It does NOT delete the
-- corresponding auth.users row. The person will no longer be able to log in
-- to the back-office (is_admin() returns false, layout redirects to /login).
-- There are no cascading side effects — admin_users.id has no FK children.
--
-- DELETE FROM public.admin_users WHERE email = '<:email>';
