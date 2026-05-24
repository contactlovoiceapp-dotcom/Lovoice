/* Conversation route — wires Realtime subscriptions, queries, and mutations into ConversationScreen. */

import React, { useCallback, useEffect, useMemo } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient, type InfiniteData } from '@tanstack/react-query';

import { COLORS } from '../../../src/theme';
import { useAuth } from '../../../src/features/auth/hooks/useAuth';
import {
  useConversationDetails,
  chatQueryKeys,
} from '../../../src/features/chat/api/conversationQueries';
import { useConversationMessages } from '../../../src/features/chat/api/messageQueries';
import {
  useSendTextMessage,
  useSendVoiceMessage,
  useMarkMessagesRead,
} from '../../../src/features/chat/api/messageMutations';
import type { ChatMessage } from '../../../src/features/chat/types';
import { getSupabaseClient } from '../../../src/lib/supabase';
import ConversationScreen from '../../../src/components/main/ConversationScreen';

export default function ConversationRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const currentUserId = session?.user?.id ?? '';

  const { data: details, isLoading: isLoadingDetails } = useConversationDetails(id ?? null);

  const {
    data: messagePages,
    isLoading: isLoadingMessages,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useConversationMessages(id ?? null);

  const messages = useMemo<ChatMessage[]>(
    () => messagePages?.pages.flat() ?? [],
    [messagePages],
  );

  const sendTextMutation = useSendTextMessage();
  const sendVoiceMutation = useSendVoiceMessage();
  const markReadMutation = useMarkMessagesRead();

  // Mark unread messages as read when the screen is focused.
  const markRead = useCallback(() => {
    if (!id || !currentUserId) return;
    markReadMutation.mutate({ conversationId: id });
  }, [id, currentUserId, markReadMutation]);

  useFocusEffect(
    useCallback(() => {
      markRead();
    }, [markRead]),
  );

  // Subscribe to Realtime: new messages (INSERT) and read receipt updates (UPDATE).
  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase || !session || !id) return;

    const channel = supabase
      .channel(`conv:${id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${id}`,
        },
        () => {
          void queryClient.invalidateQueries({ queryKey: chatQueryKeys.messages(id) });
          markRead();
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${id}`,
        },
        () => {
          void queryClient.invalidateQueries({ queryKey: chatQueryKeys.messages(id) });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [session, id, queryClient, markRead]);

  const handleSendText = useCallback(
    async (body: string) => {
      if (!id) return;
      await sendTextMutation.mutateAsync({ conversationId: id, bodyText: body });
    },
    [id, sendTextMutation],
  );

  const handleSendVoice = useCallback(
    async (uri: string, durationMs: number) => {
      if (!id) return;
      await sendVoiceMutation.mutateAsync({ conversationId: id, uri, durationMs });
    },
    [id, sendVoiceMutation],
  );

  const handleRetrySend = useCallback(
    (clientId: string) => {
      if (!id) return;
      const oldData = queryClient.getQueryData<InfiniteData<ChatMessage[]>>(
        chatQueryKeys.messages(id),
      );
      const failed = oldData?.pages.flat().find((m) => m.clientId === clientId);
      if (!failed || failed.kind !== 'text' || !failed.bodyText) return;
      sendTextMutation.mutate({ conversationId: id, bodyText: failed.bodyText });
    },
    [id, queryClient, sendTextMutation],
  );

  const handleClose = useCallback(() => {
    router.back();
  }, []);

  const handleCountdownExpired = useCallback(() => {
    if (!id) return;
    void queryClient.invalidateQueries({ queryKey: chatQueryKeys.conversation(id) });
  }, [id, queryClient]);

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView
        style={{ flex: 1, paddingTop: insets.top }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <ConversationScreen
          details={details}
          messages={messages}
          isLoadingDetails={isLoadingDetails}
          isLoadingMessages={isLoadingMessages}
          fetchOlderMessages={() => void fetchNextPage()}
          hasOlderMessages={hasNextPage ?? false}
          isFetchingOlder={isFetchingNextPage}
          onSendText={handleSendText}
          onSendVoice={handleSendVoice}
          onRetrySend={handleRetrySend}
          onClose={handleClose}
          onCountdownExpired={handleCountdownExpired}
          currentUserId={currentUserId}
          isSending={sendTextMutation.isPending}
          isSendingVoice={sendVoiceMutation.isPending}
        />
      </KeyboardAvoidingView>
    </View>
  );
}
