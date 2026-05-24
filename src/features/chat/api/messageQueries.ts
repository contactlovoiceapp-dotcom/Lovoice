/* React Query hook for paginated message history in a conversation. */

import {
  useInfiniteQuery,
  type UseInfiniteQueryResult,
  type InfiniteData,
} from '@tanstack/react-query';

import { getSupabaseClient } from '@/lib/supabase';
import type { ChatMessage, MessageKind, MessageRow } from '../types';
import { chatQueryKeys } from './conversationQueries';

const PAGE_SIZE = 30;

function rowToMessage(row: MessageRow): ChatMessage {
  return {
    id: row.id,
    clientId: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    kind: row.kind as MessageKind,
    bodyText: row.body_text,
    voicePath: row.voice_path,
    voiceDurationMs: row.voice_duration_ms,
    status: 'sent',
    failureReason: null,
    createdAt: row.created_at,
    readAt: row.read_at,
  };
}

export { rowToMessage };

export function useConversationMessages(
  conversationId: string | null,
): UseInfiniteQueryResult<InfiniteData<ChatMessage[]>, Error> {
  return useInfiniteQuery<
    ChatMessage[],
    Error,
    InfiniteData<ChatMessage[]>,
    ReturnType<typeof chatQueryKeys.messages>,
    string | null
  >({
    queryKey: chatQueryKeys.messages(conversationId ?? ''),
    enabled: conversationId !== null,
    initialPageParam: null,
    getNextPageParam: (lastPage) => {
      // Cursor is the created_at of the oldest row on the page; null when page is incomplete.
      if (lastPage.length < PAGE_SIZE) return null;
      return lastPage[lastPage.length - 1].createdAt;
    },
    queryFn: async ({ pageParam }) => {
      const supabase = getSupabaseClient();
      if (!supabase) throw new Error('chat.supabase_unavailable');

      let query = supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId as string)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE);

      // Cursor pagination: fetch messages older than the last seen created_at.
      if (pageParam) {
        query = query.lt('created_at', pageParam);
      }

      const { data, error } = await query;

      if (error) throw new Error(error.message);

      return (data ?? []).map(rowToMessage);
    },
  });
}
