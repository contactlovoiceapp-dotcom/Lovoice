/* Derives the total unread message count across all conversations from the cached inbox query. */

import { useConversations } from '../api/conversationQueries';

export function useUnreadMessagesCount(): number {
  const { data } = useConversations();
  if (!data) return 0;
  return data.reduce((sum, conv) => sum + conv.unreadCount, 0);
}
