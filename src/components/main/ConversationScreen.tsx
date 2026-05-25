/* Presentational conversation screen — message list, composer, and header. No data fetching. */

import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Text, View } from 'react-native';

import { COLORS, FONT, RADIUS } from '@/theme';
import { COPY } from '@/copy';
import type { ChatMessage, ConversationDetails } from '@/features/chat/types';
import { groupMessagesIntoBursts } from '@/features/chat/types';
import MessageBubble from '@/features/chat/components/MessageBubble';
import ConversationComposer from '@/features/chat/components/ConversationComposer';
import ConversationHeader from '@/features/chat/components/ConversationHeader';
import ActionsSheet from '@/features/moderation/components/ActionsSheet';
import ReportSheet from '@/features/moderation/components/ReportSheet';
import BlockConfirmModal from '@/features/moderation/components/BlockConfirmModal';
import MemberProfileModal from '@/features/profile/components/MemberProfileModal';

export interface ConversationScreenProps {
  details: ConversationDetails | undefined;
  messages: ChatMessage[];
  isLoadingDetails: boolean;
  isLoadingMessages: boolean;
  fetchOlderMessages: () => void;
  hasOlderMessages: boolean;
  isFetchingOlder: boolean;
  onSendText: (body: string) => Promise<void>;
  onSendVoice: (uri: string, durationMs: number) => Promise<void>;
  onRetrySend: (clientId: string) => void;
  onClose: () => void;
  onCountdownExpired: () => void;
  currentUserId: string;
  isSending: boolean;
  isSendingVoice: boolean;
  otherIsTyping: boolean;
  otherIsRecording: boolean;
  onRecordingStateChange: (isRecording: boolean) => void;
  onTextChange: (text: string) => void;
}

// The voice-only countdown lives in the composer bar (voice_only state).
// The header subtitle stays static and complementary.
function deriveHeaderSubtitle(details: ConversationDetails | undefined): string {
  if (!details) return '';
  const { lifecycle } = details;
  if (lifecycle.state === 'awaiting_reply') {
    return details.iAmInitiator
      ? COPY.chat.inbox.awaitingBadge
      : COPY.chat.conversation.composerHintRecipientReply;
  }
  if (lifecycle.state === 'voice_only') return COPY.chat.inbox.voiceOnlyBadge;
  return '';
}

// Inline info banner — shown at the top of the message list (ListFooterComponent on inverted FlatList)
// when the current user is the recipient who hasn't replied yet.
function ConversationInfoBanner({ name }: { name: string }) {
  return (
    <View
      style={{
        marginHorizontal: 16,
        marginTop: 12,
        marginBottom: 8,
        paddingVertical: 10,
        paddingHorizontal: 14,
        backgroundColor: COLORS.surface,
        borderRadius: RADIUS.card,
        borderWidth: 1,
        borderColor: COLORS.border,
      }}
    >
      <Text
        style={{
          fontFamily: FONT.regular,
          fontSize: 13,
          color: COLORS.textSecondary,
          textAlign: 'center',
          lineHeight: 18,
        }}
      >
        {COPY.chat.conversation.conversationInfoBanner(name)}
      </Text>
    </View>
  );
}

