/* Global Realtime listener for received likes — invalidates the received-likes query
   so the Likes tab badge stays live regardless of which tab is active. Mounted at
   the main _layout level alongside useRealtimeInbox. Requires public.likes in the
   supabase_realtime publication (see migration 20260531130000). */

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { RealtimeChannel } from '@supabase/supabase-js';

import { getSupabaseClient } from '@/lib/supabase';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { likeQueryKeys } from '@/features/likes/api/likeQueries';
import { removeChannelsByName } from '@/features/chat/lib/realtimeChannels';
import { useResumeGuard } from '@/features/chat/hooks/useResumeGuard';

export function useRealtimeLikes(): void {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const channelRef = useRef<RealtimeChannel | null>(null);

  const { runAfterResume } = useResumeGuard();
  const runAfterResumeRef = useRef(runAfterResume);
  runAfterResumeRef.current = runAfterResume;

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase || !session) return;

    channelRef.current = null;
    removeChannelsByName(supabase, `global-likes:${session.user.id}`);

    const channel = supabase
      .channel(`global-likes:${session.user.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'likes' },
        (payload) => {
          const likerId = (payload?.new as { liker_id?: string } | undefined)?.liker_id;
          // RLS may deliver our own likes too — only refresh when someone else liked us.
          if (likerId === session.user.id) return;

          runAfterResumeRef.current(() => {
            void queryClient.invalidateQueries({ queryKey: likeQueryKeys.received });
          });
        },
      )
      .subscribe((status, err) => {
        if (__DEV__) {
          if (status === 'SUBSCRIBED') {
            console.log('[RealtimeLikes] subscribed');
          } else if (status === 'CHANNEL_ERROR') {
            console.warn('[RealtimeLikes] channel error', err?.message);
          } else if (status === 'TIMED_OUT') {
            console.warn('[RealtimeLikes] subscription timed out');
          }
        }
      });

    channelRef.current = channel;

    return () => {
      channelRef.current = null;
      void supabase.removeChannel(channel);
    };
  }, [session, queryClient]);
}
