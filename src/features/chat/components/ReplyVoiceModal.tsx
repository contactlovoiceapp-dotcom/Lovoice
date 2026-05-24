/* In-feed reply modal: tap-to-record a voice message and send it to start a conversation. */

import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Mic, Pause, Play, RotateCcw, Send, Square } from 'lucide-react-native';

import { COLORS, CTA_GRADIENT, FONT, RADIUS, SHADOW } from '@/theme';
import { COPY } from '@/copy';
import { MIN_VOICE_MESSAGE_DURATION_MS, MAX_VOICE_DURATION_MS } from '@/lib/audio';
import { formatTime } from '@/lib/formatTime';
import { useVoiceRecorder } from '@/features/voices/hooks/useVoiceRecorder';
import { useVoicePlayer } from '@/features/voices/hooks/useVoicePlayer';
import { useStartConversation, useSendVoiceMessage } from '../api/messageMutations';
import ModalOverlay from '@/components/ModalOverlay';
import type { FeedItem } from '@/features/feed/types';

const MIC_SIZE = 80;
const METERING_BAR_COUNT = 20;
const METERING_DB_FLOOR = -50;

function meteringDbToBarHeights(meteringDb: number[]): number[] {
  const bars: number[] = [];
  const step = Math.max(1, Math.floor(meteringDb.length / METERING_BAR_COUNT));
  for (let i = 0; i < METERING_BAR_COUNT; i++) {
    const idx = Math.min(i * step, meteringDb.length - 1);
    const db = meteringDb[idx] ?? METERING_DB_FLOOR;
    const clamped = Math.max(METERING_DB_FLOOR, Math.min(0, db));
    const normalized = (clamped - METERING_DB_FLOOR) / -METERING_DB_FLOOR;
    bars.push(4 + normalized * 36);
  }
  return bars;
}

interface ReplyVoiceModalProps {
  visible: boolean;
  item: FeedItem | null;
  onClose: () => void;
  onSent: (displayName: string, conversationId: string) => void;
}

