/* Voice recording screen — wires the recorder and upload pipeline to the onboarding/profile flow. */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
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
import { ArrowRight, Lightbulb, Mic, Pause, Play, Settings, Square, X } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { File } from 'expo-file-system';
import { COLORS, CTA_GRADIENT, FONT, ONBOARDING_GRADIENT, RADIUS, SHADOW } from '../../theme';
import { COPY } from '../../copy';
import { formatTime } from '../../lib/formatTime';
import { MAX_VOICE_DURATION_MS, MIN_VOICE_DURATION_MS } from '../../lib/audio';
import { useVoiceRecorder, type VoiceRecorderResult } from '../../features/voices/hooks/useVoiceRecorder';
import { useVoicePlayer } from '../../features/voices/hooks/useVoicePlayer';
import { useUploadVoice } from '../../features/voices/api/voiceMutations';

const MIC_SIZE = 128;
const GLOW_SIZE = 500;
const MIN_RECORDING_SECONDS = MIN_VOICE_DURATION_MS / 1000;
const MAX_RECORDING_SECONDS = MAX_VOICE_DURATION_MS / 1000;

// Visual range for the metering bars: -50 dBFS clamps to a barely visible bar, 0 dBFS is full height.
const METERING_DB_FLOOR = -50;
// Number of bars rendered; the live ring buffer holds 60 samples (3s @ 50ms).
const METERING_BAR_COUNT = 24;

