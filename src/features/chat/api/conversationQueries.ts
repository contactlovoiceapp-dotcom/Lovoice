/* React Query hooks for reading conversations: inbox list and per-conversation details. */

import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { getSupabaseClient } from '@/lib/supabase';
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
  } | null;
  profile_b: {
    id: string;
    display_name: string;
    bio_emojis: string[];
    birthdate: string;
    city: string;
  } | null;
}

interface RawLastMessage {
  conversation_id: string;
  kind: string;
  body_text: string | null;
  voice_duration_ms: number | null;
  sender_id: string;
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
          'profile_a:profiles!conversations_user_a_fkey(id, display_name, bio_emojis, birthdate, city), ' +
          'profile_b:profiles!conversations_user_b_fkey(id, display_name, bio_emojis, birthdate, city)',
        )
        .or(`user_a.eq.${uid},user_b.eq.${uid}`)
        .not('last_message_at', 'is', null)
        .order('last_message_at', { ascending: false })
        .limit(50);

      if (convError) throw new Error(convError.message);

      const convRows = (rawConvs ?? []) as unknown as RawConversationRow[];
      if (convRows.length === 0) return [];

      const convIds = convRows.map((c) => c.id);

      // Fetch the latest message per conversation in one batched query.
      // Results are DESC-sorted; we take the first occurrence per conversation_id in JS.
      const { data: rawMsgs, error: msgError } = await supabase
        .from('messages')
        .select('conversation_id, kind, body_text, voice_duration_ms, sender_id')
        .in('conversation_id', convIds)
        .order('created_at', { ascending: false })
        // Generous limit: assumes at most ~10 concurrent active convos; convIds.length covers MVP.
        .limit(convIds.length * 5);

      if (msgError) throw new Error(msgError.message);

      // Build lastMessage map — first occurrence per conversation_id is the newest (sorted DESC).
      const lastMsgMap = new Map<string, RawLastMessage>();
      for (const msg of (rawMsgs ?? []) as RawLastMessage[]) {
        if (!lastMsgMap.has(msg.conversation_id)) {
          lastMsgMap.set(msg.conversation_id, msg);
        }
      }

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
          const lastMsg = lastMsgMap.get(conv.id) as RawLastMessage;

          // Safe cast: row passed the filter so both profile joins must be non-null in valid data.
          const displayName = otherProfile?.display_name ?? '';
          const avatarEmojis = otherProfile?.bio_emojis ?? [];

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
            lastMessagePreview: formatLastMessagePreview({
              kind: lastMsg.kind,
              body_text: lastMsg.body_text,
              voice_duration_ms: lastMsg.voice_duration_ms,
            }),
            lastMessageKind: lastMsg.kind as MessageKind,
            lastMessageSenderIsMe: lastMsg.sender_id === uid,
            unreadCount: unreadCountMap.get(conv.id) ?? 0,
            lifecycle: deriveLifecycle(convRow, true),
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
          'profile_a:profiles!conversations_user_a_fkey(id, display_name, bio_emojis, birthdate, city), ' +
          'profile_b:profiles!conversations_user_b_fkey(id, display_name, bio_emojis, birthdate, city)',
        )
        .eq('id', conversationId as string)
        .single();

      if (convError) throw new Error(convError.message);

      const conv = rawConv as unknown as RawConversationRow & { created_at: string };

      const iAmA = conv.user_a === uid;
      const otherProfile = iAmA ? conv.profile_b : conv.profile_a;
      const otherUserId = iAmA ? conv.user_b : conv.user_a;

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
        otherDisplayName: otherProfile?.display_name ?? '',
        otherCity: otherProfile?.city ?? '',
        otherEmojis: otherProfile?.bio_emojis ?? [],
        otherBirthdate: otherProfile?.birthdate ?? '',
        otherActiveVoiceId: voiceRow?.id ?? null,
        lifecycle: deriveLifecycle(convRow, (msgCount ?? 0) > 0),
        initiatorId: conv.initiator_id,
        iAmInitiator: conv.initiator_id === uid,
      };
    },
  });
}