export default function ReplyVoiceModal({
  visible,
  item,
  onClose,
  onSent,
}: ReplyVoiceModalProps) {
  const recorder = useVoiceRecorder();
  const player = useVoicePlayer({ uri: recorder.result?.uri ?? null });
  const startConversation = useStartConversation();
  const sendVoiceMessage = useSendVoiceMessage();

  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const isRecording = recorder.state === 'recording';
  const isStopped = recorder.state === 'stopped';
  const canStop = recorder.durationMs >= MIN_VOICE_MESSAGE_DURATION_MS;
  const durationSeconds = Math.floor(recorder.durationMs / 1000);
  const maxSeconds = MAX_VOICE_DURATION_MS / 1000;

  const barHeights = useMemo(
    () => meteringDbToBarHeights(recorder.meteringDb),
    [recorder.meteringDb],
  );

  const handleMicPress = useCallback(async () => {
    setSendError(null);
    if (isRecording) {
      if (!canStop) return;
      await recorder.stop();
    } else {
      await recorder.reset();
      await recorder.start();
    }
  }, [isRecording, canStop, recorder]);

  const handleRerecord = useCallback(async () => {
    player.stop();
    await recorder.reset();
    await recorder.start();
  }, [recorder, player]);

  const handleSend = useCallback(async () => {
    if (!item || !recorder.result) return;
    setIsSending(true);
    setSendError(null);
    try {
      const conversation = await startConversation.mutateAsync({
        otherUserId: item.userId,
      });
      await sendVoiceMessage.mutateAsync({
        conversationId: conversation.id,
        uri: recorder.result.uri,
        durationMs: recorder.result.durationMs,
      });
      await recorder.reset();
      setIsSending(false);
      onSent(item.displayName, conversation.id);
    } catch {
      setIsSending(false);
      setSendError(COPY.replyVoiceModal.sendError);
    }
  }, [item, recorder, startConversation, sendVoiceMessage, onSent]);

  const handleClose = useCallback(async () => {
    player.stop();
    await recorder.reset();
    setSendError(null);
    setIsSending(false);
    onClose();
  }, [recorder, player, onClose]);

  if (!item) return null;

  return (
    <ModalOverlay visible={visible} onClose={handleClose} centered>
      <View style={{ alignItems: 'center', alignSelf: 'stretch', paddingTop: 8, paddingBottom: 4 }}>
        {/* Header */}
        <View
          style={{
            width: 48,
            height: 48,
            borderRadius: 24,
            backgroundColor: COLORS.primaryMuted,
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 12,
          }}
        >
          <Text style={{ fontSize: 22 }}>
            {item.bioEmojis[0] ?? '🎤'}
          </Text>
        </View>
        <Text
          style={{
            fontFamily: FONT.bold,
            fontSize: 18,
            color: COLORS.dark,
            marginBottom: 4,
            textAlign: 'center',
          }}
        >
          {COPY.replyVoiceModal.title}
        </Text>
        <Text
          style={{
            fontFamily: FONT.regular,
            fontSize: 14,
            color: COLORS.textSecondary,
            textAlign: 'center',
            marginBottom: 24,
            paddingHorizontal: 8,
          }}
        >
          {COPY.replyVoiceModal.hint(item.displayName)}
        </Text>

        {/* Recorder area */}
        {!isStopped && (
          <View style={{ alignItems: 'center' }}>
            {/* Waveform during recording */}
            {isRecording && (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 3,
                  height: 44,
                  marginBottom: 12,
                }}
              >
                {barHeights.map((h, idx) => (
                  <View
                    key={idx}
                    style={{
                      width: 3,
                      height: h,
                      borderRadius: 2,
                      backgroundColor: COLORS.primary,
                    }}
                  />
                ))}
              </View>
            )}

            {/* Mic button */}
            <Pressable
              onPress={() => void handleMicPress()}
              disabled={isSending}
              accessibilityRole="button"
              accessibilityLabel={isRecording ? COPY.replyVoiceModal.tapToStop : COPY.replyVoiceModal.tapToRecord}
              style={{ ...SHADOW.button }}
            >
              <LinearGradient
                colors={[...CTA_GRADIENT]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{
                  width: MIC_SIZE,
                  height: MIC_SIZE,
                  borderRadius: MIC_SIZE / 2,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {isRecording ? (
                  <Square size={28} color="#ffffff" fill="#ffffff" />
                ) : (
                  <Mic size={32} color="#ffffff" />
                )}
              </LinearGradient>
            </Pressable>

            {/* Timer + hint */}
            <View style={{ marginTop: 12, alignItems: 'center' }}>
              {isRecording ? (
                <>
                  <Text style={{ fontFamily: FONT.semibold, fontSize: 20, color: COLORS.dark, fontVariant: ['tabular-nums'] }}>
                    {formatTime(durationSeconds)}
                    <Text style={{ fontSize: 14, fontFamily: FONT.regular, color: COLORS.textTertiary }}>
                      {' '}/ {formatTime(maxSeconds)}
                    </Text>
                  </Text>
                  <Text style={{ fontFamily: FONT.medium, fontSize: 12, color: COLORS.textSecondary, marginTop: 4 }}>
                    {canStop ? COPY.replyVoiceModal.tapToStop : COPY.replyVoiceModal.tooShort}
                  </Text>
                </>
              ) : (
                <Text style={{ fontFamily: FONT.medium, fontSize: 13, color: COLORS.textSecondary }}>
                  {COPY.replyVoiceModal.tapToRecord}
                </Text>
              )}
            </View>
          </View>
        )}

        {/* Preview state */}
        {isStopped && recorder.result && (
          <View style={{ width: '100%', alignItems: 'center' }}>
            {/* Playback row */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 24 }}>
              <Pressable
                onPress={player.isPlaying ? player.pause : () => void player.play()}
                accessibilityLabel={player.isPlaying ? COPY.replyVoiceModal.preview.pauseA11y : COPY.replyVoiceModal.preview.playA11y}
                accessibilityRole="button"
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  backgroundColor: COLORS.primaryMuted,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {player.isPlaying ? (
                  <Pause size={18} color={COLORS.primary} fill={COLORS.primary} />
                ) : (
                  <Play size={18} color={COLORS.primary} fill={COLORS.primary} />
                )}
              </Pressable>

              <Text style={{ fontFamily: FONT.semibold, fontSize: 16, color: COLORS.dark, fontVariant: ['tabular-nums'] }}>
                {formatTime(Math.floor(recorder.result.durationMs / 1000))}
              </Text>

              <Pressable
                onPress={() => void handleRerecord()}
                accessibilityRole="button"
                style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}
              >
                <RotateCcw size={14} color={COLORS.textSecondary} />
                <Text style={{ fontFamily: FONT.medium, fontSize: 13, color: COLORS.textSecondary }}>
                  {COPY.replyVoiceModal.preview.reRecord}
                </Text>
              </Pressable>
            </View>

            {/* Send CTA */}
            <Pressable
              onPress={() => void handleSend()}
              disabled={isSending}
              accessibilityRole="button"
              style={{
                width: '100%',
                height: 52,
                borderRadius: 26,
                overflow: 'hidden',
                opacity: isSending ? 0.7 : 1,
              }}
            >
              <LinearGradient
                colors={[...CTA_GRADIENT]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={{
                  flex: 1,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 10,
                }}
              >
                {isSending ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Send size={18} color="#ffffff" />
                )}
                <Text style={{ fontFamily: FONT.bold, fontSize: 16, color: '#ffffff' }}>
                  {isSending ? COPY.replyVoiceModal.sending : COPY.replyVoiceModal.preview.send}
                </Text>
              </LinearGradient>
            </Pressable>
          </View>
        )}

        {/* Error display */}
        {(sendError || recorder.error) && (
          <Text style={{ fontFamily: FONT.medium, fontSize: 12, color: '#ef4444', marginTop: 12, textAlign: 'center' }}>
            {sendError ?? COPY.replyVoiceModal.recordingError}
          </Text>
        )}
      </View>
    </ModalOverlay>
  );
}
