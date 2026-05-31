/* Keeps the OS app icon badge in sync with the in-app unread/unseen counts.
   The badge is the sum of unread messages and unseen received likes, updated
   whenever those React Query counters change — on any tab, foreground or not.

   The setBadgeCountAsync call is debounced because a single message exchange
   triggers multiple count changes in quick succession (Realtime INSERT, query
   refetch, conversation read marking). Coalescing them collapses a burst of
   3–5 native TurboModule calls into one, reducing pressure on the native
   bridge during the same window where push-tap navigation can race with
   Hermes GC (see docs/CHAT_AUDIO.md). */

import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';

import { useUnseenLikesCount } from '@/features/likes/hooks/useUnseenLikes';
import { useUnreadMessagesCount } from '@/features/chat/hooks/useUnreadMessagesCount';

const BADGE_DEBOUNCE_MS = 300;

export function useAppIconBadge(): void {
  const unseenLikes = useUnseenLikesCount();
  const unreadMessages = useUnreadMessagesCount();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const total = unseenLikes + unreadMessages;

    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      Notifications.setBadgeCountAsync(total).catch((error: unknown) => {
        console.warn('[push] Failed to set badge count:', error);
      });
    }, BADGE_DEBOUNCE_MS);

    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [unseenLikes, unreadMessages]);
}
