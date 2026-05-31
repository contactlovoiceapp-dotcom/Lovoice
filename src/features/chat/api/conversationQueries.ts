/* React Query hooks for reading conversations: inbox list and per-conversation details. */

import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { getSupabaseClient } from '@/lib/supabase';
import { COPY } from '@/copy';
import { fetchLastMessagePerConversation } from './inboxLastMessages';
import { isDeletedOtherAccount } from '../constants';
import {
  deriveLifecycle,
  formatLastMessagePreview,
  type ConversationDetails,
  type ConversationRow,
  type InboxConversation,
  type MessageKind,
} from '../types';

export const chatQueryKeys = {
  all: ['chat'] as const,
  inbox: ['chat', 'inbox'] as const,
  feedConversations: ['chat', 'feed-conversations'] as const,
  conversation: (id: string) => ['chat', 'conversation', id] as const,
  messages: (id: string) => ['chat', 'conversation', id, 'messages'] as const,
};

// Raw shape returned by PostgREST for the nested profile joins on conversations.
interface RawConversationRow {
  id: string;
  user_a: string;
  user_b: string;
  initiator_id: string;
  first_reply_at: string | null;
  last_message_at: string | null;
  profile_a: {
    id: string;
    display_name: string;
    bio_emojis: string[];
    birthdate: string;
    city: string;
    deleted_at: string | null;
  } | null;
  profile_b: {
    id: string;
    display_name: string;
    bio_emojis: string[];
    birthdate: string;
    city: string;
    deleted_at: string | null;
  } | null;
}

export function useConversations(): UseQueryResult<InboxConversation[], Error> {
  return useQuery<InboxConversation[], Error>({
    queryKey: chatQueryKeys.inbox,
    staleTime: 1000 * 30,
    queryFn: async () => {
      const supabase = getSupabaseClient();
      if (!supabase) throw new Error('chat.supabase_unavailable');

      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) throw new Error('chat.session_missing');

      // Fetch all conversations for the current user that have at least one message.
      const { data: rawConvs, error: convError } = await supabase
        .from('conversations')
        .select(
          'id, user_a, user_b, initiator_id, first_reply_at, last_message_at, ' +
          'profile_a:profiles!conversations_user_a_fkey(id, display_name, bio_emojis, birthdate, city, deleted_at), ' +
          'profile_b:profiles!conversations_user_b_fkey(id, display_name, bio_emojis, birthdate, city, deleted_at)',
        )
        .or(`user_a.eq.${uid},user_b.eq.${uid}`)
        .not('last_message_at', 'is', null)
        .order('last_message_at', { ascending: false })
        .limit(50);

      if (convError) throw new Error(convError.message);

      const convRows = (rawConvs ?? []) as unknown as RawConversationRow[];
      if (convRows.length === 0) return [];

      const convIds = convRows.map((c) => c.id);

      const lastMsgMap = await fetchLastMessagePerConversation(supabase, convIds);

      // Count unread messages (sender != me AND read_at IS NULL) for all conversations at once.
      const { data: unreadRows, error: unreadError } = await supabase
        .from('messages')
        .select('conversation_id')
        .in('conversation_id', convIds)
        .neq('sender_id', uid)
        .is('read_at', null);

      if (unreadError) throw new Error(unreadError.message);

      const unreadCountMap = new Map<string, number>();
      for (const row of unreadRows ?? []) {
        const prev = unreadCountMap.get(row.conversation_id) ?? 0;
        unreadCountMap.set(row.conversation_id, prev + 1);
      }

      return convRows
        .filter((conv) => lastMsgMap.has(conv.id))
        .map((conv): InboxConversation => {
          const iAmA = conv.user_a === uid;
          const otherProfile = iAmA ? conv.profile_b : conv.profile_a;
          const otherUserId = iAmA ? conv.user_b : conv.user_a;
          const lastMsg = lastMsgMap.get(conv.id)!;
          const otherAccountDeleted = isDeletedOtherAccount(otherUserId, otherProfile);

          const displayName = otherAccountDeleted
            ? COPY.chat.inbox.deletedAccountName
            : (otherProfile?.display_name ?? COPY.chat.inbox.deletedAccountName);
          const avatarEmojis = otherAccountDeleted ? [] : (otherProfile?.bio_emojis ?? []);

          const convRow: ConversationRow = {
            id: conv.id,
            user_a: conv.user_a,
            user_b: conv.user_b,
            initiator_id: conv.initiator_id,
            first_reply_at: conv.first_reply_at,
            last_message_at: conv.last_message_at,
            created_at: '',
          };

          return {
            conversationId: conv.id,
            otherUserId,
            displayName,
            avatarEmojis,
            lastMessageAt: conv.last_message_at as string,
            lastMessagePreview: otherAccountDeleted
              ? COPY.chat.inbox.deletedAccountPreview
              : formatLastMessagePreview({
                  kind: lastMsg.kind,
                  body_text: lastMsg.body_text,
                  voice_duration_ms: lastMsg.voice_duration_ms,
                }),
            lastMessageKind: lastMsg.kind as MessageKind,
            lastMessageSenderIsMe: lastMsg.sender_id === uid,
            unreadCount: otherAccountDeleted ? 0 : (unreadCountMap.get(conv.id) ?? 0),
            lifecycle: deriveLifecycle(convRow, true),
            isOtherAccountDeleted: otherAccountDeleted,
          };
        });
    },
  });
}

