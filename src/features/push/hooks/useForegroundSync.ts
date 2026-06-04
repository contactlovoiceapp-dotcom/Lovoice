/* Reconciles server state on every background → active transition.

   The inbox and received-likes queries only refresh from live Supabase Realtime
   events, which are not delivered while the app is backgrounded or killed — exactly
   when push notifications are generated. On resume we therefore invalidate those
   queries so the Likes screen and the in-app Messages badge reflect anything that
   happened while we were away, instead of waiting for staleTime to expire.

   Invalidations are deferred via InteractionManager: on resume, Supabase Realtime
   reconnects and replays queued postgres_changes while iOS runs keyboard/navigation
   transitions; invalidating immediately adds to the native↔JS bridge pressure and
   risks the GCScope::_newChunkAndPHV Hermes corruption (see docs/CHAT_AUDIO.md §13
   and useResumeGuard). */

import { useEffect } from 'react';
import { AppState, InteractionManager } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';

import { chatQueryKeys } from '@/features/chat/api/conversationQueries';
import { likeQueryKeys } from '@/features/likes/api/likeQueries';

export function useForegroundSync(): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active') return;

      InteractionManager.runAfterInteractions(() => {
        void queryClient.invalidateQueries({ queryKey: chatQueryKeys.inbox });
        void queryClient.invalidateQueries({ queryKey: likeQueryKeys.received });
        void queryClient.invalidateQueries({ queryKey: likeQueryKeys.given });
      });
    });

    return () => subscription.remove();
  }, [queryClient]);
}