interface Props {
  onNext: () => void;
  /** When omitted the "skip" link is hidden (e.g. profile re-record). */
  onSkip?: () => void;
  /** When provided, a cancel button is shown so the user can abort without losing existing data. */
  onCancel?: () => void;
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

/**
 * Maps the dBFS ring buffer to evenly spaced bar heights in the [4..52]px range.
 * We downsample to METERING_BAR_COUNT bars by picking the most recent samples and clamping
 * dB values into a visible range (anything below METERING_DB_FLOOR collapses to the minimum).
 */
function meteringDbToBarHeights(meteringDb: number[]): number[] {
  const bars = new Array<number>(METERING_BAR_COUNT).fill(4);
  if (meteringDb.length === 0) return bars;

  const samples = meteringDb.slice(-METERING_BAR_COUNT);
  const offset = METERING_BAR_COUNT - samples.length;

  for (let i = 0; i < samples.length; i += 1) {
    const db = samples[i];
    const normalized = Math.max(0, Math.min(1, (db - METERING_DB_FLOOR) / -METERING_DB_FLOOR));
    bars[offset + i] = 4 + normalized * 48;
  }

  return bars;
}

/** Live metering bars driven by the recorder's dBFS ring buffer. */
function LiveMeteringWaveform({ meteringDb }: { meteringDb: number[] }) {
  const heights = useMemo(() => meteringDbToBarHeights(meteringDb), [meteringDb]);

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        height: 56,
      }}
    >
      {heights.map((h, idx) => (
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
  );
}

/**
 * Preview phase after stop — mounts useVoicePlayer with the file URI from birth so
 * Android never has to swap null → local file via replace() (silent play() no-op).
 */
function RecordVoicePreviewBody({
  result,
  isLikelySilent,
  uploadVoice,
  onNext,
  onSkip,
  onRestartCapture,
  contentMaxWidth,
  onRegisterUnload,
}: {
  result: VoiceRecorderResult;
  isLikelySilent: boolean;
  uploadVoice: ReturnType<typeof useUploadVoice>;
  onNext: () => void;
  onSkip?: () => void;
  onRestartCapture: () => Promise<void>;
  contentMaxWidth: number;
  onRegisterUnload: (unload: () => void) => void;
}) {
  const player = useVoicePlayer({ uri: result.uri });

  useEffect(() => {
    onRegisterUnload(player.unload);
    return () => onRegisterUnload(() => {});
  }, [onRegisterUnload, player.unload]);

  const isUploading = uploadVoice.isPending;
  const uploadFailed = uploadVoice.isError && !isUploading;
  const isSilent = isLikelySilent;
  const isPreviewPlaying = player.isPlaying;

  const recordedSeconds = Math.floor(result.durationMs / 1000);
  const playbackPositionSeconds = Math.floor(player.positionMs / 1000);

  let statusText: string;
  if (isUploading) {
    statusText = COPY.record.uploadingStatus;
  } else if (uploadFailed) {
    statusText = COPY.record.uploadErrorStatus;
  } else if (isSilent) {
    statusText = COPY.record.silenceWarningStatus;
  } else {
    statusText = isPreviewPlaying ? COPY.record.previewPlayingStatus : COPY.record.recordedStatus;
  }

  let continueLabel: string;
  if (isUploading) {
    continueLabel = COPY.record.ctaUploading;
  } else if (uploadFailed) {
    continueLabel = COPY.record.ctaRetry;
  } else if (isSilent) {
    continueLabel = COPY.record.ctaReRecord;
  } else {
    continueLabel = COPY.common.continue;
  }

  const handlePlayPress = useCallback(async () => {
    if (isUploading) return;
    if (player.isPlaying) {
      player.pause();
    } else {
      await player.play();
    }
  }, [isUploading, player]);

  const handleRestart = useCallback(async () => {
    player.unload();
    await onRestartCapture();
  }, [onRestartCapture, player]);

  const handleUploadAndProceed = useCallback(async () => {
    try {
      player.unload();
      await uploadVoice.mutateAsync({
        uri: result.uri,
        durationMs: result.durationMs,
      });
      onNext();
    } catch {
      // Error surfaces via uploadVoice.error and the retry CTA.
    }
  }, [onNext, player, result.durationMs, result.uri, uploadVoice]);

  const handleContinue = useCallback(async () => {
    if (isUploading) return;
    if (isSilent) {
      await handleRestart();
      return;
    }
    await handleUploadAndProceed();
  }, [handleRestart, handleUploadAndProceed, isSilent, isUploading]);

  const handleSkip = useCallback(async () => {
    player.unload();
    await onRestartCapture();
    onSkip?.();
  }, [onRestartCapture, onSkip, player]);

  const micAccessibilityLabel = isPreviewPlaying ? COPY.a11y.pause : COPY.a11y.play;

  return (
    <>
      <View style={{ flexDirection: 'column', alignItems: 'center' }}>
        <View style={{ position: 'relative', alignItems: 'center', justifyContent: 'center', width: 220, height: 220 }}>
          <View style={{ position: 'absolute' }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={micAccessibilityLabel}
              onPress={handlePlayPress}
              disabled={isUploading}
              style={{
                width: MIC_SIZE,
                height: MIC_SIZE,
                borderRadius: MIC_SIZE / 2,
                overflow: 'hidden',
                opacity: isUploading ? 0.6 : 1,
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
                {isUploading ? (
                  <ActivityIndicator color={COLORS.surface} size="large" />
                ) : isPreviewPlaying ? (
                  <Pause size={40} color={COLORS.surface} fill={COLORS.surface} />
                ) : (
                  <Play size={40} color={COLORS.surface} fill={COLORS.surface} style={{ marginLeft: 4 }} />
                )}
              </LinearGradient>
            </Pressable>
          </View>
        </View>

        <View style={{ marginTop: 24, minHeight: 92, flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start' }}>
          <Text
            style={{
              fontSize: 28,
              fontFamily: FONT.semibold,
              color: COLORS.dark,
              fontVariant: ['tabular-nums'],
            }}
          >
            {isPreviewPlaying
              ? formatTime(playbackPositionSeconds)
              : formatTime(recordedSeconds)}{' '}
            <Text style={{ fontSize: 18, fontFamily: FONT.regular, color: COLORS.textTertiary }}>
              {isPreviewPlaying
                ? `/ ${formatTime(recordedSeconds)}`
                : COPY.record.maxDuration}
            </Text>
          </Text>

          <Text
            style={{
              marginTop: 6,
              textAlign: 'center',
              fontSize: 14,
              fontFamily: FONT.medium,
              color: uploadFailed || isSilent ? COLORS.primary : COLORS.textSecondary,
            }}
          >
            {statusText}
          </Text>

          {isSilent && (
            <Text
              style={{
                marginTop: 4,
                textAlign: 'center',
                fontSize: 12,
                fontFamily: FONT.medium,
                color: COLORS.textTertiary,
              }}
            >
              {COPY.record.silenceWarningHint}
            </Text>
          )}

          {!isUploading && (
            <Pressable
              accessibilityRole="button"
              onPress={handleRestart}
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
            {COPY.record.previewHint}
          </Text>
        </View>

        <Pressable
          accessibilityRole="button"
          disabled={isUploading}
          onPress={handleContinue}
          style={{
            width: '100%',
            borderRadius: RADIUS.full,
            overflow: 'hidden',
            opacity: isUploading ? 0.4 : 1,
            ...SHADOW.button,
          }}
        >
          <LinearGradient
            colors={[...CTA_GRADIENT]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16 }}>
              {isUploading ? (
                <ActivityIndicator color={COLORS.surface} size="small" />
              ) : null}
              <Text style={{ fontFamily: FONT.bold, color: 'white' }}>{continueLabel}</Text>
              {!isUploading ? <ArrowRight size={20} color={COLORS.surface} /> : null}
            </View>
          </LinearGradient>
        </Pressable>

        {isSilent && onSkip && (
          <Pressable
            accessibilityRole="button"
            onPress={handleSkip}
            style={{ alignSelf: 'center', paddingVertical: 8 }}
          >
            <Text
              style={{ fontSize: 14, fontFamily: FONT.medium, color: COLORS.textTertiary, textDecorationLine: 'underline' }}
            >
              {COPY.record.ctaContinueWithoutVoice}
            </Text>
          </Pressable>
        )}
      </View>
    </>
  );
}

const RecordVoiceScreen: React.FC<Props> = ({ onNext, onSkip, onCancel }) => {
  const recorder = useVoiceRecorder();
  const uploadVoice = useUploadVoice();
  const previewUnloadRef = useRef<(() => void) | null>(null);

  const registerPreviewUnload = useCallback((unload: () => void) => {
    previewUnloadRef.current = unload;
  }, []);

  const handleRestartCapture = useCallback(async () => {
    await recorder.reset();
    uploadVoice.reset();
  }, [recorder, uploadVoice]);

  const [showInspiration, setShowInspiration] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const { width: windowWidth } = useWindowDimensions();
  const contentMaxWidth = Math.min(384, windowWidth - 48);

  // Keep a ref to the latest result URI so the unmount cleanup can delete an orphaned recording
  // (user navigates away via gesture without tapping cancel/skip). Successful uploads delete the
  // file themselves, in which case the cleanup below becomes a no-op.
  const lastResultUriRef = useRef<string | null>(null);
  useEffect(() => {
    lastResultUriRef.current = recorder.result?.uri ?? null;
  }, [recorder.result]);

  useEffect(() => {
    return () => {
      const uri = lastResultUriRef.current;
      if (!uri) return;
      try {
        new File(uri).delete();
      } catch {
        // Already deleted by the upload pipeline or never existed — non-fatal.
      }
    };
  }, []);

  const isRecording = recorder.state === 'recording';
  const isStopped = recorder.state === 'stopped' && recorder.result !== null;
  const permissionDenied = recorder.state === 'error' && recorder.error === 'permission_denied';

  const durationSeconds = Math.floor(recorder.durationMs / 1000);
  const minimumRemaining = Math.max(MIN_RECORDING_SECONDS - durationSeconds, 0);

  let statusText: string;
  if (permissionDenied) {
    statusText = COPY.record.permissionDeniedStatus;
  } else if (isRecording) {
    statusText = COPY.record.recordingStatus;
  } else {
    statusText = COPY.record.idleStatus;
  }

  const minimumGuidanceText =
    isRecording && minimumRemaining > 0 ? COPY.record.minimumRemaining(minimumRemaining) : '';

  let continueLabel: string;
  if (permissionDenied) {
    continueLabel = COPY.record.ctaOpenSettings;
  } else if (isRecording) {
    continueLabel = recorder.canStop
      ? COPY.record.ctaStopRecording
      : COPY.record.ctaCancel;
  } else {
    continueLabel = COPY.record.ctaRecord;
  }

  const continueDisabled = permissionDenied;

  const handleMicPress = useCallback(async () => {
    if (permissionDenied) {
      void Linking.openSettings();
      return;
    }
    if (isRecording) {
      if (recorder.canStop) {
        await recorder.stop();
      } else {
        await recorder.reset();
      }
      return;
    }
    await recorder.start();
  }, [isRecording, permissionDenied, recorder]);

  const handleContinue = useCallback(async () => {
    if (permissionDenied) {
      void Linking.openSettings();
      return;
    }
    if (isRecording) {
      if (recorder.canStop) {
        await recorder.stop();
      } else {
        await recorder.reset();
      }
      return;
    }
    await recorder.start();
  }, [isRecording, permissionDenied, recorder]);

  const handleCancel = useCallback(async () => {
    previewUnloadRef.current?.();
    await recorder.reset();
    uploadVoice.reset();
    onCancel?.();
  }, [onCancel, recorder, uploadVoice]);

  const handleSkip = useCallback(async () => {
    await recorder.reset();
    onSkip?.();
  }, [onSkip, recorder]);

  const micAccessibilityLabel = (() => {
    if (permissionDenied) return COPY.record.ctaOpenSettings;
    if (isRecording) return COPY.a11y.stopRecording;
    return COPY.a11y.record;
  })();

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
          <View style={{ width: '100%', alignSelf: 'center', paddingTop: 16, maxWidth: contentMaxWidth }}>
            {onCancel ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={COPY.common.cancel}
                onPress={handleCancel}
                style={{
                  alignSelf: 'flex-start',
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  paddingVertical: 8,
                  marginBottom: 8,
                }}
              >
                <X size={18} color={COLORS.textTertiary} />
                <Text style={{ fontFamily: FONT.medium, color: COLORS.textTertiary }}>
                  {COPY.common.cancel}
                </Text>
              </Pressable>
            ) : null}
            <Text style={{ marginBottom: 8, textAlign: 'center', fontSize: 28, fontFamily: FONT.bold, color: COLORS.dark }}>
              {COPY.record.title}
              <Text style={{ fontFamily: FONT.serifItalic, color: COLORS.primary }}>{COPY.record.titleAccent}</Text>
            </Text>
            <Text style={{ textAlign: 'center', fontFamily: FONT.medium, color: COLORS.textTertiary }}>
              {COPY.record.subtitle}
            </Text>
          </View>

          {isStopped && recorder.result ? (
            <RecordVoicePreviewBody
              result={recorder.result}
              isLikelySilent={recorder.isLikelySilent}
              uploadVoice={uploadVoice}
              onNext={onNext}
              onSkip={onSkip}
              onRestartCapture={handleRestartCapture}
              contentMaxWidth={contentMaxWidth}
              onRegisterUnload={registerPreviewUnload}
            />
          ) : (
            <>
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
                      accessibilityLabel={micAccessibilityLabel}
                      onPress={handleMicPress}
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
                        {permissionDenied ? (
                          <Settings size={36} color={COLORS.surface} />
                        ) : isRecording ? (
                          <Square size={32} color={COLORS.surface} fill={COLORS.surface} />
                        ) : (
                          <Mic size={44} color={COLORS.surface} />
                        )}
                      </LinearGradient>
                    </Pressable>
                  </View>
                </View>

                {isRecording ? (
                  <View style={{ marginTop: 16 }}>
                    <LiveMeteringWaveform meteringDb={recorder.meteringDb} />
                  </View>
                ) : null}

                <View style={{ marginTop: 24, minHeight: 92, flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start' }}>
                  {isRecording && (
                    <Text
                      style={{
                        fontSize: 28,
                        fontFamily: FONT.semibold,
                        color: COLORS.dark,
                        fontVariant: ['tabular-nums'],
                      }}
                    >
                      {formatTime(durationSeconds)}{' '}
                      <Text style={{ fontSize: 18, fontFamily: FONT.regular, color: COLORS.textTertiary }}>
                        {COPY.record.maxDuration}
                      </Text>
                    </Text>
                  )}

                  <Text
                    style={{
                      marginTop: isRecording ? 6 : 0,
                      textAlign: 'center',
                      fontSize: 14,
                      fontFamily: FONT.medium,
                      color: permissionDenied ? COLORS.primary : COLORS.textSecondary,
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
                </View>
              </View>

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
                    {COPY.record.hint}
                  </Text>

                  {!isRecording && !permissionDenied && (
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
                  disabled={continueDisabled}
                  onPress={handleContinue}
                  style={{
                    width: '100%',
                    borderRadius: RADIUS.full,
                    overflow: 'hidden',
                    opacity: continueDisabled ? 0.4 : 1,
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

                {!isRecording && onSkip ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={handleSkip}
                    style={({ pressed }) => ({
                      width: '100%',
                      borderRadius: RADIUS.cta,
                      borderWidth: 1.5,
                      borderColor: COLORS.darkMuted,
                      backgroundColor: pressed ? COLORS.surfaceLight : 'transparent',
                      paddingVertical: 14,
                      opacity: pressed ? 0.75 : 1,
                      transform: [{ scale: pressed ? 0.98 : 1 }],
                    })}
                  >
                    <Text style={{ textAlign: 'center', fontSize: 14, fontFamily: FONT.semibold, color: COLORS.textSecondary }}>
                      {COPY.record.skip}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            </>
          )}
        </View>
      </SafeAreaView>

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

            <Text
              style={{
                marginBottom: 32,
                fontFamily: FONT.medium,
                fontSize: 20,
                lineHeight: 28,
                color: COLORS.dark,
                minHeight: 80,
              }}
            >
              {COPY.record.inspirationQuestions[currentQuestion]}
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
