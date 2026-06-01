/* Mutes foreground push for the conversation the user is currently viewing. Without this, a
   message arriving while you are already in the thread still posts a notification that lingers
   on the lock screen and later reopens an already-read conversation (V1's server fan-out has no
   presence skip — see docs/ARCHITECTURE.md §6). Complements the entry-point dismissal in
   app/(main)/messages/[id].tsx, which clears notifications that arrived before you opened it. */

import { useEffect } from 'react';

import {
  setForegroundNotificationSuppressionFilter,
  conversationPushDeepLink,
} from '@/lib/push';
import { getViewedConversationId } from '@/features/chat/lib/conversationRealtimeService';

export function useActiveConversationPushMute(): void {
  useEffect(() => {
    setForegroundNotificationSuppressionFilter((data) => {
      const viewedId = getViewedConversationId();
      if (!viewedId) return false;
      return data.deep_link === conversationPushDeepLink(viewedId);
    });
    return () => setForegroundNotificationSuppressionFilter(null);
  }, []);
}
