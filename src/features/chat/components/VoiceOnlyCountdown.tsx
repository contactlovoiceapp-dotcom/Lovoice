/* Inline pill showing time remaining until text mode unlocks in a voice-only conversation. */

import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { COLORS, FONT, RADIUS } from '@/theme';
import { COPY } from '@/copy';
import { formatVoiceOnlyCountdown } from '../types';

interface VoiceOnlyCountdownProps {
  voiceOnlyUntil: string;
  onExpired: () => void;
}

export default function VoiceOnlyCountdown({
  voiceOnlyUntil,
  onExpired,
}: VoiceOnlyCountdownProps) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const { hours, minutes, expired } = formatVoiceOnlyCountdown(voiceOnlyUntil, now);

  useEffect(() => {
    if (expired) onExpired();
  }, [expired, onExpired]);

  if (expired) return null;

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'center',
        backgroundColor: COLORS.primaryMuted,
        borderRadius: RADIUS.full,
        paddingHorizontal: 10,
        paddingVertical: 4,
        gap: 4,
      }}
    >
      <Text style={{ fontSize: 13 }}>⏳</Text>
      <Text style={{ fontFamily: FONT.medium, fontSize: 12, color: COLORS.primary }}>
        {COPY.chat.conversation.voiceOnlyCountdownPrefix} {hours}h{minutes.toString().padStart(2, '0')}
      </Text>
    </View>
  );
}
