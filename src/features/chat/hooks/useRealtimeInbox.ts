/* Global Realtime listener for the messages inbox — subscribes to postgres_changes
   INSERT/UPDATE on messages (RLS-filtered) so the inbox query is invalidated
   regardless of which tab is currently active. Must be mounted at the main
   _layout level.

   UPDATE events (read receipts mostly) are debounced into a single invalidation
   to avoid storms of React Query notifications when both participants are
   exchanging messages — the original implementation invalidated the inbox on
   every single read_at update, which contributed to the bridge pressure that
   triggered the Hermes corruption crash. */

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { RealtimeChannel } from '@supabase/supabase-js';

import { getSupabaseClient } from '@/lib/supabase';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { chatQueryKeys } from '../api/conversationQueries';
import { createDebouncer } from '../lib/throttle';

const INBOX_UPDATE_DEBOUNCE_MS = 500;

export function useRealtimeInbox(): void {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase || !session) return;

    const updateDebouncer = createDebouncer(() => {
      void queryClient.invalidateQueries({ queryKey: chatQueryKeys.inbox });
    }, INBOX_UPDATE_DEBOUNCE_MS);

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
          updateDebouncer.schedule();
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
      updateDebouncer.cancel();
      void supabase.removeChannel(channel);
    };
  }, [session, queryClient]);
}
