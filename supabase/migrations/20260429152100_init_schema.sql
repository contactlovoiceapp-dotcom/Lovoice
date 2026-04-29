-- Defines the initial Supabase schema for the Lovoice backend.
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  birthdate date NOT NULL,
  gender text NOT NULL CHECK (gender IN ('male', 'female', 'nonbinary', 'other')),
  looking_for text[] NOT NULL DEFAULT '{}',
  city text NOT NULL,
  location geography(Point, 4326),
  country text NOT NULL CHECK (country IN ('FR', 'BE', 'CH')),
  bio_emojis text[] NOT NULL DEFAULT '{}' CHECK (cardinality(bio_emojis) <= 3),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz,
  push_token text,
  is_banned boolean NOT NULL DEFAULT false,
  deleted_at timestamptz
);

COMMENT ON TABLE public.profiles IS 'Stores one mobile user profile per Supabase Auth user.';

CREATE TABLE public.prompts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  body text NOT NULL,
  category text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.prompts IS 'Stores the curated read-only catalog of suggested voice topics.';

CREATE TABLE public.voices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  prompt_id uuid REFERENCES public.prompts(id) ON DELETE SET NULL,
  storage_path text NOT NULL,
  duration_ms integer NOT NULL CHECK (duration_ms > 0 AND duration_ms <= 300000),
  transcript text,
  theme text,
  status text NOT NULL DEFAULT 'approved' CHECK (status IN ('pending', 'approved', 'rejected', 'manual_review')),
  moderation_reason text,
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.voices IS 'Stores user voice introductions and their moderation state.';

CREATE UNIQUE INDEX voices_one_active_per_user_idx ON public.voices (user_id) WHERE is_active = true;
CREATE INDEX voices_user_active_status_idx ON public.voices (user_id, is_active, status);
CREATE INDEX voices_feed_status_active_created_at_idx ON public.voices (status, is_active, created_at DESC);

CREATE TABLE public.likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  liker_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  voice_id uuid NOT NULL REFERENCES public.voices(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (liker_id, voice_id)
);

COMMENT ON TABLE public.likes IS 'Stores one like from a user to a voice.';

CREATE INDEX likes_voice_id_idx ON public.likes (voice_id);

CREATE TABLE public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  user_b uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  last_message_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (user_a < user_b),
  UNIQUE (user_a, user_b)
);

COMMENT ON TABLE public.conversations IS 'Stores one canonical conversation between two users.';

CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('text', 'voice')),
  body_text text,
  voice_path text,
  voice_duration_ms integer CHECK (voice_duration_ms IS NULL OR (voice_duration_ms > 0 AND voice_duration_ms <= 300000)),
  status text NOT NULL DEFAULT 'approved' CHECK (status IN ('pending', 'approved', 'rejected', 'manual_review')),
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  CHECK (
    (kind = 'text' AND body_text IS NOT NULL AND voice_path IS NULL AND voice_duration_ms IS NULL)
    OR
    (kind = 'voice' AND body_text IS NULL AND voice_path IS NOT NULL AND voice_duration_ms IS NOT NULL)
  )
);

COMMENT ON TABLE public.messages IS 'Stores text and voice messages sent inside conversations.';

CREATE INDEX messages_conversation_created_at_idx ON public.messages (conversation_id, created_at);

CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('like', 'message', 'system')),
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.notifications IS 'Stores in-app notification events for likes, messages, and system notices.';

CREATE INDEX notifications_user_created_at_idx ON public.notifications (user_id, created_at DESC);

CREATE TABLE public.blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (blocker_id <> blocked_id),
  UNIQUE (blocker_id, blocked_id)
);

COMMENT ON TABLE public.blocks IS 'Stores user-to-user blocks that hide content and prevent contact.';

CREATE TABLE public.admin_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL UNIQUE,
  display_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz
);

COMMENT ON TABLE public.admin_users IS 'Stores the allow-list of Supabase Auth users with back-office access.';

CREATE TABLE public.reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  target_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  target_voice_id uuid REFERENCES public.voices(id) ON DELETE SET NULL,
  target_message_id uuid REFERENCES public.messages(id) ON DELETE SET NULL,
  reason text NOT NULL,
  free_text text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'dismissed', 'actioned')),
  resolved_by uuid REFERENCES public.admin_users(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (target_user_id IS NOT NULL OR target_voice_id IS NOT NULL OR target_message_id IS NOT NULL),
  CHECK (
    (status = 'pending' AND resolved_by IS NULL AND resolved_at IS NULL)
    OR
    (status IN ('dismissed', 'actioned') AND resolved_by IS NOT NULL AND resolved_at IS NOT NULL)
  )
);

COMMENT ON TABLE public.reports IS 'Stores moderation reports submitted by users and resolved by admins.';

CREATE INDEX reports_status_idx ON public.reports (status);

CREATE TABLE public.feed_seen (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  voice_id uuid NOT NULL REFERENCES public.voices(id) ON DELETE CASCADE,
  seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, voice_id)
);

COMMENT ON TABLE public.feed_seen IS 'Stores voices already shown to a user in the discovery feed.';

CREATE TABLE public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL,
  action text NOT NULL,
  target_kind text NOT NULL CHECK (target_kind IN ('voice', 'message', 'profile', 'report')),
  target_id uuid NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.audit_log IS 'Stores compliance and debugging records for moderation and account actions.';