export default function ConversationScreen({
  details,
  messages,
  isLoadingDetails,
  isLoadingMessages,
  fetchOlderMessages,
  hasOlderMessages,
  isFetchingOlder,
  onSendText,
  onSendVoice,
  onRetrySend,
  onClose,
  onCountdownExpired,
  currentUserId,
  isSending,
  isSendingVoice,
  otherIsTyping,
  otherIsRecording,
  onRecordingStateChange,
  onTextChange,
}: ConversationScreenProps) {
  const [actionsVisible, setActionsVisible] = useState(false);
  const [reportVisible, setReportVisible] = useState(false);
  const [blockVisible, setBlockVisible] = useState(false);
  const [profileVisible, setProfileVisible] = useState(false);

  const burstMessages = useMemo(() => groupMessagesIntoBursts(messages), [messages]);

  const handlePressMore = useCallback(() => setActionsVisible(true), []);
  const handleCloseActions = useCallback(() => setActionsVisible(false), []);
  const handleOpenReport = useCallback(() => {
    setActionsVisible(false);
    setReportVisible(true);
  }, []);
  const handleOpenBlock = useCallback(() => {
    setActionsVisible(false);
    setBlockVisible(true);
  }, []);

  const otherName = details?.otherDisplayName ?? '';
  const fallbackSubtitle = deriveHeaderSubtitle(details);
  const headerSubtitle = otherIsRecording
    ? COPY.chat.conversation.otherIsRecording(otherName)
    : otherIsTyping
      ? COPY.chat.conversation.otherIsTyping(otherName)
      : fallbackSubtitle;
  const avatarEmoji = details?.otherEmojis[0] ?? '💬';

  if (isLoadingDetails && !details) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.background }}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      <ConversationHeader
        displayName={details?.otherDisplayName ?? ''}
        subtitle={headerSubtitle}
        avatarEmoji={avatarEmoji}
        onClose={onClose}
        onPressMore={handlePressMore}
        onPressProfile={() => setProfileVisible(true)}
      />

      {isLoadingMessages && messages.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="small" color={COLORS.primary} />
        </View>
      ) : (
        <FlatList
          inverted
          data={burstMessages}
          keyExtractor={(item) => item.message.clientId}
          contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 8 }}
          onEndReached={hasOlderMessages ? fetchOlderMessages : undefined}
          onEndReachedThreshold={0.3}
          ListFooterComponent={
            <>
              {details?.lifecycle.state === 'awaiting_reply' && !details.iAmInitiator && (
                <ConversationInfoBanner name={details.otherDisplayName} />
              )}
              {isFetchingOlder && (
                <ActivityIndicator size="small" color={COLORS.primary} style={{ marginVertical: 12 }} />
              )}
            </>
          }
          renderItem={({ item }) => (
            <MessageBubble
              message={item.message}
              isMine={item.message.senderId === currentUserId}
              showTimestamp={item.showTimestamp}
              onRetry={
                item.message.status === 'failed'
                  ? () => onRetrySend(item.message.clientId)
                  : undefined
              }
            />
          )}
        />
      )}

      <ConversationComposer
        lifecycle={details?.lifecycle ?? { state: 'empty' }}
        iAmInitiator={details?.iAmInitiator ?? false}
        otherDisplayName={details?.otherDisplayName ?? ''}
        onSendText={onSendText}
        onSendVoice={onSendVoice}
        isSending={isSending}
        isSendingVoice={isSendingVoice}
        onRecordingStateChange={onRecordingStateChange}
        onTextChange={onTextChange}
        onCountdownExpired={onCountdownExpired}
      />

      {details && (
        <>
          <ActionsSheet
            visible={actionsVisible}
            displayName={details.otherDisplayName}
            onReport={handleOpenReport}
            onBlock={handleOpenBlock}
            onClose={handleCloseActions}
          />

          <ReportSheet
            visible={reportVisible}
            displayName={details.otherDisplayName}
            targetKind="profile"
            targetId={details.otherUserId}
            targetUserId={details.otherUserId}
            onClose={() => setReportVisible(false)}
          />

          <BlockConfirmModal
            visible={blockVisible}
            displayName={details.otherDisplayName}
            blockedUserId={details.otherUserId}
            onClose={() => setBlockVisible(false)}
          />
        </>
      )}

      {/* onOpenConversation closes the modal instead of pushing a duplicate route —
          the user is already inside this conversation. */}
      <MemberProfileModal
        visible={profileVisible}
        userId={details?.otherUserId ?? null}
        voiceId={details?.otherActiveVoiceId ?? null}
        onClose={() => setProfileVisible(false)}
        onOpenConversation={() => setProfileVisible(false)}
      />
    </View>
  );
}
