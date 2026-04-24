/* Full-screen immersive profile card — the heart of the Discover feed.
   Renders the audio player, progress ring, waveform, profile info,
   action buttons, and three overlay modals (reply, report, locked). */

import React, { useEffect, useRef, useState } from 'react';
import {
  Pressable,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle } from 'react-native-svg';
import {
  Heart,
  Lock,
  Mic,
  MoreHorizontal,
  Pause,
  Play,
  RotateCcw,
  Send,
  X,
} from 'lucide-react-native';

import type { Profile } from '../types';
import { COLORS, FONT, SHADOW, THEME_GRADIENTS } from '../theme';
import { COPY } from '../copy';
import Waveform from './Waveform';

interface ProfileCardProps {
  profile: Profile;
  togglePlay: (id: string) => void;
  onFinish?: (id: string) => void;
  hasRecordedVibe?: boolean;
  isLiked: boolean;
  onToggleLike: () => void;
  onRecordVibe?: () => void;
}

const PLAY_BTN_SIZE = 96;
const RING_PADDING = 20;
const TAP_SPRING = { stiffness: 400, damping: 30 } as const;

/* ─── Reanimated sub-components ────────────────────────────────────────────── */

function PulseRing() {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(0.2);

  useEffect(() => {
    scale.value = withRepeat(
      withTiming(1.5, { duration: 1800, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
    opacity.value = withRepeat(
      withTiming(0, { duration: 1800, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
    return () => {
      cancelAnimation(scale);
      cancelAnimation(opacity);
    };
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          width: 96,
          height: 96,
          borderRadius: 48,
          borderWidth: 2,
          borderColor: 'rgba(255,255,255,0.2)',
        },
        animStyle,
      ]}
    />
  );
}

function AmbientGlow({ color, size }: { color: string; size: number }) {
  const scale = useSharedValue(0.6);
  const opacity = useSharedValue(0);

  useEffect(() => {
    scale.value = withRepeat(
      withTiming(1.3, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
    opacity.value = withRepeat(
      withTiming(0.2, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
    return () => {
      cancelAnimation(scale);
      cancelAnimation(opacity);
    };
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
        },
        animStyle,
      ]}
    />
  );
}

/* ─── Helpers ──────────────────────────────────────────────────────────────── */

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function FadeWhen({ visible, children }: { visible: boolean; children: React.ReactNode }) {
  const opacity = useSharedValue(visible ? 1 : 0);

  useEffect(() => {
    opacity.value = withTiming(visible ? 1 : 0, { duration: 250 });
  }, [visible]);

  const animStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return <Animated.View style={animStyle}>{children}</Animated.View>;
}

function ModalOverlay({
  visible,
  onClose,
  children,
  centered = false,
}: {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  centered?: boolean;
}) {
  if (!visible) return null;

  return (
    <View
      style={{
        position: 'absolute',
        top: 0, left: 0, right: 0, bottom: 0,
        zIndex: 50,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        backgroundColor: 'rgba(45, 17, 54, 0.45)',
      }}
    >
      <View
        style={{
          backgroundColor: 'white',
          borderRadius: 24,
          padding: 24,
          width: '100%',
          maxWidth: 384,
          position: 'relative',
          alignItems: centered ? 'center' : undefined,
        }}
      >
        <Pressable
          onPress={onClose}
          style={{ position: 'absolute', top: 16, right: 16, padding: 8, zIndex: 10 }}
        >
          <X size={22} color={COLORS.textTertiary} />
        </Pressable>
        {children}
      </View>
    </View>
  );
}

/* ─── ProfileCard ──────────────────────────────────────────────────────────── */

const ProfileCard: React.FC<ProfileCardProps> = ({
  profile,
  togglePlay,
  onFinish,
  hasRecordedVibe = true,
  isLiked,
  onToggleLike,
  onRecordVibe,
}) => {
  const { theme, isPlaying, audioDurationSec } = profile;
  const { width: windowWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  // Floating pill nav (52px) + bottom inset + 12px gap above + 16px breathing
  const bottomNavHeight = 52 + insets.bottom + 12 + 16;

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [hasListened, setHasListened] = useState(false);
  const [showReplyModal, setShowReplyModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [showLockedModal, setShowLockedModal] = useState(false);


  const likeScale = useSharedValue(1);
  const replyScale = useSharedValue(1);
  const likeAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: likeScale.value }],
  }));
  const replyAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: replyScale.value }],
  }));

  const handlePlayPress = () => {
    if (!hasRecordedVibe) {
      setShowLockedModal(true);
      return;
    }
    togglePlay(profile.id);
  };

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    if (isPlaying) {
      interval = setInterval(() => {
        setElapsed((prev) => Math.min(prev + 0.1, audioDurationSec));
      }, 100);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isPlaying, audioDurationSec]);

  useEffect(() => {
    if (!isPlaying && elapsed > 0 && elapsed >= audioDurationSec - 0.5) {
      setHasListened(true);
    }
  }, [isPlaying, elapsed, audioDurationSec]);

  useEffect(() => {
    if (isPlaying) {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        onFinish?.(profile.id);
      }, audioDurationSec * 1000);
    } else if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [isPlaying, audioDurationSec, onFinish, profile.id]);

  const progress =
    audioDurationSec > 0 ? (elapsed / audioDurationSec) * 100 : 0;
  const themeData = THEME_GRADIENTS[theme] ?? THEME_GRADIENTS.sunset;
  const ringRadius = (PLAY_BTN_SIZE + RING_PADDING) / 2;
  const ringCircumference = ringRadius * 2 * Math.PI;
  const ringOffset =
    ringCircumference - (progress / 100) * ringCircumference;
  const svgSize = PLAY_BTN_SIZE + RING_PADDING + 4;
  const glowSize = windowWidth * 0.8;

  const handleLike = () => {
    onToggleLike();
  };

  return (
    <View style={{ flex: 1 }}>
      <LinearGradient
        colors={[...themeData.colors]}
        style={{ flex: 1 }}
      >
        {isPlaying && (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: '33%',
              marginTop: -glowSize / 2,
              alignItems: 'center',
            }}
          >
            <AmbientGlow color={themeData.glowColor} size={glowSize} />
          </View>
        )}

        {/* Full-height content: header clearance at top, actions pinned at bottom */}
        <View style={{ flex: 1, paddingTop: insets.top + 56, zIndex: 10 }}>
          {/* Center zone: title + play + waveform */}
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ marginBottom: 32, paddingHorizontal: 24, maxWidth: 384 }}>
              {profile.promptTitle ? (
                <Text
                  style={{
                    fontFamily: FONT.serifBold,
                    fontSize: 28,
                    lineHeight: 36,
                    color: 'white',
                    textAlign: 'center',
                    letterSpacing: -0.5,
                  }}
                >
                  {'\u201C'}
                  {profile.promptTitle}
                  {'\u201D'}
                </Text>
              ) : (
                <Text
                  style={{
                    fontFamily: FONT.serifItalic,
                    fontSize: 28,
                    lineHeight: 36,
                    color: 'rgba(255,255,255,0.6)',
                    textAlign: 'center',
                    letterSpacing: -0.5,
                    fontStyle: 'italic',
                  }}
                >
                  {COPY.feed.fallbackPrompt}
                </Text>
              )}
            </View>

            <View style={{ position: 'relative', marginBottom: 20, alignItems: 'center', justifyContent: 'center', width: svgSize, height: svgSize }}>
              <Svg
                width={svgSize}
                height={svgSize}
                style={{
                  position: 'absolute',
                  transform: [{ rotate: '-90deg' }],
                }}
              >
                <Circle
                  cx={svgSize / 2}
                  cy={svgSize / 2}
                  r={ringRadius}
                  fill="none"
                  stroke="rgba(255,255,255,0.1)"
                  strokeWidth={3}
                />
                {elapsed > 0 && (
                  <Circle
                    cx={svgSize / 2}
                    cy={svgSize / 2}
                    r={ringRadius}
                    fill="none"
                    stroke={themeData.ringColor}
                    strokeWidth={3}
                    strokeDasharray={`${ringCircumference}`}
                    strokeDashoffset={ringOffset}
                    strokeLinecap="round"
                  />
                )}
              </Svg>

              {!isPlaying && !hasListened && elapsed === 0 && (
                <View
                  pointerEvents="none"
                  style={{
                    position: 'absolute',
                    width: svgSize,
                    height: svgSize,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <PulseRing />
                </View>
              )}

              <Pressable
                onPress={handlePlayPress}
                style={{
                  width: 96,
                  height: 96,
                  borderRadius: 48,
                  backgroundColor: 'rgba(255,255,255,0.15)',
                  borderWidth: 1,
                  borderColor: 'rgba(255,255,255,0.2)',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {!hasRecordedVibe ? (
                  <Lock size={32} color="rgba(255,255,255,0.8)" />
                ) : hasListened && !isPlaying ? (
                  <RotateCcw size={28} color="rgba(255,255,255,0.9)" />
                ) : isPlaying ? (
                  <Pause size={32} fill="white" color="white" />
                ) : (
                  <Play size={32} fill="white" color="white" />
                )}
              </Pressable>
            </View>

            <View style={{ width: '100%', paddingHorizontal: 12 }}>
              <Waveform isPlaying={!!isPlaying} theme={theme} height={100} />
            </View>

            <Text
              style={{
                marginTop: 10,
                fontSize: 14,
                color: 'rgba(255,255,255,0.5)',
                fontVariant: ['tabular-nums'],
                fontFamily: FONT.medium,
              }}
            >
              {elapsed > 0
                ? `${formatTime(elapsed)} / ${formatTime(audioDurationSec)}`
                : formatTime(audioDurationSec)}
            </Text>
          </View>

          {/* ── Bottom: primary CTA + identity + secondary actions ────── */}
          <View style={{ paddingHorizontal: 24, paddingBottom: bottomNavHeight, gap: 16 }}>
          <FadeWhen visible={hasListened && !isPlaying}>
            <Text
              style={{
                textAlign: 'center',
                fontFamily: FONT.serifItalic,
                fontSize: 18,
                color: 'rgba(255,255,255,0.6)',
                fontStyle: 'italic',
              }}
            >
              {COPY.feed.afterListen}
            </Text>
          </FadeWhen>

          {/* Primary CTA — bridges the vocal above and the profile below */}
          <Pressable
            onPress={() => setShowReplyModal(true)}
            onPressIn={() => { replyScale.value = withSpring(0.97, TAP_SPRING); }}
            onPressOut={() => { replyScale.value = withSpring(1, TAP_SPRING); }}
          >
            <Animated.View style={replyAnimStyle}>
              <LinearGradient
                colors={[...themeData.ctaGradient]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={{
                  height: 56,
                  borderRadius: 999,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 10,
                  ...SHADOW.button,
                }}
              >
                <Mic size={20} color="white" />
                <Text style={{ fontFamily: FONT.semibold, fontSize: 16, color: 'white' }}>
                  {COPY.actions.reply}
                </Text>
              </LinearGradient>
            </Animated.View>
          </Pressable>

          <View>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 12, flexShrink: 1 }}>
                <Text style={{ fontSize: 24, fontFamily: FONT.bold, color: 'white' }}>
                  {profile.name}, {profile.age}
                </Text>
                <View style={{ flexDirection: 'row', gap: 4 }}>
                  {profile.emojis.map((emoji, idx) => (
                    <Text key={idx} style={{ fontSize: 16 }}>
                      {emoji}
                    </Text>
                  ))}
                </View>
              </View>

              {/* Secondary actions: like + report */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Pressable
                  onPress={handleLike}
                  onPressIn={() => { likeScale.value = withSpring(0.85, TAP_SPRING); }}
                  onPressOut={() => { likeScale.value = withSpring(1, TAP_SPRING); }}
                  hitSlop={10}
                  style={{ padding: 8 }}
                >
                  <Animated.View style={likeAnimStyle}>
                    <Heart
                      size={24}
                      color={isLiked ? '#ef4444' : 'rgba(255,255,255,0.7)'}
                      fill={isLiked ? '#ef4444' : 'none'}
                    />
                  </Animated.View>
                </Pressable>
                <Pressable
                  onPress={() => setShowReportModal(true)}
                  style={{ padding: 8 }}
                  hitSlop={10}
                >
                  <MoreHorizontal size={20} color="rgba(255,255,255,0.4)" />
                </Pressable>
              </View>
            </View>
            <Text style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', fontFamily: FONT.medium, marginTop: 2 }}>
              {profile.city}
            </Text>
          </View>
        </View>
        </View>
      </LinearGradient>

      {/* ── Reply Modal ─────────────────────────────────────────────── */}
      <ModalOverlay visible={showReplyModal} onClose={() => setShowReplyModal(false)}>
        <View style={{ width: 48, height: 48, backgroundColor: COLORS.primaryMuted, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
          <Mic size={24} color={COLORS.primary} />
        </View>
        <Text style={{ fontSize: 20, fontFamily: FONT.bold, marginBottom: 8, color: COLORS.dark }}>{COPY.replyModal.title}</Text>
        <Text style={{ color: COLORS.textSecondary, marginBottom: 24 }}>
          {COPY.replyModal.body(profile.name)}
        </Text>
        <Pressable onPress={() => setShowReplyModal(false)}>
          <LinearGradient
            colors={[...themeData.ctaGradient]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{ borderRadius: 999, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}
          >
            <Mic size={18} color="white" />
            <Text style={{ color: 'white', fontFamily: FONT.bold }}>{COPY.replyModal.cta}</Text>
          </LinearGradient>
        </Pressable>
      </ModalOverlay>

      {/* ── Report Modal ────────────────────────────────────────────── */}
      <ModalOverlay visible={showReportModal} onClose={() => setShowReportModal(false)}>
        <Text style={{ fontSize: 20, fontFamily: FONT.bold, marginBottom: 16, color: COLORS.dark }}>{COPY.reportModal.title(profile.name)}</Text>
        <TextInput
          value={reportReason}
          onChangeText={setReportReason}
          placeholder={COPY.reportModal.placeholder}
          placeholderTextColor={COLORS.textTertiary}
          multiline
          style={{
            width: '100%',
            backgroundColor: COLORS.borderLight,
            borderWidth: 1,
            borderColor: COLORS.border,
            borderRadius: 16,
            padding: 16,
            color: COLORS.dark,
            marginBottom: 12,
            minHeight: 100,
            textAlignVertical: 'top',
          }}
        />
        <View style={{ backgroundColor: 'rgba(239,68,68,0.1)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.15)', borderRadius: 12, padding: 12, marginBottom: 24 }}>
          <Text style={{ color: '#dc2626', fontSize: 12 }}>
            {COPY.reportModal.warning}
          </Text>
        </View>
        <Pressable
          onPress={() => { setShowReportModal(false); setReportReason(''); }}
          disabled={!reportReason.trim()}
          style={{ opacity: reportReason.trim() ? 1 : 0.4 }}
        >
          <View style={{ backgroundColor: '#ef4444', borderRadius: 999, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <Send size={18} color="white" />
            <Text style={{ color: 'white', fontFamily: FONT.bold }}>{COPY.reportModal.submit}</Text>
          </View>
        </Pressable>
      </ModalOverlay>

      {/* ── Locked Modal ────────────────────────────────────────────── */}
      <ModalOverlay visible={showLockedModal} onClose={() => setShowLockedModal(false)} centered>
        <View style={{ width: 80, height: 80, backgroundColor: COLORS.primaryMuted, borderRadius: 40, alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
          <Lock size={36} color={COLORS.primary} />
        </View>
        <Text style={{ fontSize: 24, fontFamily: FONT.serifBold, marginBottom: 12, color: COLORS.dark, textAlign: 'center' }}>
          {COPY.lockedModal.title}
        </Text>
        <Text style={{ color: COLORS.textSecondary, marginBottom: 32, textAlign: 'center' }}>
          {COPY.lockedModal.body}
        </Text>
        <Pressable onPress={() => { setShowLockedModal(false); onRecordVibe?.(); }} style={{ width: '100%' }}>
          <LinearGradient
            colors={[...themeData.ctaGradient]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{ borderRadius: 999, paddingVertical: 16, alignItems: 'center' }}
          >
            <Text style={{ color: 'white', fontFamily: FONT.bold }}>{COPY.lockedModal.cta}</Text>
          </LinearGradient>
        </Pressable>
        <Pressable onPress={() => setShowLockedModal(false)} style={{ width: '100%', marginTop: 16, paddingVertical: 8, alignItems: 'center' }}>
          <Text style={{ color: COLORS.textTertiary, fontFamily: FONT.medium }}>{COPY.common.later}</Text>
        </Pressable>
      </ModalOverlay>
    </View>
  );
};

export default ProfileCard;
