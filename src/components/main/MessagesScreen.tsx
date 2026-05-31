/* Presentational inbox screen — renders a list of conversations from props, no data fetching. */

import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  View,
} from 'react-native';
import { MessageCircle } from 'lucide-react-native';

import { COLORS, FONT, RADIUS } from '../../theme';
import { COPY } from '../../copy';
import { formatRelativeTime } from '../../lib/formatRelativeTime';
import type { ConversationLifecycle, InboxConversation } from '../../features/chat/types';

export interface MessagesScreenProps {
  conversations: InboxConversation[];
  isLoading: boolean;
  isError: boolean;
  onRefresh: () => Promise<void> | void;
  isRefreshing: boolean;
  onOpenConversation: (conversationId: string) => void;
}

function LifecyclePill({ lifecycle }: { lifecycle: ConversationLifecycle }) {
  if (lifecycle.state !== 'awaiting_reply' && lifecycle.state !== 'voice_only') {
    return null;
  }

  const label =
    lifecycle.state === 'awaiting_reply'
      ? COPY.chat.inbox.awaitingBadge
      : COPY.chat.inbox.voiceOnlyBadge;

  return (
    <View
      style={{
        alignSelf: 'flex-start',
        borderRadius: RADIUS.full,
        backgroundColor: COLORS.primaryMuted,
        paddingHorizontal: 8,
        paddingVertical: 2,
        marginBottom: 2,
      }}
    >
      <Text style={{ fontFamily: FONT.medium, fontSize: 11, color: COLORS.primary }}>
        {label}
      </Text>
    </View>
  );
}

function ConversationRow({
  conversation,
  onPress,
}: {
  conversation: InboxConversation;
  onPress: () => void;
}) {
  const isDeleted = conversation.isOtherAccountDeleted;
  const isUnread = !isDeleted && conversation.unreadCount > 0;
  const firstEmoji = isDeleted ? '💬' : (conversation.avatarEmojis[0] ?? '💬');

  const rowContent = (
    <>
      <View
        style={{
          width: 56,
          height: 56,
          borderRadius: 28,
          backgroundColor: COLORS.primaryMuted,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: isDeleted ? 0.55 : 1,
        }}
      >
        <Text style={{ fontSize: 26 }}>{firstEmoji}</Text>
      </View>

      <View style={{ flex: 1, opacity: isDeleted ? 0.55 : 1 }}>
        <Text
          style={{
            fontFamily: isUnread ? FONT.bold : FONT.semibold,
            fontSize: 16,
            color: COLORS.dark,
            marginBottom: 2,
          }}
          numberOfLines={1}
        >
          {conversation.displayName}
        </Text>

        {!isDeleted && <LifecyclePill lifecycle={conversation.lifecycle} />}

        <Text
          style={{
            fontFamily: isUnread ? FONT.bold : FONT.regular,
            fontSize: 14,
            color: COLORS.textSecondary,
          }}
          numberOfLines={1}
        >
          {conversation.lastMessagePreview}
        </Text>
      </View>

      <View style={{ alignItems: 'flex-end', gap: 4, opacity: isDeleted ? 0.55 : 1 }}>
        {!isDeleted && (
          <Text style={{ fontFamily: FONT.regular, fontSize: 12, color: COLORS.textTertiary }}>
            {formatRelativeTime(conversation.lastMessageAt)}
          </Text>
        )}

        {isUnread && (
          <View
            accessibilityLabel={COPY.chat.inbox.unreadAria(conversation.unreadCount)}
            style={{
              backgroundColor: COLORS.primary,
              borderRadius: RADIUS.full,
              minWidth: 20,
              height: 20,
              alignItems: 'center',
              justifyContent: 'center',
              paddingHorizontal: 6,
            }}
          >
            <Text style={{ fontFamily: FONT.bold, fontSize: 11, color: '#ffffff' }}>
              {conversation.unreadCount}
            </Text>
          </View>
        )}
      </View>
    </>
  );

  if (isDeleted) {
    return (
      <View
        accessibilityRole="text"
        accessibilityLabel={COPY.chat.inbox.deletedAccountA11y}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingVertical: 12,
          gap: 12,
          borderBottomWidth: 1,
          borderBottomColor: COLORS.border,
        }}
      >
        {rowContent}
      </View>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint={COPY.chat.inbox.openConversationHint}
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        gap: 12,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.border,
      }}
    >
      {rowContent}
    </Pressable>
  );
}

function EmptyStateView() {
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 48,
      }}
    >
      <View
        style={{
          width: 72,
          height: 72,
          borderRadius: 36,
          backgroundColor: COLORS.primaryMuted,
          borderWidth: 1,
          borderColor: COLORS.border,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 24,
        }}
      >
        <MessageCircle size={30} color={COLORS.primary} />
      </View>

      <Text
        style={{
          fontFamily: FONT.bold,
          fontSize: 20,
          color: COLORS.dark,
          textAlign: 'center',
          marginBottom: 8,
        }}
      >
        {COPY.chat.inbox.emptyTitle}
      </Text>

      <Text
        style={{
          fontFamily: FONT.regular,
          fontSize: 14,
          color: COLORS.textSecondary,
          textAlign: 'center',
          maxWidth: 250,
        }}
      >
        {COPY.chat.inbox.emptyBody}
      </Text>
    </View>
  );
}

const MessagesScreen: React.FC<MessagesScreenProps> = ({
  conversations,
  isLoading,
  isError,
  onRefresh,
  isRefreshing,
  onOpenConversation,
}) => {
  // Tick every minute so relative-time labels (e.g. "À l'instant" → "Il y a 1 min") stay current.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  return (
    <View style={{ flex: 1, flexDirection: 'column' }}>
      <Text
        style={{
          fontFamily: FONT.extrabold,
          fontSize: 26,
          color: COLORS.dark,
          marginBottom: 16,
        }}
      >
        {COPY.chat.inbox.title}
      </Text>

      {isLoading && conversations.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : isError ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          <Text
            style={{
              fontFamily: FONT.medium,
              fontSize: 14,
              color: COLORS.textSecondary,
              textAlign: 'center',
            }}
          >
            {COPY.chat.inbox.errorTitle}
          </Text>
          <Pressable
            onPress={onRefresh}
            style={{
              borderRadius: RADIUS.full,
              backgroundColor: COLORS.primaryMuted,
              paddingHorizontal: 20,
              paddingVertical: 10,
            }}
          >
            <Text style={{ fontFamily: FONT.semibold, fontSize: 14, color: COLORS.primary }}>
              {COPY.chat.inbox.retry}
            </Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(c) => c.conversationId}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={onRefresh}
              tintColor={COLORS.primary}
            />
          }
          ListEmptyComponent={<EmptyStateView />}
          renderItem={({ item }) => (
            <ConversationRow
              conversation={item}
              onPress={() => onOpenConversation(item.conversationId)}
            />
          )}
        />
      )}
    </View>
  );
};

export default MessagesScreen;
