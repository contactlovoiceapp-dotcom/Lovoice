/* Composer bar — text input + hold-to-record voice, adapts to the 4-state conversation lifecycle. */

import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  PanResponder,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Mic, Pause, Play, Send, X } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

import { COLORS, FONT, RADIUS } from '@/theme';
import { COPY } from '@/copy';
import type { ConversationLifecycle } from '../types';
import { useChatVoiceRecorder } from '../hooks/useChatVoiceRecorder';
import { useVoicePlayer } from '@/features/voices/hooks/useVoicePlayer';
import { pauseAllChatMessages } from '../lib/chatMessagePlayer';

const CANCEL_THRESHOLD_Y = -60;

interface ConversationComposerProps {
  lifecycle: ConversationLifecycle;
  iAmInitiator: boolean;
  otherDisplayName: string;
  onSendText: (body: string) => Promise<void>;
  onSendVoice: (uri: string, durationMs: number) => Promise<void>;
  isSending: boolean;
  isSendingVoice: boolean;
  /** Hook for Block 7.6 — typing/recording broadcasts. */
  onRecordingStateChange?: (isRecording: boolean) => void;
}

function HintBanner({ text }: { text: string }) {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: COLORS.primaryMuted,
        borderRadius: RADIUS.input,
        paddingVertical: 12,
        paddingHorizontal: 14,
        justifyContent: 'center',
      }}
    >
      <Text
        style={{
          fontFamily: FONT.medium,
          fontSize: 13,
          color: COLORS.primary,
          textAlign: 'center',
        }}
      >
        {text}
      </Text>
    </View>
  );
}

