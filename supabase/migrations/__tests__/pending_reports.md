# Manual verification: `pending_reports` view + `is_admin_email` RPC

This document describes how to verify the migration
`20260523120000_phase6bis_admin_view_and_rpc.sql` works correctly against a
local Supabase instance.

## Prerequisites

```bash
npx supabase start        # start the local Supabase stack
npx supabase db push      # apply all migrations (including the new one)
```

## Step 1 — Seed test data

In the Supabase Studio SQL editor (`http://localhost:54323`) or via `psql`:

```sql
-- Create a test regular user (mobile-app user)
INSERT INTO auth.users (id, email) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'user@example.com');

INSERT INTO public.profiles (id, display_name, birthdate, gender, looking_for, city, country)
VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Alice', '1995-03-15', 'female', '{male}', 'Paris', 'FR');

-- Create a second user to be the reporter
INSERT INTO auth.users (id, email) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000002', 'reporter@example.com');

INSERT INTO public.profiles (id, display_name, birthdate, gender, looking_for, city, country)
VALUES
  ('aaaaaaaa-0000-0000-0000-000000000002', 'Bob', '1990-07-20', 'male', '{female}', 'Lyon', 'FR');

-- Create an admin user
INSERT INTO auth.users (id, email) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000099', 'admin@lovoice.fr');

INSERT INTO public.admin_users (id, email, display_name)
VALUES
  ('aaaaaaaa-0000-0000-0000-000000000099', 'admin@lovoice.fr', 'Admin Test');

-- Seed a voice for Alice
INSERT INTO public.voices (id, user_id, storage_path, duration_ms, status, is_active)
VALUES
  ('bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001',
   'voices/aaaaaaaa-0000-0000-0000-000000000001/bbbbbbbb-0000-0000-0000-000000000001.m4a',
   30000, 'approved', true);

-- Bob reports Alice's voice
INSERT INTO public.reports (reporter_id, target_voice_id, reason, status)
VALUES
  ('aaaaaaaa-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000001',
   'inappropriate', 'pending');
```

## Step 2 — Query the view as admin

To simulate an admin session, set the JWT role via `set local role`:

```sql
-- Simulate the admin calling the view.
-- In a real Supabase context this is done via the JWT; locally we use the
-- service role or set auth.uid() manually.
SET LOCAL request.jwt.claims TO '{"sub":"aaaaaaaa-0000-0000-0000-000000000099","role":"authenticated"}';
SET LOCAL role TO authenticated;

SELECT * FROM public.pending_reports;
```

**Expected result:** 1 row returned with:
- `target_kind = 'voice'`
- `reporter_display_name = 'Bob'`
- `author_display_name = 'Alice'`
- `voice_status = 'approved'`

## Step 3 — Verify non-admin gets zero rows

```sql
SET LOCAL request.jwt.claims TO '{"sub":"aaaaaaaa-0000-0000-0000-000000000002","role":"authenticated"}';
SET LOCAL role TO authenticated;

SELECT * FROM public.pending_reports;
-- Expected: 0 rows (RLS admins_read_reports blocks non-admins)
```

## Step 4 — Verify `is_admin_email`

```sql
RESET role;

SELECT public.is_admin_email('admin@lovoice.fr');
-- Expected: true

SELECT public.is_admin_email('ADMIN@LOVOICE.FR');
-- Expected: true (case-insensitive)

SELECT public.is_admin_email('notanadmin@example.com');
-- Expected: false
```

## Step 5 — Verify `anon` can call `is_admin_email`

```sql
SET LOCAL role TO anon;

SELECT public.is_admin_email('admin@lovoice.fr');
-- Expected: true (GRANT EXECUTE to anon)
```
