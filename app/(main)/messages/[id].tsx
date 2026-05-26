/* Conversation route — wires Realtime subscriptions, queries, and mutations into ConversationScreen. */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient, type InfiniteData } from '@tanstack/react-query';
import type { RealtimeChannel } from '@supabase/supabase-js';

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
import { createThrottle } from '../../../src/features/chat/lib/throttle';
import ConversationScreen from '../../../src/components/main/ConversationScreen';

// How long (ms) with no typing event before the indicator auto-clears.
const TYPING_CLEAR_DELAY_MS = 5_000;
// Safety-net auto-clear for recording indicator (the sender always emits false, but guard anyway).
const RECORDING_CLEAR_DELAY_MS = 10_000;
// Throttle window for typing=true broadcasts.
const TYPING_THROTTLE_MS = 3_000;

interface BroadcastPayload {
  userId: string;
  value: boolean;
  ts: number;
}

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

  // Realtime-broadcast state: indicators from the other participant.
  const [otherIsTyping, setOtherIsTyping] = useState(false);
  const [otherIsRecording, setOtherIsRecording] = useState(false);

  // Stable ref to the active Realtime channel so emit helpers can access it.
  const channelRef = useRef<RealtimeChannel | null>(null);
  const channelReadyRef = useRef(false);

  // Typing throttle — created once per conversation mount.
  const typingThrottleRef = useRef(createThrottle(TYPING_THROTTLE_MS));

  // Auto-clear timers.
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recordingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Mark unread messages as read when the screen is focused.
  const markRead = useCallback(() => {
    if (!id || !currentUserId) return;
    markMessagesRead({ conversationId: id });
  }, [id, currentUserId, markMessagesRead]);

  // Keep a ref so the Realtime effect does not depend on markRead identity.
  const markReadRef = useRef(markRead);
  markReadRef.current = markRead;

  useFocusEffect(
    useCallback(() => {
      markRead();
    }, [markRead]),
  );

  // Subscribe to Realtime: postgres_changes (new messages + read receipt updates) +
  // broadcast events (typing / recording indicators from the other participant).
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
          void queryClient.invalidateQueries({ queryKey: chatQueryKeys.conversation(id) });
          void queryClient.invalidateQueries({ queryKey: chatQueryKeys.inbox });
          markReadRef.current();
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
      .on('broadcast', { event: 'typing' }, ({ payload }: { payload: BroadcastPayload }) => {
        if (payload.userId === currentUserId) return;

        if (payload.value) {
          setOtherIsTyping(true);
          if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
          typingTimerRef.current = setTimeout(() => setOtherIsTyping(false), TYPING_CLEAR_DELAY_MS);
        } else {
          if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
          setOtherIsTyping(false);
        }
      })
      .on('broadcast', { event: 'recording' }, ({ payload }: { payload: BroadcastPayload }) => {
        if (payload.userId === currentUserId) return;

        if (payload.value) {
          setOtherIsRecording(true);
          if (recordingTimerRef.current) clearTimeout(recordingTimerRef.current);
          recordingTimerRef.current = setTimeout(() => setOtherIsRecording(false), RECORDING_CLEAR_DELAY_MS);
        } else {
          if (recordingTimerRef.current) clearTimeout(recordingTimerRef.current);
          setOtherIsRecording(false);
        }
      })
      .subscribe((status, err) => {
        channelReadyRef.current = status === 'SUBSCRIBED';
        if (__DEV__) {
          if (status === 'SUBSCRIBED') {
            console.log(`[RealtimeConv] conv:${id} subscribed`);
          } else if (status === 'CHANNEL_ERROR') {
            console.warn(`[RealtimeConv] conv:${id} error`, err?.message);
          } else if (status === 'TIMED_OUT') {
            console.warn(`[RealtimeConv] conv:${id} timed out`);
          }
        }
      });

    channelRef.current = channel;

    return () => {
      if (channelReadyRef.current) {
        void channel.send({
          type: 'broadcast',
          event: 'typing',
          payload: { userId: currentUserId, value: false, ts: Date.now() },
        });
        void channel.send({
          type: 'broadcast',
          event: 'recording',
          payload: { userId: currentUserId, value: false, ts: Date.now() },
        });
      }
      channelReadyRef.current = false;
      void supabase.removeChannel(channel);
      channelRef.current = null;

      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      if (recordingTimerRef.current) clearTimeout(recordingTimerRef.current);
    };
  }, [session, id, queryClient, currentUserId]);

  // Emit helpers — no-op when the channel isn't subscribed yet.
  const emitTyping = useCallback(
    (value: boolean) => {
      const channel = channelRef.current;
      if (!channel || !channelReadyRef.current) return;
      // Throttle value=true; always send value=false immediately.
      if (value && !typingThrottleRef.current.ping()) return;
      if (!value) typingThrottleRef.current.flush();
      void channel.send({
        type: 'broadcast',
        event: 'typing',
        payload: { userId: currentUserId, value, ts: Date.now() },
      });
    },
    [currentUserId],
  );

  const emitRecording = useCallback(
    (value: boolean) => {
      const channel = channelRef.current;
      if (!channel || !channelReadyRef.current) return;
      void channel.send({
        type: 'broadcast',
        event: 'recording',
        payload: { userId: currentUserId, value, ts: Date.now() },
      });
    },
    [currentUserId],
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
    router.back();
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
