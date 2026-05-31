/* Single chat bubble — renders text and voice messages with inline playback. */

import React, { useMemo } from 'react';
import { ActivityIndicator, Dimensions, Pressable, Text, View } from 'react-native';
import { AlertCircle, Play, Pause } from 'lucide-react-native';

import { COLORS, FONT } from '@/theme';
import { COPY } from '@/copy';
import { formatRelativeTime } from '@/lib/formatRelativeTime';
import type { ChatMessage } from '../types';
import {
  useChatMessagePlayer,
  generateBarHeights,
  type ChatMessagePlayerErrorCode,
} from '../lib/chatMessagePlayer';

const MAX_BUBBLE_WIDTH = Dimensions.get('window').width * 0.75;
const VOICE_BUBBLE_WIDTH = 250;
const VOICE_BUBBLE_HEIGHT = 44;
const BAR_COUNT = 28;

function playbackErrorMessage(code: ChatMessagePlayerErrorCode | null): string {
  const map = COPY.chat.conversation.voiceMessage.playErrors;
  if (code && code in map) {
    return map[code];
  }
  return map.play_failed;
}

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

function VoiceBubbleContent({
  message,
  isMine,
}: {
  message: ChatMessage;
  isMine: boolean;
}) {
  const isLocalFile = message.status === 'sending';
  const source = message.voicePath;

  // Use clientId (stable across the optimistic→confirmed transition) so the
  // player's "active bubble" identifier never flips mid-playback when the
  // server confirms a just-sent voice message.
  const { snapshot, controls } = useChatMessagePlayer({
    messageId: message.clientId,
    source,
    isLocalFile,
  });

  const bars = useMemo(() => generateBarHeights(message.clientId, BAR_COUNT), [message.clientId]);
  const durationMs = message.voiceDurationMs ?? 0;
  const progress =
    snapshot.durationMs > 0 ? snapshot.positionMs / snapshot.durationMs : 0;

  const barColor = isMine ? 'rgba(255,255,255,0.6)' : COLORS.darkMuted;
  const barActiveColor = isMine ? '#ffffff' : COLORS.dark;
  const textColor = isMine ? '#ffffff' : COLORS.dark;
  const iconColor = isMine ? '#ffffff' : COLORS.primary;
  const errorColor = isMine ? 'rgba(255,255,255,0.85)' : '#ef4444';

  const displayDuration = snapshot.isPlaying
    ? formatDurationMmSs(snapshot.positionMs)
    : formatDurationMmSs(durationMs);

  // Error state: show a clear "can't play" indicator with tap-to-retry.
  if (snapshot.error) {
    return (
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          width: VOICE_BUBBLE_WIDTH,
          height: VOICE_BUBBLE_HEIGHT,
          gap: 8,
        }}
      >
        <Pressable
          onPress={controls.play}
          accessibilityLabel={COPY.chat.conversation.voiceMessage.playA11y}
          accessibilityRole="button"
          hitSlop={8}
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <AlertCircle size={18} color={errorColor} />
        </Pressable>
        <Text
          style={{
            flex: 1,
            fontFamily: FONT.regular,
            fontSize: 12,
            color: errorColor,
          }}
          numberOfLines={1}
        >
          {playbackErrorMessage(snapshot.error)}
        </Text>
      </View>
    );
  }

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        width: VOICE_BUBBLE_WIDTH,
        height: VOICE_BUBBLE_HEIGHT,
        gap: 8,
      }}
    >
      <Pressable
        onPress={snapshot.isPlaying ? controls.pause : controls.play}
        accessibilityLabel={
          snapshot.isPlaying
            ? COPY.chat.conversation.voiceMessage.pauseA11y
            : COPY.chat.conversation.voiceMessage.playA11y
        }
        accessibilityRole="button"
        testID="voice-play-button"
        hitSlop={8}
        style={{
          width: 36,
          height: 36,
          borderRadius: 18,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {snapshot.isLoading ? (
          <ActivityIndicator size="small" color={iconColor} />
        ) : snapshot.isPlaying ? (
          <Pause size={18} color={iconColor} fill={iconColor} />
        ) : (
          <Play size={18} color={iconColor} fill={iconColor} />
        )}
      </Pressable>

      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'flex-end', height: 24, gap: 1 }}>
        {bars.map((h, i) => {
          const filled = i / bars.length < progress;
          return (
            <View
              key={i}
              style={{
                flex: 1,
                height: `${h * 100}%`,
                borderRadius: 1,
                backgroundColor: filled ? barActiveColor : barColor,
              }}
            />
          );
        })}
      </View>

      <Text
        style={{
          fontFamily: FONT.medium,
          fontSize: 12,
          color: textColor,
          minWidth: 34,
          textAlign: 'right',
        }}
      >
        {displayDuration}
      </Text>
    </View>
  );
}

export default function MessageBubble({
  message,
  isMine,
  onRetry,
  showTimestamp,
}: MessageBubbleProps) {
  const isVoice = message.kind === 'voice';

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
          paddingVertical: isVoice ? 8 : 10,
          paddingHorizontal: isVoice ? 10 : 14,
          borderWidth: isMine ? 0 : 1,
          borderColor: COLORS.border,
          opacity: message.status === 'sending' ? 0.7 : 1,
        }}
      >
        {isVoice ? (
          <VoiceBubbleContent message={message} isMine={isMine} />
        ) : (
          <Text
            style={{
              fontFamily: FONT.regular,
              fontSize: 15,
              color: isMine ? '#ffffff' : COLORS.dark,
              lineHeight: 21,
            }}
          >
            {message.bodyText ?? ''}
          </Text>
        )}
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
