/* Global Realtime listener for the messages inbox — subscribes to postgres_changes
   INSERT on messages (RLS-filtered) so the inbox query is invalidated regardless of
   which tab is currently active. Must be mounted at the main _layout level. */

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { RealtimeChannel } from '@supabase/supabase-js';

import { getSupabaseClient } from '@/lib/supabase';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { chatQueryKeys } from '../api/conversationQueries';

export function useRealtimeInbox(): void {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase || !session) return;

    const channel = supabase
      .channel(`global-inbox:${session.user.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        () => {
          void queryClient.invalidateQueries({ queryKey: chatQueryKeys.inbox });
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages' },
        () => {
          // read_at updates also affect unread counts displayed in the inbox.
          void queryClient.invalidateQueries({ queryKey: chatQueryKeys.inbox });
        },
      )
      .subscribe((status, err) => {
        if (__DEV__) {
          if (status === 'SUBSCRIBED') {
            console.log('[RealtimeInbox] subscribed');
          } else if (status === 'CHANNEL_ERROR') {
            console.warn('[RealtimeInbox] channel error', err?.message);
          } else if (status === 'TIMED_OUT') {
            console.warn('[RealtimeInbox] subscription timed out');
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