function formatTimer(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function ConversationComposer({
  lifecycle,
  iAmInitiator,
  otherDisplayName,
  onSendText,
  onSendVoice,
  isSending,
  isSendingVoice,
  onRecordingStateChange,
}: ConversationComposerProps) {
  const insets = useSafeAreaInsets();
  const [text, setText] = useState('');
  const [tooShortHint, setTooShortHint] = useState(false);

  const recorder = useChatVoiceRecorder();
  const previewPlayer = useVoicePlayer({ uri: recorder.result?.uri ?? null });

  const isRecording = recorder.state === 'recording' || recorder.state === 'cancel_hover';
  const isPreview = recorder.state === 'preview';
  const isCancelHover = recorder.state === 'cancel_hover';

  // Whether releasing the button should preview (vs direct send).
  const shouldPreview =
    lifecycle.state === 'empty' || lifecycle.state === 'awaiting_reply';

  const canSendText = text.trim().length > 0 && !isSending;

  const handleSendText = useCallback(async () => {
    const body = text.trim();
    if (!body) return;
    setText('');
    await onSendText(body);
  }, [text, onSendText]);

  // PanResponder for slide-up cancel detection during recording.
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_evt, gs) => Math.abs(gs.dy) > 10,
      onPanResponderMove: (_evt, gs) => {
        if (gs.dy < CANCEL_THRESHOLD_Y) {
          recorder.setCancelHover(true);
        } else {
          recorder.setCancelHover(false);
        }
      },
      onPanResponderRelease: () => {
        // Release handling is done in onPressOut.
      },
    }),
  ).current;

  const handlePressIn = useCallback(async () => {
    setTooShortHint(false);
    pauseAllChatMessages();
    onRecordingStateChange?.(true);
    await recorder.start();
  }, [recorder, onRecordingStateChange]);

  const handlePressOut = useCallback(async () => {
    onRecordingStateChange?.(false);

    if (recorder.state === 'cancel_hover') {
      await recorder.reset();
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }

    if (recorder.state !== 'recording') return;

    if (shouldPreview) {
      await recorder.stopAndPreview();
      if (recorder.error === 'too_short') {
        setTooShortHint(true);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    } else {
      const result = await recorder.stopAndSend();
      if (result) {
        await onSendVoice(result.uri, result.durationMs);
      } else if (recorder.error === 'too_short') {
        setTooShortHint(true);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    }
  }, [recorder, shouldPreview, onSendVoice, onRecordingStateChange]);

  const handlePreviewSend = useCallback(async () => {
    if (!recorder.result) return;
    previewPlayer.stop();
    await onSendVoice(recorder.result.uri, recorder.result.durationMs);
    await recorder.reset();
  }, [recorder, previewPlayer, onSendVoice]);

  const handlePreviewDiscard = useCallback(async () => {
    previewPlayer.stop();
    await recorder.reset();
  }, [recorder, previewPlayer]);

  const handleRerecord = useCallback(async () => {
    previewPlayer.stop();
    pauseAllChatMessages();
    onRecordingStateChange?.(true);
    await recorder.rerecord();
  }, [recorder, previewPlayer, onRecordingStateChange]);

  const containerStyle = {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: insets.bottom + 8,
    backgroundColor: COLORS.background,
  };

  // Recording overlay state.
  if (isRecording) {
    return (
      <View style={containerStyle} {...panResponder.panHandlers}>
        {isCancelHover ? (
          <View style={{ alignItems: 'center', paddingVertical: 14 }}>
            <View
              style={{
                backgroundColor: '#ef4444',
                borderRadius: RADIUS.cta,
                paddingVertical: 8,
                paddingHorizontal: 16,
              }}
            >
              <Text style={{ fontFamily: FONT.medium, fontSize: 14, color: '#ffffff' }}>
                ✕ {COPY.chat.conversation.recordingCancelHint}
              </Text>
            </View>
          </View>
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 }}>
            <View
              style={{
                width: 10,
                height: 10,
                borderRadius: 5,
                backgroundColor: '#ef4444',
              }}
            />
            <Text style={{ fontFamily: FONT.medium, fontSize: 15, color: COLORS.dark }}>
              {formatTimer(recorder.durationMs)} / 1:30
            </Text>
            <View style={{ flex: 1 }} />
            <Text style={{ fontFamily: FONT.regular, fontSize: 12, color: COLORS.textSecondary }}>
              {COPY.chat.conversation.recordingHint}
            </Text>
          </View>
        )}

        <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 8 }}>
          <View
            style={{
              width: 52,
              height: 52,
              borderRadius: 26,
              backgroundColor: '#ef4444',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Mic size={22} color="#ffffff" />
          </View>
        </View>
      </View>
    );
  }

  // Preview state.
  if (isPreview && recorder.result) {
    return (
      <View style={{ ...containerStyle, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Pressable
          onPress={handlePreviewDiscard}
          accessibilityLabel={COPY.chat.conversation.preview.discard}
          accessibilityRole="button"
          style={{
            width: 32,
            height: 32,
            borderRadius: 16,
            backgroundColor: COLORS.primaryMuted,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <X size={16} color={COLORS.primary} />
        </Pressable>

        <Pressable
          onPress={previewPlayer.isPlaying ? previewPlayer.pause : () => void previewPlayer.play()}
          accessibilityLabel={
            previewPlayer.isPlaying
              ? COPY.chat.conversation.preview.pauseA11y
              : COPY.chat.conversation.preview.playA11y
          }
          accessibilityRole="button"
          testID="preview-play-button"
          style={{
            width: 32,
            height: 32,
            borderRadius: 16,
            backgroundColor: COLORS.primary,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {previewPlayer.isPlaying ? (
            <Pause size={14} color="#ffffff" fill="#ffffff" />
          ) : (
            <Play size={14} color="#ffffff" fill="#ffffff" />
          )}
        </Pressable>

        <Text style={{ fontFamily: FONT.medium, fontSize: 13, color: COLORS.dark, flex: 1 }}>
          {formatTimer(recorder.result.durationMs)}
        </Text>

        <Pressable
          onPress={handleRerecord}
          accessibilityRole="button"
        >
          <Text style={{ fontFamily: FONT.medium, fontSize: 13, color: COLORS.primary }}>
            {COPY.chat.conversation.preview.reRecord}
          </Text>
        </Pressable>

        <Pressable
          onPress={() => void handlePreviewSend()}
          disabled={isSendingVoice}
          accessibilityLabel={COPY.chat.conversation.preview.send}
          accessibilityRole="button"
          testID="preview-send-button"
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: COLORS.primary,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: isSendingVoice ? 0.5 : 1,
          }}
        >
          {isSendingVoice ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <Send size={16} color="#ffffff" />
          )}
        </Pressable>
      </View>
    );
  }

  // Sending voice overlay.
  if (isSendingVoice) {
    return (
      <View style={{ ...containerStyle, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="small" color={COLORS.primary} />
        <Text style={{ fontFamily: FONT.medium, fontSize: 13, color: COLORS.textSecondary, marginLeft: 8 }}>
          {COPY.chat.conversation.status.sending}
        </Text>
      </View>
    );
  }

  // Too-short hint toast.
  const tooShortBanner = tooShortHint ? (
    <Text
      style={{
        fontFamily: FONT.regular,
        fontSize: 12,
        color: '#ef4444',
        textAlign: 'center',
        marginBottom: 4,
      }}
    >
      {COPY.chat.conversation.recordingTooShort}
    </Text>
  ) : null;

  // Error hint.
  const errorBanner = recorder.error && recorder.error !== 'too_short' ? (
    <Text
      style={{
        fontFamily: FONT.regular,
        fontSize: 12,
        color: '#ef4444',
        textAlign: 'center',
        marginBottom: 4,
      }}
    >
      {COPY.chat.conversation.recordingError}
    </Text>
  ) : null;

  // Voice button — press-and-hold for recording.
  const voiceButton = (
    <Pressable
      onPressIn={() => void handlePressIn()}
      onPressOut={() => void handlePressOut()}
      accessibilityLabel={COPY.chat.conversation.voiceCtaLabel}
      accessibilityRole="button"
      testID="voice-button"
      style={{
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: COLORS.primaryMuted,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Mic size={18} color={COLORS.primary} />
    </Pressable>
  );

  // Lifecycle-based idle renders.
  if (lifecycle.state === 'empty') {
    const hintText = iAmInitiator
      ? COPY.chat.conversation.composerHintInitial
      : COPY.chat.conversation.composerHintEmptyDefensive;

    return (
      <View style={containerStyle}>
        {tooShortBanner}
        {errorBanner}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <HintBanner text={hintText} />
          {iAmInitiator && voiceButton}
        </View>
      </View>
    );
  }

  if (lifecycle.state === 'awaiting_reply') {
    const hintText = iAmInitiator
      ? COPY.chat.conversation.composerHintAwaiting(otherDisplayName)
      : COPY.chat.conversation.composerHintRecipientReply;

    return (
      <View style={containerStyle}>
        {tooShortBanner}
        {errorBanner}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <HintBanner text={hintText} />
          {!iAmInitiator && voiceButton}
        </View>
      </View>
    );
  }

  if (lifecycle.state === 'voice_only') {
    return (
      <View style={containerStyle}>
        {tooShortBanner}
        {errorBanner}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <HintBanner text={COPY.chat.conversation.composerHintVoiceOnly} />
          {voiceButton}
        </View>
      </View>
    );
  }

  // lifecycle.state === 'open'
  return (
    <View style={containerStyle}>
      {tooShortBanner}
      {errorBanner}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
        {voiceButton}

        <TextInput
          value={text}
          onChangeText={setText}
          placeholder={COPY.chat.conversation.inputPlaceholder}
          placeholderTextColor={COLORS.textTertiary}
          multiline
          maxLength={1000}
          onSubmitEditing={() => void handleSendText()}
          blurOnSubmit={false}
          style={{
            flex: 1,
            backgroundColor: COLORS.surface,
            borderRadius: RADIUS.input,
            borderWidth: 1,
            borderColor: COLORS.border,
            paddingHorizontal: 14,
            paddingVertical: 10,
            color: COLORS.dark,
            fontFamily: FONT.regular,
            fontSize: 15,
            maxHeight: 120,
          }}
          testID="composer-input"
        />

        <Pressable
          onPress={() => void handleSendText()}
          disabled={!canSendText}
          accessibilityLabel={COPY.chat.conversation.sendCta}
          accessibilityRole="button"
          testID="send-button"
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: COLORS.primary,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: canSendText ? 1 : 0.4,
          }}
        >
          <Send size={18} color="#ffffff" />
        </Pressable>
      </View>
    </View>
  );
}
