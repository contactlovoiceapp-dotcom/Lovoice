/* Voice recording screen — the key onboarding moment where users record their voice introduction. */

import React, { useEffect, useState } from 'react';
import {
  Platform,
  Pressable,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowRight, Lightbulb, Mic, Pause, Play, Square, X } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, CTA_GRADIENT, FONT, ONBOARDING_GRADIENT, RADIUS, SHADOW } from '../../theme';
import { COPY } from '../../copy';
import { formatTime } from '../../lib/formatTime';

const MIC_SIZE = 128;
const GLOW_SIZE = 500;
const MIN_RECORDING_SECONDS = 10;
const MAX_RECORDING_SECONDS = 90;

type RecordingState = 'idle' | 'recording' | 'tooShort' | 'recorded' | 'playingPreview';

interface Props {
  onNext: () => void;
  onSkip: () => void;
}

/** Decorative glow that pulses while recording — invisible if animation fails. */
function ReactiveGlow({ isRecording }: { isRecording: boolean }) {
  const opacity = useSharedValue(0.1);
  const scale = useSharedValue(1);

  useEffect(() => {
    if (isRecording) {
      opacity.value = withRepeat(
        withSequence(
          withTiming(0.3, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
          withTiming(0.15, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
        false,
      );
      scale.value = withRepeat(
        withSequence(
          withTiming(1.1, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
        false,
      );
    } else {
      cancelAnimation(opacity);
      cancelAnimation(scale);
      opacity.value = withTiming(0.1, { duration: 1000 });
      scale.value = withTiming(1, { duration: 1000 });
    }
  }, [isRecording]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  return (
    <View
      pointerEvents="none"
      style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}
    >
      <Animated.View
        style={[
          {
            width: GLOW_SIZE,
            height: GLOW_SIZE,
            borderRadius: GLOW_SIZE / 2,
            backgroundColor: COLORS.primaryMuted,
          },
          animatedStyle,
        ]}
      />
    </View>
  );
}

/** Decorative expanding ring shown during recording. */
function PingRing({
  delayMs,
  diameter,
  fillColor,
}: {
  delayMs: number;
  diameter: number;
  fillColor: string;
}) {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(0.25);

  useEffect(() => {
    scale.value = withDelay(
      delayMs,
      withRepeat(
        withSequence(
          withTiming(1.6, { duration: 1000, easing: Easing.out(Easing.ease) }),
          withTiming(1, { duration: 0 }),
        ),
        -1,
        false,
      ),
    );
    opacity.value = withDelay(
      delayMs,
      withRepeat(
        withSequence(
          withTiming(0, { duration: 1000 }),
          withTiming(0.25, { duration: 0 }),
        ),
        -1,
        false,
      ),
    );
    return () => {
      cancelAnimation(scale);
      cancelAnimation(opacity);
    };
  }, [delayMs]);

  const ringStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          width: diameter,
          height: diameter,
          borderRadius: diameter / 2,
          backgroundColor: fillColor,
        },
        ringStyle,
      ]}
    />
  );
}

const RecordVoiceScreen: React.FC<Props> = ({ onNext, onSkip }) => {
  const [recordingState, setRecordingState] = useState<RecordingState>('idle');
  const [time, setTime] = useState(0);
  const [showInspiration, setShowInspiration] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const { width: windowWidth } = useWindowDimensions();
  const contentMaxWidth = Math.min(384, windowWidth - 48);
  const isRecording = recordingState === 'recording';
  const hasRecorded = recordingState === 'recorded' || recordingState === 'playingPreview';
  const isPreviewPlaying = recordingState === 'playingPreview';
  const recordingError = recordingState === 'tooShort' ? COPY.record.minimumDurationError : '';
  const minimumRemaining = Math.max(MIN_RECORDING_SECONDS - time, 0);
  const statusText = hasRecorded
    ? isPreviewPlaying
      ? COPY.record.previewPlayingStatus
      : COPY.record.recordedStatus
    : isRecording
      ? COPY.record.recordingStatus
      : COPY.record.idleStatus;
  const minimumGuidanceText = isRecording
    ? minimumRemaining > 0
      ? COPY.record.minimumRemaining(minimumRemaining)
      : ''
    : '';
  const continueLabel = hasRecorded
    ? COPY.common.continue
    : isRecording
      ? minimumRemaining > 0
        ? COPY.record.ctaMinimumRemaining(minimumRemaining)
        : COPY.record.ctaStopRecording
      : COPY.record.ctaRecord;

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isRecording) {
      interval = setInterval(() => {
        setTime((prev) => {
          if (prev >= MAX_RECORDING_SECONDS) {
            setRecordingState('recorded');
            return MAX_RECORDING_SECONDS;
          }
          return prev + 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isRecording]);

  const toggleRecording = () => {
    if (isRecording) {
      if (time >= MIN_RECORDING_SECONDS) {
        setRecordingState('recorded');
        return;
      }
      setRecordingState('tooShort');
    } else {
      setTime(0);
      setRecordingState('recording');
    }
  };

  const handlePrimaryButtonPress = () => {
    if (hasRecorded && !isRecording) {
      setRecordingState(isPreviewPlaying ? 'recorded' : 'playingPreview');
      return;
    }
    toggleRecording();
  };

  return (
    <LinearGradient
      colors={[...ONBOARDING_GRADIENT]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{ flex: 1 }}
    >
      <ReactiveGlow isRecording={isRecording} />

      <SafeAreaView style={{ position: 'relative', zIndex: 10, flex: 1 }} edges={['top', 'bottom']}>
        <View style={{ flex: 1, flexDirection: 'column', justifyContent: 'space-between', paddingHorizontal: 24, paddingVertical: 32 }}>
          {/* Header */}
          <View style={{ width: '100%', alignSelf: 'center', paddingTop: 16, maxWidth: contentMaxWidth }}>
            <Text style={{ marginBottom: 8, textAlign: 'center', fontSize: 28, fontFamily: FONT.bold, color: COLORS.dark }}>
              {COPY.record.title}
              <Text style={{ fontFamily: FONT.serifItalic, color: COLORS.primary }}>{COPY.record.titleAccent}</Text>
            </Text>
            <Text style={{ textAlign: 'center', fontFamily: FONT.medium, color: COLORS.textTertiary }}>
              {COPY.record.subtitle}
            </Text>
          </View>

          {/* Mic + timer */}
          <View style={{ flexDirection: 'column', alignItems: 'center' }}>
            <View style={{ position: 'relative', alignItems: 'center', justifyContent: 'center', width: 220, height: 220 }}>
              {isRecording && (
                <>
                  <PingRing
                    delayMs={0}
                    diameter={MIC_SIZE + 32}
                    fillColor={COLORS.primaryMuted}
                  />
                  <PingRing
                    delayMs={500}
                    diameter={MIC_SIZE + 64}
                    fillColor={COLORS.border}
                  />
                </>
              )}
              <View style={{ position: 'absolute' }}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={
                    isRecording
                      ? COPY.a11y.stopRecording
                      : hasRecorded && isPreviewPlaying
                        ? COPY.a11y.pause
                        : hasRecorded
                          ? COPY.a11y.play
                          : COPY.a11y.record
                  }
                  onPress={handlePrimaryButtonPress}
                  style={{
                    width: MIC_SIZE,
                    height: MIC_SIZE,
                    borderRadius: MIC_SIZE / 2,
                    overflow: 'hidden',
                    opacity: isRecording ? 0.9 : 1,
                  }}
                >
                  <LinearGradient
                    colors={[...CTA_GRADIENT]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={{
                      width: MIC_SIZE,
                      height: MIC_SIZE,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {isRecording ? (
                      <Square size={32} color={COLORS.surface} fill={COLORS.surface} />
                    ) : hasRecorded && isPreviewPlaying ? (
                      <Pause size={40} color={COLORS.surface} fill={COLORS.surface} />
                    ) : hasRecorded ? (
                      <Play size={40} color={COLORS.surface} fill={COLORS.surface} style={{ marginLeft: 4 }} />
                    ) : (
                      <Mic size={44} color={COLORS.surface} />
                    )}
                  </LinearGradient>
                </Pressable>
              </View>
            </View>

            <View style={{ marginTop: 24, minHeight: 92, flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start' }}>
              {(isRecording || hasRecorded || recordingError !== '') && (
                <Text
                  style={{
                    fontSize: 28,
                    fontFamily: FONT.semibold,
                    color: COLORS.dark,
                    fontVariant: ['tabular-nums'],
                  }}
                >
                  {formatTime(time)}{' '}
                  <Text style={{ fontSize: 18, fontFamily: FONT.regular, color: COLORS.textTertiary }}>{COPY.record.maxDuration}</Text>
                </Text>
              )}

              <Text
                style={{
                  marginTop: isRecording || hasRecorded || recordingError !== '' ? 6 : 0,
                  textAlign: 'center',
                  fontSize: 14,
                  fontFamily: FONT.medium,
                  color: COLORS.textSecondary,
                }}
              >
                {statusText}
              </Text>

              {minimumGuidanceText !== '' && (
                <Text
                  style={{
                    marginTop: 4,
                    textAlign: 'center',
                    fontSize: 12,
                    fontFamily: FONT.medium,
                    color: COLORS.textTertiary,
                  }}
                >
                  {minimumGuidanceText}
                </Text>
              )}

              {hasRecorded && !isRecording && (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    setTime(0);
                    setRecordingState('idle');
                  }}
                  style={{ marginTop: 8 }}
                >
                  <Text
                    style={{ fontSize: 14, fontFamily: FONT.medium, color: COLORS.textTertiary, textDecorationLine: 'underline' }}
                  >
                    {COPY.record.restart}
                  </Text>
                </Pressable>
              )}
            </View>
          </View>

          {/* Bottom */}
          <View style={{ width: '100%', alignSelf: 'center', gap: 12, maxWidth: contentMaxWidth }}>
            <View
              style={{
                borderRadius: RADIUS.lg,
                borderWidth: 1,
                borderColor: COLORS.border,
                backgroundColor: COLORS.surfaceMuted,
                padding: 16,
              }}
            >
              <Text style={{ fontSize: 14, lineHeight: 20, fontFamily: FONT.regular, color: COLORS.textSecondary }}>
                {recordingError || (hasRecorded ? COPY.record.previewHint : COPY.record.hint)}
              </Text>

              {!hasRecorded && (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setShowInspiration(true)}
                  style={{
                    marginTop: 12,
                    width: '100%',
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    borderRadius: RADIUS.md,
                    backgroundColor: COLORS.border,
                    paddingVertical: 10,
                  }}
                >
                  <Lightbulb size={16} color="#f59e0b" />
                  <Text style={{ fontSize: 14, fontFamily: FONT.medium, color: COLORS.textSecondary }}>
                    {COPY.record.needInspiration}
                  </Text>
                </Pressable>
              )}
            </View>

            <Pressable
              accessibilityRole="button"
              disabled={!hasRecorded}
              onPress={onNext}
              style={{
                width: '100%',
                borderRadius: RADIUS.full,
                overflow: 'hidden',
                opacity: hasRecorded ? 1 : 0.2,
                ...SHADOW.button,
              }}
            >
              <LinearGradient
                colors={[...CTA_GRADIENT]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16 }}>
                  <Text style={{ fontFamily: FONT.bold, color: 'white' }}>{continueLabel}</Text>
                  <ArrowRight size={20} color={COLORS.surface} />
                </View>
              </LinearGradient>
            </Pressable>

            {!hasRecorded && (
              <Pressable
                accessibilityRole="button"
                onPress={onSkip}
                style={{ width: '100%', paddingVertical: 8 }}
              >
                <Text style={{ textAlign: 'center', fontSize: 14, fontFamily: FONT.medium, color: COLORS.textTertiary }}>
                  {COPY.record.skip}
                </Text>
              </Pressable>
            )}
          </View>
        </View>
      </SafeAreaView>

      {/* Inspiration modal */}
      {showInspiration && (
        <View
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 50,
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
            backgroundColor: 'rgba(45,17,54,0.4)',
          }}
        >
          <View
            style={{
              position: 'relative',
              width: '100%',
              maxWidth: contentMaxWidth,
              backgroundColor: COLORS.surface,
              borderRadius: RADIUS.xl,
              borderWidth: 1,
              borderColor: COLORS.border,
              padding: 32,
            }}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={COPY.common.close}
              onPress={() => setShowInspiration(false)}
              style={{ position: 'absolute', right: 16, top: 16, padding: 8 }}
            >
              <X size={22} color={COLORS.textTertiary} />
            </Pressable>

            <View
              style={{
                marginBottom: 24,
                width: 48,
                height: 48,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 24,
                backgroundColor: 'rgba(245,158,11,0.1)',
              }}
            >
              <Lightbulb size={24} color="#f59e0b" />
            </View>

            <Text style={{ marginBottom: 16, fontSize: 20, fontFamily: FONT.bold, color: COLORS.dark }}>{COPY.record.inspirationTitle}</Text>
            <Text
              style={{ marginBottom: 32, fontFamily: FONT.serifItalic, fontSize: 18, color: COLORS.textSecondary, minHeight: 80 }}
            >
              {`\u201C${COPY.record.inspirationQuestions[currentQuestion]}\u201D`}
            </Text>

            <Pressable
              accessibilityRole="button"
              onPress={() =>
                setCurrentQuestion((prev) => (prev + 1) % COPY.record.inspirationQuestions.length)
              }
              style={{
                width: '100%',
                borderRadius: RADIUS.full,
                borderWidth: 1,
                borderColor: COLORS.border,
                backgroundColor: COLORS.border,
                paddingVertical: 12,
              }}
            >
              <Text style={{ textAlign: 'center', fontFamily: FONT.bold, color: COLORS.textSecondary }}>{COPY.record.inspirationNext}</Text>
            </Pressable>
          </View>
        </View>
      )}
    </LinearGradient>
  );
};

export default RecordVoiceScreen;
