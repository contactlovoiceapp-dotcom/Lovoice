/* Session-scoped host that wires React deps (Supabase client, query client, current
   user, resume guard, mark-read mutation) into conversationRealtimeService. Mounted
   once in app/(main)/_layout.tsx, like useRealtimeInbox, so the conversation Realtime
   channel outlives individual screen mounts and no longer re-subscribes on every
   notification tap (see docs/REALTIME_STABILITY.md §5 Step 2). */

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { getSupabaseClient } from '@/lib/supabase';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { useMarkMessagesRead } from '../api/messageMutations';
import { useResumeGuard } from './useResumeGuard';
import {
  configureConversationRealtime,
  setActiveConversationId,
} from '../lib/conversationRealtimeService';

export function useConversationRealtimeHost(): void {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const currentUserId = session?.user?.id ?? '';
  const { runAfterResume } = useResumeGuard();
  const { mutate: markMessagesRead } = useMarkMessagesRead();

  useEffect(() => {
    configureConversationRealtime({
      supabase: getSupabaseClient(),
      queryClient,
      currentUserId,
      runAfterResume,
      markConversationRead: (conversationId) => markMessagesRead({ conversationId }),
    });
  }, [queryClient, currentUserId, runAfterResume, markMessagesRead]);

  // Tear down the active channel on logout so a stale subscription never leaks
  // across sessions.
  useEffect(() => {
    if (!session) {
      setActiveConversationId(null);
    }
  }, [session]);
}
