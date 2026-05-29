/* Global Realtime listener for the messages inbox — subscribes to postgres_changes
   INSERT/UPDATE on messages (RLS-filtered) so the inbox query is invalidated
   regardless of which tab is currently active. Must be mounted at the main
   _layout level.

   UPDATE events (read receipts mostly) are debounced into a single invalidation
   to avoid storms of React Query notifications when both participants are
   exchanging messages.

   INSERT events are deferred via useResumeGuard during the foreground resume
   window (~500 ms after background → active). On resume, Supabase Realtime
   replays queued INSERT callbacks while iOS is still running keyboard and
   navigation transitions; calling queryClient.invalidateQueries immediately
   would add to the bridge load and risk the GCScope::_newChunkAndPHV Hermes
   corruption (see docs/CHAT_AUDIO.md §13). */

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { RealtimeChannel } from '@supabase/supabase-js';

import { getSupabaseClient } from '@/lib/supabase';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { chatQueryKeys } from '../api/conversationQueries';
import { createDebouncer } from '../lib/throttle';
import { useResumeGuard } from './useResumeGuard';

const INBOX_UPDATE_DEBOUNCE_MS = 500;

export function useRealtimeInbox(): void {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const channelRef = useRef<RealtimeChannel | null>(null);

  const { runAfterResume } = useResumeGuard();

  // Stable ref so the effect closure captures the latest runAfterResume without
  // needing it as a dependency (avoids unnecessary channel re-subscriptions).
  const runAfterResumeRef = useRef(runAfterResume);
  runAfterResumeRef.current = runAfterResume;

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase || !session) return;

    // Guard against concurrent-mode reconnect: React's
    // recursivelyTraverseReconnectPassiveEffects can re-run the setup function
    // without calling cleanup first. Removing a stale channel here prevents
    // "cannot add 'postgres_changes' callbacks after subscribe()" errors.
    if (channelRef.current) {
      const staleChannel = channelRef.current;
      channelRef.current = null;
      void supabase.removeChannel(staleChannel);
    }

    const updateDebouncer = createDebouncer(() => {
      void queryClient.invalidateQueries({ queryKey: chatQueryKeys.inbox });
    }, INBOX_UPDATE_DEBOUNCE_MS);

    const channel = supabase
      .channel(`global-inbox:${session.user.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        () => {
          runAfterResumeRef.current(() => {
            void queryClient.invalidateQueries({ queryKey: chatQueryKeys.inbox });
          });
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