interface FeedConversationRow {
  id: string;
  user_a: string;
  user_b: string;
}

/** Maps other-user IDs to conversation IDs for feed cards (any thread with messages). */
export type FeedConversationMap = Record<string, string>;

export function useFeedConversationMap(): UseQueryResult<FeedConversationMap, Error> {
  return useQuery<FeedConversationMap, Error>({
    queryKey: chatQueryKeys.feedConversations,
    staleTime: 1000 * 30,
    queryFn: async (): Promise<FeedConversationMap> => {
      const supabase = getSupabaseClient();
      if (!supabase) throw new Error('chat.supabase_unavailable');

      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) throw new Error('chat.session_missing');

      const { data, error } = await supabase
        .from('conversations')
        .select('id, user_a, user_b')
        .or(`user_a.eq.${uid},user_b.eq.${uid}`)
        .not('last_message_at', 'is', null);

      if (error) throw new Error(error.message);

      const map: FeedConversationMap = {};
      for (const row of (data ?? []) as FeedConversationRow[]) {
        const otherUserId = row.user_a === uid ? row.user_b : row.user_a;
        map[otherUserId] = row.id;
      }
      return map;
    },
  });
}

export function useConversationDetails(
  conversationId: string | null,
): UseQueryResult<ConversationDetails, Error> {
  return useQuery<ConversationDetails, Error>({
    queryKey: conversationId ? chatQueryKeys.conversation(conversationId) : ['chat', 'conversation', 'none'],
    enabled: conversationId !== null,
    staleTime: 1000 * 60,
    queryFn: async () => {
      const supabase = getSupabaseClient();
      if (!supabase) throw new Error('chat.supabase_unavailable');

      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) throw new Error('chat.session_missing');

      const { data: rawConv, error: convError } = await supabase
        .from('conversations')
        .select(
          'id, user_a, user_b, initiator_id, first_reply_at, last_message_at, created_at, ' +
          'profile_a:profiles!conversations_user_a_fkey(id, display_name, bio_emojis, birthdate, city, deleted_at), ' +
          'profile_b:profiles!conversations_user_b_fkey(id, display_name, bio_emojis, birthdate, city, deleted_at)',
        )
        .eq('id', conversationId as string)
        .single();

      if (convError) throw new Error(convError.message);

      const conv = rawConv as unknown as RawConversationRow & { created_at: string };

      const iAmA = conv.user_a === uid;
      const otherProfile = iAmA ? conv.profile_b : conv.profile_a;
      const otherUserId = iAmA ? conv.user_b : conv.user_a;
      const otherAccountDeleted = isDeletedOtherAccount(otherUserId, otherProfile);

      // Count messages to distinguish 'empty' from the other states in deriveLifecycle.
      const { count: msgCount, error: countError } = await supabase
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .eq('conversation_id', conversationId as string);

      if (countError) throw new Error(countError.message);

      // Fetch the other user's currently active voice for context display.
      const { data: voiceRow, error: voiceError } = await supabase
        .from('voices')
        .select('id')
        .eq('user_id', otherUserId)
        .eq('is_active', true)
        .maybeSingle();

      if (voiceError) throw new Error(voiceError.message);

      const convRow: ConversationRow = {
        id: conv.id,
        user_a: conv.user_a,
        user_b: conv.user_b,
        initiator_id: conv.initiator_id,
        first_reply_at: conv.first_reply_at,
        last_message_at: conv.last_message_at,
        created_at: conv.created_at,
      };

      return {
        conversationId: conv.id,
        otherUserId,
        otherDisplayName: otherAccountDeleted
          ? COPY.chat.inbox.deletedAccountName
          : (otherProfile?.display_name ?? COPY.chat.inbox.deletedAccountName),
        otherCity: otherAccountDeleted ? '' : (otherProfile?.city ?? ''),
        otherEmojis: otherAccountDeleted ? [] : (otherProfile?.bio_emojis ?? []),
        otherBirthdate: otherAccountDeleted ? '' : (otherProfile?.birthdate ?? ''),
        otherActiveVoiceId: voiceRow?.id ?? null,
        lifecycle: deriveLifecycle(convRow, (msgCount ?? 0) > 0),
        initiatorId: conv.initiator_id,
        iAmInitiator: conv.initiator_id === uid,
        isOtherAccountDeleted: otherAccountDeleted,
      };
    },
  });
}
