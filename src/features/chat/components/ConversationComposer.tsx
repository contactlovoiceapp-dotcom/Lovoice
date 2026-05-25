/* Composer bar — text input + tap-to-record voice, adapts to the 4-state conversation lifecycle. */

import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowRight, Mic, Send, X } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

import { COLORS, FONT, RADIUS } from '@/theme';
import { COPY } from '@/copy';
import type { ConversationLifecycle } from '../types';
import { formatVoiceOnlyCountdown } from '../types';
import { useChatVoiceRecorder } from '../hooks/useChatVoiceRecorder';
import { pauseAllChatMessages } from '../lib/chatMessagePlayer';

interface ConversationComposerProps {
  lifecycle: ConversationLifecycle;
  iAmInitiator: boolean;
  otherDisplayName: string;
  onSendText: (body: string) => Promise<void>;
  onSendVoice: (uri: string, durationMs: number) => Promise<void>;
  isSending: boolean;
  isSendingVoice: boolean;
  onTextChange?: (text: string) => void;
  onRecordingStateChange?: (isRecording: boolean) => void;
  /** Called when the voice-only window expires so the route can re-fetch the lifecycle. */
  onCountdownExpired?: () => void;
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

/**
 * Ticking countdown banner for the voice-only window.
 * Fires onExpired when the target time is reached.
 */
function VoiceOnlyHintBanner({
  voiceOnlyUntil,
  onExpired,
}: {
  voiceOnlyUntil: string;
  onExpired?: () => void;
}) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const { hours, minutes, expired } = formatVoiceOnlyCountdown(voiceOnlyUntil, now);

  useEffect(() => {
    if (expired) onExpired?.();
  }, [expired, onExpired]);

  const text = expired
    ? COPY.chat.conversation.composerHintVoiceOnly(0, 0)
    : COPY.chat.conversation.composerHintVoiceOnly(hours, minutes);

  return <HintBanner text={text} />;
}

export default function ConversationComposer({
  lifecycle,
  iAmInitiator,
  otherDisplayName,
  onSendText,
  onSendVoice,
  isSending,
  isSendingVoice,
  onTextChange,
  onRecordingStateChange,
  onCountdownExpired,
}: ConversationComposerProps) {
  const insets = useSafeAreaInsets();
  const [text, setText] = useState('');
  const [tooShortHint, setTooShortHint] = useState(false);

  const recorder = useChatVoiceRecorder();
  const isRecording = recorder.state === 'recording';

  const canSendText = text.trim().length > 0 && !isSending;

  const handleSendText = useCallback(async () => {
    const body = text.trim();
    if (!body) return;
    setText('');
    await onSendText(body);
  }, [text, onSendText]);

  const handleStartRecording = useCallback(async () => {
    setTooShortHint(false);
    pauseAllChatMessages();
    onRecordingStateChange?.(true);
    await recorder.start();
  }, [recorder, onRecordingStateChange]);

  const handleSendVoice = useCallback(async () => {
    onRecordingStateChange?.(false);
    const result = await recorder.stopAndSend();
    if (result) {
      await onSendVoice(result.uri, result.durationMs);
    } else if (recorder.error === 'too_short') {
      setTooShortHint(true);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }, [recorder, onSendVoice, onRecordingStateChange]);

  const handleCancelRecording = useCallback(async () => {
    onRecordingStateChange?.(false);
    await recorder.cancel();
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  }, [recorder, onRecordingStateChange]);

  const containerStyle = {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: insets.bottom + 8,
    backgroundColor: COLORS.background,
  };

  // Recording state — simple: cancel (X) on left, timer in center, send (→) on right.
  if (isRecording) {
    return (
      <View style={containerStyle}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Pressable
            onPress={() => void handleCancelRecording()}
            accessibilityLabel={COPY.chat.conversation.cancelRecording}
            accessibilityRole="button"
            testID="recording-cancel-button"
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: COLORS.surface,
              borderWidth: 1,
              borderColor: COLORS.border,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={20} color={COLORS.textSecondary} />
          </Pressable>

          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <View
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: '#ef4444',
              }}
            />
            <Text style={{ fontFamily: FONT.medium, fontSize: 16, color: COLORS.dark }}>
              {formatTimer(recorder.durationMs)}
            </Text>
          </View>

          <Pressable
            onPress={() => void handleSendVoice()}
            accessibilityLabel={COPY.chat.conversation.sendVoice}
            accessibilityRole="button"
            testID="recording-send-button"
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: COLORS.primary,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ArrowRight size={20} color="#ffffff" />
          </Pressable>
        </View>
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

  // Voice button — tap to start recording.
  const voiceButton = (
    <Pressable
      onPress={() => void handleStartRecording()}
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
          <VoiceOnlyHintBanner
            voiceOnlyUntil={lifecycle.voiceOnlyUntil}
            onExpired={onCountdownExpired}
          />
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
          onChangeText={(value) => {
            setText(value);
            onTextChange?.(value);
          }}
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
