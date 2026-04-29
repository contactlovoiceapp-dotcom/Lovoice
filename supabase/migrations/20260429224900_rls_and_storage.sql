-- Enables row-level security and storage access rules for the Lovoice backend.
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prompts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feed_seen ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_admin() RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()) $$;

CREATE POLICY read_profiles ON public.profiles
  FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND is_banned = false);

CREATE POLICY update_own_profile ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY admins_read_profiles ON public.profiles
  FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY read_voices_public ON public.voices
  FOR SELECT TO authenticated
  USING (
    status = 'approved'
    AND NOT EXISTS (
      SELECT 1
      FROM public.blocks
      WHERE (blocker_id = auth.uid() AND blocked_id = voices.user_id)
         OR (blocker_id = voices.user_id AND blocked_id = auth.uid())
    )
  );

CREATE POLICY write_own_voices ON public.voices
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY admins_read_all_voices ON public.voices
  FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY read_prompts ON public.prompts
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY insert_own_likes ON public.likes
  FOR INSERT TO authenticated
  WITH CHECK (liker_id = auth.uid());

CREATE POLICY read_received_likes ON public.likes
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.voices
      WHERE voices.id = likes.voice_id
        AND voices.user_id = auth.uid()
    )
  );

CREATE POLICY read_given_likes ON public.likes
  FOR SELECT TO authenticated
  USING (liker_id = auth.uid());

CREATE POLICY read_own_conversations ON public.conversations
  FOR SELECT TO authenticated
  USING (user_a = auth.uid() OR user_b = auth.uid());

CREATE POLICY insert_own_conversations ON public.conversations
  FOR INSERT TO authenticated
  WITH CHECK (user_a = auth.uid() OR user_b = auth.uid());

CREATE POLICY read_own_conv_messages ON public.messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.conversations
      WHERE conversations.id = messages.conversation_id
        AND (conversations.user_a = auth.uid() OR conversations.user_b = auth.uid())
    )
  );

CREATE POLICY send_own_messages ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.conversations
      WHERE conversations.id = messages.conversation_id
        AND (conversations.user_a = auth.uid() OR conversations.user_b = auth.uid())
    )
  );

CREATE POLICY admins_read_all_messages ON public.messages
  FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY read_own_notifications ON public.notifications
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY insert_own_blocks ON public.blocks
  FOR INSERT TO authenticated
  WITH CHECK (blocker_id = auth.uid());

CREATE POLICY read_own_blocks ON public.blocks
  FOR SELECT TO authenticated
  USING (blocker_id = auth.uid() OR blocked_id = auth.uid());

CREATE POLICY insert_own_reports ON public.reports
  FOR INSERT TO authenticated
  WITH CHECK (reporter_id = auth.uid());

CREATE POLICY admins_read_reports ON public.reports
  FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY insert_own_feed_seen ON public.feed_seen
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY read_own_feed_seen ON public.feed_seen
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY admins_read_audit_log ON public.audit_log
  FOR SELECT TO authenticated
  USING (public.is_admin());

INSERT INTO storage.buckets (id, name, public)
VALUES
  ('voices', 'voices', false),
  ('messages', 'messages', false);

CREATE POLICY read_approved_voice_audio ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'voices'
    AND EXISTS (
      SELECT 1
      FROM public.voices
      WHERE voices.status = 'approved'
        AND (
          voices.storage_path = storage.objects.name
          OR voices.storage_path = storage.objects.bucket_id || '/' || storage.objects.name
        )
    )
  );

CREATE POLICY read_conversation_message_audio ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'messages'
    AND EXISTS (
      SELECT 1
      FROM public.messages
      JOIN public.conversations ON conversations.id = messages.conversation_id
      WHERE (conversations.user_a = auth.uid() OR conversations.user_b = auth.uid())
        AND (
          messages.voice_path = storage.objects.name
          OR messages.voice_path = storage.objects.bucket_id || '/' || storage.objects.name
        )
    )
  );

CREATE POLICY admins_read_audio ON storage.objects
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    AND bucket_id IN ('voices', 'messages')
  );
