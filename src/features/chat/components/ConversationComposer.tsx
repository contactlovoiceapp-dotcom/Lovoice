/* Composer bar — text input + send/voice buttons, adapts to the 4-state conversation lifecycle. */

import React, { useCallback, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Mic, Send } from 'lucide-react-native';

import { COLORS, FONT, RADIUS } from '@/theme';
import { COPY } from '@/copy';
import type { ConversationLifecycle } from '../types';

interface ConversationComposerProps {
  lifecycle: ConversationLifecycle;
  iAmInitiator: boolean;
  otherDisplayName: string;
  onSendText: (body: string) => Promise<void>;
  onPressVoice: () => void;
  isSending: boolean;
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

function VoiceButton({
  onPress,
  disabled,
}: {
  onPress: () => void;
  disabled: boolean;
}) {
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      accessibilityLabel={COPY.chat.conversation.voiceCtaLabel}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      style={{
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: COLORS.primaryMuted,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <Mic size={18} color={COLORS.primary} />
    </Pressable>
  );
}

export default function ConversationComposer({
  lifecycle,
  iAmInitiator,
  otherDisplayName,
  onSendText,
  onPressVoice,
  isSending,
}: ConversationComposerProps) {
  const insets = useSafeAreaInsets();
  const [text, setText] = useState('');

  const canSendText = text.trim().length > 0 && !isSending;

  const handleSend = useCallback(async () => {
    const body = text.trim();
    if (!body) return;
    setText('');
    await onSendText(body);
  }, [text, onSendText]);

  const containerStyle = {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: insets.bottom + 8,
    backgroundColor: COLORS.background,
  };

  if (lifecycle.state === 'empty') {
    const hintText = iAmInitiator
      ? COPY.chat.conversation.composerHintInitial
      : COPY.chat.conversation.composerHintEmptyDefensive;

    return (
      <View style={{ ...containerStyle, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <HintBanner text={hintText} />
        {iAmInitiator && <VoiceButton onPress={onPressVoice} disabled={false} />}
      </View>
    );
  }

  if (lifecycle.state === 'awaiting_reply') {
    const hintText = iAmInitiator
      ? COPY.chat.conversation.composerHintAwaiting(otherDisplayName)
      : COPY.chat.conversation.composerHintRecipientReply;

    return (
      <View style={{ ...containerStyle, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <HintBanner text={hintText} />
        {!iAmInitiator && <VoiceButton onPress={onPressVoice} disabled={false} />}
      </View>
    );
  }

  if (lifecycle.state === 'voice_only') {
    return (
      <View style={{ ...containerStyle, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <HintBanner text={COPY.chat.conversation.composerHintVoiceOnly} />
        <VoiceButton onPress={onPressVoice} disabled={false} />
      </View>
    );
  }

  // lifecycle.state === 'open'
  return (
    <View style={{ ...containerStyle, flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
      <VoiceButton onPress={onPressVoice} disabled={true} />

      <TextInput
        value={text}
        onChangeText={setText}
        placeholder={COPY.chat.conversation.inputPlaceholder}
        placeholderTextColor={COLORS.textTertiary}
        multiline
        maxLength={1000}
        onSubmitEditing={() => void handleSend()}
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
        onPress={() => void handleSend()}
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
  );
}
