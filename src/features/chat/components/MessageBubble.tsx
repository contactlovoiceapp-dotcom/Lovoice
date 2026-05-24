/* Single chat bubble — renders text messages (voice playback added in Block 7.5). */

import React from 'react';
import { Dimensions, Pressable, Text, View } from 'react-native';

import { COLORS, FONT } from '@/theme';
import { COPY } from '@/copy';
import { formatRelativeTime } from '@/lib/formatRelativeTime';
import type { ChatMessage } from '../types';

const MAX_BUBBLE_WIDTH = Dimensions.get('window').width * 0.75;

interface MessageBubbleProps {
  message: ChatMessage;
  isMine: boolean;
  onRetry?: () => void;
  showTimestamp: boolean;
}

function StatusLabel({
  message,
  onRetry,
}: {
  message: ChatMessage;
  onRetry?: () => void;
}) {
  if (message.status === 'sending') {
    return (
      <Text style={{ fontFamily: FONT.regular, fontSize: 11, color: COLORS.textTertiary }}>
        {COPY.chat.conversation.status.sending}
      </Text>
    );
  }

  if (message.status === 'failed') {
    return (
      <Pressable onPress={onRetry} accessibilityRole="button" testID="retry-button">
        <Text style={{ fontFamily: FONT.medium, fontSize: 11, color: '#ef4444' }}>
          {COPY.chat.conversation.status.failedTap}
        </Text>
      </Pressable>
    );
  }

  if (message.readAt) {
    return (
      <Text style={{ fontFamily: FONT.regular, fontSize: 11, color: COLORS.textTertiary }}>
        {COPY.chat.conversation.status.read}
      </Text>
    );
  }

  return (
    <Text style={{ fontFamily: FONT.regular, fontSize: 11, color: COLORS.textTertiary }}>
      {COPY.chat.conversation.status.sent}
    </Text>
  );
}

export default function MessageBubble({
  message,
  isMine,
  onRetry,
  showTimestamp,
}: MessageBubbleProps) {
  const isVoice = message.kind === 'voice';

  const bubbleContent = isVoice
    ? `🎤 Vocal · ${formatDurationMmSs(message.voiceDurationMs ?? 0)}`
    : message.bodyText ?? '';

  return (
    <View
      style={{
        alignSelf: isMine ? 'flex-end' : 'flex-start',
        maxWidth: MAX_BUBBLE_WIDTH,
        marginBottom: showTimestamp ? 10 : 3,
      }}
    >
      <View
        style={{
          backgroundColor: isMine ? COLORS.primary : COLORS.surface,
          borderRadius: 18,
          borderBottomRightRadius: isMine ? 4 : 18,
          borderBottomLeftRadius: isMine ? 18 : 4,
          paddingVertical: 10,
          paddingHorizontal: 14,
          borderWidth: isMine ? 0 : 1,
          borderColor: COLORS.border,
          opacity: message.status === 'sending' ? 0.7 : 1,
        }}
      >
        <Text
          style={{
            fontFamily: FONT.regular,
            fontSize: 15,
            color: isMine ? '#ffffff' : COLORS.dark,
            lineHeight: 21,
          }}
        >
          {bubbleContent}
        </Text>
      </View>

      {showTimestamp && (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            marginTop: 3,
            alignSelf: isMine ? 'flex-end' : 'flex-start',
            paddingHorizontal: 4,
          }}
        >
          <Text style={{ fontFamily: FONT.regular, fontSize: 11, color: COLORS.textTertiary }}>
            {formatRelativeTime(message.createdAt)}
          </Text>
          {isMine && <StatusLabel message={message} onRetry={onRetry} />}
        </View>
      )}
    </View>
  );
}

function formatDurationMmSs(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
