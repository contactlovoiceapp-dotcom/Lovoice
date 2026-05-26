/* Keeps the OS app icon badge in sync with the in-app unread/unseen counts.
   The badge is the sum of unread messages and unseen received likes. */

import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';

import { useUnseenLikesCount } from '@/features/likes/hooks/useUnseenLikes';
import { useUnreadMessagesCount } from '@/features/chat/hooks/useUnreadMessagesCount';

export function useAppIconBadge(): void {
  const unseenLikes = useUnseenLikesCount();
  const unreadMessages = useUnreadMessagesCount();

  useEffect(() => {
    const total = unseenLikes + unreadMessages;

    Notifications.setBadgeCountAsync(total).catch((error: unknown) => {
      console.warn('[push] Failed to set badge count:', error);
    });
  }, [unseenLikes, unreadMessages]);
}
