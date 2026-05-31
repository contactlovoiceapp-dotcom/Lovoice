/* Conversation route — wires queries and mutations into ConversationScreen. The
   conv:<id> Realtime channel (INSERT/UPDATE handlers, typing/recording broadcasts,
   debouncers, foreground-resume guard) is owned by the session-scoped
   conversationRealtimeService; this screen only declares itself active and reads
   typing/recording state via useActiveConversation. Decoupling the channel from this
   screen's mount/unmount stops the re-subscribe churn on every notification tap
   (see docs/REALTIME_STABILITY.md §5 Step 2). */

import React, { useCallback, useEffect, useMemo } from 'react';
import { BackHandler, KeyboardAvoidingView, Platform, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
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
import { useActiveConversation } from '../../../src/features/chat/hooks/useActiveConversation';
import ConversationScreen from '../../../src/components/main/ConversationScreen';
import { closeConversation } from '../../../src/navigation/messagesNavigation';
import { dismissNotificationsForConversation } from '../../../src/lib/push';

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
  const { mutate: markMessagesRead } = useMarkMessagesRead();

  // Realtime-broadcast state + emit helpers from the session-scoped service. The
  // channel lifecycle lives in conversationRealtimeService, not in this screen.
  const { otherIsTyping, otherIsRecording, emitTyping, emitRecording } =
    useActiveConversation(id ?? null);

  // Mark unread messages as read when the screen is focused.
  const markRead = useCallback(() => {
    if (!id || !currentUserId) return;
    markMessagesRead({ conversationId: id });
  }, [id, currentUserId, markMessagesRead]);

  useFocusEffect(
    useCallback(() => {
      if (id) {
        void dismissNotificationsForConversation(id);
      }
      markRead();
    }, [id, markRead]),
  );

  const handleSendText = useCallback(
    async (body: string) => {
      if (!id) return;
      // Clear typing indicator on send.
      emitTyping(false);
      await sendTextMutation.mutateAsync({ conversationId: id, bodyText: body });
    },
    [id, sendTextMutation, emitTyping],
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
    closeConversation();
  }, []);

  useEffect(() => {
    if (isLoadingDetails || !details) return;
    if (details.isOtherAccountDeleted) {
      closeConversation();
    }
  }, [isLoadingDetails, details]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      closeConversation();
      return true;
    });
    return () => subscription.remove();
  }, []);

  const handleCountdownExpired = useCallback(() => {
    if (!id) return;
    void queryClient.invalidateQueries({ queryKey: chatQueryKeys.conversation(id) });
  }, [id, queryClient]);

  const handleTextChange = useCallback(
    (text: string) => {
      emitTyping(text.trim().length > 0);
    },
    [emitTyping],
  );

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
          otherIsTyping={otherIsTyping}
          otherIsRecording={otherIsRecording}
          onRecordingStateChange={emitRecording}
          onTextChange={handleTextChange}
        />
      </KeyboardAvoidingView>
    </View>
  );
}
