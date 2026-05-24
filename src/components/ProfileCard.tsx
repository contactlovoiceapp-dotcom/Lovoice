/* Full-screen immersive profile card — the heart of the Discover feed.
   Consumes a FeedItem + a feed player snapshot/controls pair; renders the audio
   progress ring, waveform, identity row, and the overlay modals (reply, actions, report, block, locked). */

import React, { useEffect, useState } from 'react';
import {
  Platform,
  Pressable,
  Text,
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
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import {
  ChevronDown,
  Heart,
  Lock,
  Mic,
  MoreHorizontal,
  Pause,
  RotateCcw,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

import { COLORS, FONT, RADIUS, SHADOW, THEME_GRADIENTS, hexToRgba } from '../theme';
import { COPY } from '../copy';
import { formatTime } from '../lib/formatTime';
import { ageFromBirthdate } from '../lib/age';
import type { FeedItem } from '../features/feed/types';
import type { FeedPlayerControls, FeedPlayerSnapshot } from '../lib/feedPlayer';
import Waveform from './Waveform';
import ModalOverlay from './ModalOverlay';
import ActionsSheet from '../features/moderation/components/ActionsSheet';
import ReportSheet from '../features/moderation/components/ReportSheet';
import BlockConfirmModal from '../features/moderation/components/BlockConfirmModal';

interface ProfileCardProps {
  item: FeedItem;
  /**
   * Player state for THIS card. Falsy snapshot fields are valid and rendered as zeros.
   * Cards that aren't the current viewport item receive a "paused / no progress" snapshot.
   */
  snapshot: FeedPlayerSnapshot;
  controls: FeedPlayerControls;
  hasRecordedVoice?: boolean;
  isLiked: boolean;
  onToggleLike: () => void;
  onRecordVoice?: () => void;
  /** When provided, tapping "Répondre" calls this instead of showing the legacy placeholder modal. */
  onPressReply?: (item: FeedItem) => void;
}

const PLAY_BTN_SIZE = 96;
const RING_PADDING = 20;
const TAP_SPRING = { stiffness: 400, damping: 30 } as const;
const PLAY_BUTTON_RADIUS = PLAY_BTN_SIZE / 2;
const ANDROID_PLAY_SHADOW = {
  shadowColor: 'transparent',
  elevation: 0,
} as const;
// Tolerance window in ms — playback rarely reports the exact final position.
const HAS_LISTENED_TOLERANCE_MS = 500;

/* ─── Reanimated sub-components ────────────────────────────────────────────── */

function PulseRing({ color }: { color: string }) {
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
          borderColor: color,
        },
        animStyle,
      ]}
    />
  );
}

/* True radial gradient bloom — fades to zero at edges so no disc contour is visible.
   stopOpacity values define the falloff shape; the View's animated opacity drives intensity. */
function GlowLayer({
  color,
  size,
  maxOpacity,
  scaleFrom,
  scaleTo,
  duration,
  gradientId,
}: {
  color: string;
  size: number;
  maxOpacity: number;
  scaleFrom: number;
  scaleTo: number;
  duration: number;
  gradientId: string;
}) {
  const scale = useSharedValue(scaleFrom);
  const opacity = useSharedValue(0);

  useEffect(() => {
    scale.value = withRepeat(
      withTiming(scaleTo, { duration, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
    opacity.value = withRepeat(
      withTiming(maxOpacity, { duration, easing: Easing.inOut(Easing.sin) }),
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
    <Animated.View pointerEvents="none" style={[animStyle, { width: size, height: size }]}>
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id={gradientId} cx="50%" cy="50%" r="50%">
            <Stop offset="0%"   stopColor={color} stopOpacity={1} />
            <Stop offset="35%"  stopColor={color} stopOpacity={0.55} />
            <Stop offset="65%"  stopColor={color} stopOpacity={0.15} />
            <Stop offset="100%" stopColor={color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={size / 2} fill={`url(#${gradientId})`} />
      </Svg>
    </Animated.View>
  );
}

/* Fades children in/out on 250ms when `visible` changes. Local to this file for the feed advance cue. */
function FadeWhen({ visible, children }: { visible: boolean; children: React.ReactNode }) {
  const opacity = useSharedValue(visible ? 1 : 0);

  useEffect(() => {
    opacity.value = withTiming(visible ? 1 : 0, { duration: 250 });
  }, [visible]);

  const animStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return <Animated.View style={animStyle}>{children}</Animated.View>;
}

function PlayGlyph({ size = 34, color = 'white' }: { size?: number; color?: string }) {
  return (
    <View
      style={{
        width: 0,
        height: 0,
        marginLeft: size * 0.1,
        borderTopWidth: size * 0.3,
        borderBottomWidth: size * 0.3,
        borderLeftWidth: size * 0.48,
        borderTopColor: 'transparent',
        borderBottomColor: 'transparent',
        borderLeftColor: color,
      }}
    />
  );
}

/* ─── ProfileCard ──────────────────────────────────────────────────────────── */

const ProfileCard: React.FC<ProfileCardProps> = ({
  item,
  snapshot,
  controls,
  hasRecordedVoice = true,
  isLiked,
  onToggleLike,
  onRecordVoice,
  onPressReply,
}) => {
  const theme = item.theme;
  const { width: windowWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  // Floating pill nav (52px) + bottom inset + 12px gap above + 16px breathing
  const bottomNavHeight = 52 + insets.bottom + 12 + 16;

  const [hasListened, setHasListened] = useState(false);
  const [showActionsSheet, setShowActionsSheet] = useState(false);
  const [showReportSheet, setShowReportSheet] = useState(false);
  const [showBlockConfirm, setShowBlockConfirm] = useState(false);
  const [showLockedModal, setShowLockedModal] = useState(false);

  const { isPlaying, positionMs, durationMs, isLoading, error } = snapshot;
  // The server-known duration is the ground truth until the player loads; preserves the
  // "0:30" total on the right side of the timer the moment the card mounts.
  const knownDurationSec = durationMs > 0 ? durationMs / 1000 : item.durationMs / 1000;
  const elapsedSec = durationMs > 0 ? positionMs / 1000 : 0;

  const likeScale = useSharedValue(1);
  const replyScale = useSharedValue(1);
  // Drives the CTA from "present but calm" (0.7) to "fully engaged" (1.0) once the user starts listening.
  const intensity = useSharedValue(0);
  const playScale = useSharedValue(1);
  // Controls the ambient glow visibility — fades in on play, fades out slowly on pause.
  const glowOpacity = useSharedValue(0);
  const chevronY = useSharedValue(0);

  const likeAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: likeScale.value }],
  }));
  const replyAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: replyScale.value }],
  }));
  const playScaleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: playScale.value }],
  }));
  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
  }));
  const ctaIntensityStyle = useAnimatedStyle(() => ({
    opacity: 0.7 + intensity.value * 0.3,
  }));
  // Glow layer behind the CTA gradient, revealed as the user engages.
  const ctaGlowStyle = useAnimatedStyle(() => ({
    opacity: intensity.value,
  }));
  const chevronAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: chevronY.value }],
  }));

  useEffect(() => {
    chevronY.value = withRepeat(
      withSequence(
        withTiming(4, { duration: 900, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 900, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false,
    );
    return () => cancelAnimation(chevronY);
  }, []);

  // Tracks whether the user has heard the track through to the end.
  // Reset to false when positionMs drops back near 0 (i.e. after a seekTo(0) replay)
  // so that pausing mid-replay restores the normal play button, not the RotateCcw.
  useEffect(() => {
    if (durationMs > 0 && positionMs >= durationMs - HAS_LISTENED_TOLERANCE_MS) {
      setHasListened(true);
    } else if (positionMs < 1000) {
      setHasListened(false);
    }
  }, [positionMs, durationMs]);

  // Surface unexpected player failures so they show up in Sentry breadcrumbs while keeping the UI quiet.
  useEffect(() => {
    if (error) {
      console.warn('profile_card.player_error', error);
    }
  }, [error]);

  const playButtonDisabled = !!error || isLoading;

  const handlePlayPress = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (!hasRecordedVoice) {
      setShowLockedModal(true);
      return;
    }
    if (playButtonDisabled) return;
    if (isPlaying) {
      controls.pause();
    } else {
      controls.play();
    }
  };

  useEffect(() => {
    intensity.value = withTiming(isPlaying || elapsedSec > 0 ? 1 : 0, { duration: 300 });
  }, [isPlaying, elapsedSec]);

  useEffect(() => {
    if (isPlaying) {
      glowOpacity.value = withTiming(1, { duration: 600, easing: Easing.out(Easing.ease) });
    } else {
      // Slow fade-out so the glow dissolves rather than snapping off.
      glowOpacity.value = withTiming(0, { duration: 1200, easing: Easing.in(Easing.ease) });
    }
  }, [isPlaying]);

  useEffect(() => {
    if (isPlaying) {
      playScale.value = withRepeat(
        withSequence(
          withTiming(1.03, { duration: 750, easing: Easing.inOut(Easing.sin) }),
          withTiming(1, { duration: 750, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
        false,
      );
    } else {
      cancelAnimation(playScale);
      playScale.value = withTiming(1, { duration: 200 });
    }
    return () => {
      cancelAnimation(playScale);
    };
  }, [isPlaying]);

  const progress =
    durationMs > 0 ? (positionMs / durationMs) * 100 : 0;
  const waveformProgress = durationMs > 0 ? positionMs / durationMs : 0;
  const themeData = THEME_GRADIENTS[theme] ?? THEME_GRADIENTS.sunset;
  const ringRadius = (PLAY_BTN_SIZE + RING_PADDING) / 2;
  const ringCircumference = ringRadius * 2 * Math.PI;
  const ringOffset =
    ringCircumference - (progress / 100) * ringCircumference;
  const svgSize = PLAY_BTN_SIZE + RING_PADDING + 4;
  const outerGlowSize = windowWidth * 1.6;
  const innerGlowSize = windowWidth * 0.9;

  const handleLike = () => {
    if (!isLiked) {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } else {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onToggleLike();
  };

  // Catchphrase preference: user-authored title → seeded prompt body → generic placeholder.
  const catchphrase = item.title ?? item.promptBody;
  const displayAge = ageFromBirthdate(item.birthdate);
  // Loading state: dim the icon when buffering before first play, so the user knows it's coming.
  const playIconOpacity = isLoading && !isPlaying ? 0.6 : 1;

  return (
    <View style={{ flex: 1 }}>
      <LinearGradient
        colors={[...themeData.colors]}
        style={{ flex: 1 }}
      >
        <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }, glowStyle]}>
          {/* Outer haze: white spotlight on the theme gradient — wide, slow, barely there */}
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: '33%',
              marginTop: -(outerGlowSize / 2),
              alignItems: 'center',
            }}
          >
            <GlowLayer
              gradientId="glowOuter"
              color="white"
              size={outerGlowSize}
              maxOpacity={0.16}
              scaleFrom={0.85}
              scaleTo={1.15}
              duration={4000}
            />
          </View>
          {/* Inner bloom: theme color concentrated around the play button, faster beat */}
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: '33%',
              marginTop: -(innerGlowSize / 2),
              alignItems: 'center',
            }}
          >
            <GlowLayer
              gradientId="glowInner"
              color={themeData.glowColor}
              size={innerGlowSize}
              maxOpacity={0.38}
              scaleFrom={0.75}
              scaleTo={1.05}
              duration={2500}
            />
          </View>
        </Animated.View>

        {/* Full-height content: header clearance at top, actions pinned at bottom */}
        <View style={{ flex: 1, paddingTop: insets.top + 56, zIndex: 10 }}>
          {/* Center zone: title + play + waveform */}
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ marginBottom: 32, paddingHorizontal: 24, maxWidth: 384 }}>
              {catchphrase ? (
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
                  {catchphrase}
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
                {positionMs > 0 && (
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

              {!isPlaying && !hasListened && positionMs === 0 && (
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
                  <PulseRing color={hexToRgba(themeData.ringColor, 0.3)} />
                </View>
              )}

              <Animated.View
                style={[
                  playScaleStyle,
                  SHADOW.play,
                  Platform.OS === 'android' ? ANDROID_PLAY_SHADOW : null,
                  { borderRadius: PLAY_BUTTON_RADIUS },
                ]}
              >
                <Pressable
                  onPress={handlePlayPress}
                  disabled={playButtonDisabled}
                  style={{
                    width: PLAY_BTN_SIZE,
                    height: PLAY_BTN_SIZE,
                    borderRadius: PLAY_BUTTON_RADIUS,
                    backgroundColor: 'rgba(255,255,255,0.22)',
                    borderWidth: 1,
                    borderColor: 'rgba(255,255,255,0.35)',
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'hidden',
                    opacity: playIconOpacity,
                  }}
                >
                  {!hasRecordedVoice ? (
                    <Lock size={32} color="rgba(255,255,255,0.8)" />
                  ) : hasListened && !isPlaying ? (
                    <RotateCcw size={28} color="rgba(255,255,255,0.9)" />
                  ) : isPlaying ? (
                    <Pause size={32} fill="white" color="white" />
                  ) : (
                    <PlayGlyph />
                  )}
                </Pressable>
              </Animated.View>
            </View>

            <View style={{ width: '100%', paddingHorizontal: 12 }}>
              <Waveform isPlaying={isPlaying} theme={theme} height={100} />
            </View>

            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'flex-end',
                paddingHorizontal: 16,
                marginTop: 6,
              }}
            >
              <Text
                style={{
                  fontSize: 11,
                  color: 'rgba(255,255,255,0.4)',
                  fontVariant: ['tabular-nums'],
                  fontFamily: FONT.medium,
                }}
              >
                {waveformProgress >= 1
                  ? formatTime(knownDurationSec)
                  : waveformProgress > 0
                    ? `${formatTime(elapsedSec)} / ${formatTime(knownDurationSec)}`
                    : formatTime(knownDurationSec)}
              </Text>
            </View>
          </View>

          {/* ── Bottom: actions row + identity card ────── */}
          <View style={{ paddingHorizontal: 24, paddingBottom: bottomNavHeight, gap: 16 }}>

            {/* Row 1: CTA "Répondre" (flex 1) + Like satellite (56px) */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Pressable
                style={{ flex: 1 }}
                onPress={() => {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  if (onPressReply) {
                    onPressReply(item);
                  }
                }}
                onPressIn={() => { replyScale.value = withSpring(0.97, TAP_SPRING); }}
                onPressOut={() => { replyScale.value = withSpring(1, TAP_SPRING); }}
              >
                <Animated.View style={[replyAnimStyle, ctaIntensityStyle]}>
                  {/* Glow caster behind the CTA — uses the active theme accent so the halo matches the mood. */}
                  <Animated.View
                    pointerEvents="none"
                    style={[
                      {
                        position: 'absolute',
                        top: 0, left: 0, right: 0, bottom: 0,
                        borderRadius: RADIUS.cta,
                        backgroundColor: themeData.accent,
                        shadowColor: themeData.accent,
                        shadowOffset: { width: 0, height: 8 },
                        shadowOpacity: 0.4,
                        shadowRadius: 20,
                      },
                      ctaGlowStyle,
                    ]}
                  />
                  <LinearGradient
                    colors={[...themeData.ctaGradient]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={{
                      height: 56,
                      borderRadius: RADIUS.cta,
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

              {/* Like satellite — 56px circle, closer to thumb than buried in identity row */}
              <Pressable
                onPress={handleLike}
                onPressIn={() => { likeScale.value = withSpring(0.85, TAP_SPRING); }}
                onPressOut={() => { likeScale.value = withSpring(1, TAP_SPRING); }}
                hitSlop={8}
              >
                <Animated.View
                  style={[
                    {
                      width: 56,
                      height: 56,
                      borderRadius: 28,
                      backgroundColor: 'rgba(255,255,255,0.12)',
                      borderWidth: 1,
                      borderColor: 'rgba(255,255,255,0.25)',
                      alignItems: 'center',
                      justifyContent: 'center',
                    },
                    likeAnimStyle,
                  ]}
                >
                  <Heart
                    size={26}
                    color={isLiked ? '#ef4444' : 'rgba(255,255,255,0.9)'}
                    fill={isLiked ? '#ef4444' : 'none'}
                  />
                </Animated.View>
              </Pressable>
            </View>

            {/* Row 2: Identity card */}
            <View style={{ gap: 4 }}>
              {/* Line 1: name + age | More button */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 24, fontFamily: FONT.bold, color: 'white' }}>
                  {item.displayName}, {displayAge}
                </Text>
                <Pressable
                  onPress={() => setShowActionsSheet(true)}
                  hitSlop={12}
                  style={{ padding: 4 }}
                >
                  <MoreHorizontal size={18} color="rgba(255,255,255,0.35)" />
                </Pressable>
              </View>

              {/* Line 2: emojis · city */}
              <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
                {item.bioEmojis.map((emoji, idx) => (
                  <Text
                    key={idx}
                    style={{ fontSize: 18, marginRight: idx < item.bioEmojis.length - 1 ? 4 : 0 }}
                  >
                    {emoji}
                  </Text>
                ))}
                <Text style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', marginHorizontal: 4 }}>
                  ·
                </Text>
                <Text style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', fontFamily: FONT.medium }}>
                  {item.city}
                </Text>
              </View>
            </View>

            {/* Feed advance cue — only shown after listening is done and not during playback */}
            <FadeWhen visible={hasListened && !isPlaying}>
              <View style={{ alignItems: 'center', marginTop: 4 }}>
                <Animated.View style={chevronAnimStyle}>
                  <ChevronDown size={20} color="rgba(255,255,255,0.4)" strokeWidth={2.4} />
                </Animated.View>
              </View>
            </FadeWhen>
          </View>
        </View>
      </LinearGradient>

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
        <Pressable onPress={() => { setShowLockedModal(false); onRecordVoice?.(); }} style={{ width: '100%' }}>
          <LinearGradient
            colors={[...themeData.ctaGradient]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{ borderRadius: RADIUS.cta, paddingVertical: 16, alignItems: 'center' }}
          >
            <Text style={{ color: 'white', fontFamily: FONT.bold }}>{COPY.lockedModal.cta}</Text>
          </LinearGradient>
        </Pressable>
        <Pressable onPress={() => setShowLockedModal(false)} style={{ width: '100%', marginTop: 16, paddingVertical: 8, alignItems: 'center' }}>
          <Text style={{ color: COLORS.textTertiary, fontFamily: FONT.medium }}>{COPY.common.later}</Text>
        </Pressable>
      </ModalOverlay>

      <ActionsSheet
        visible={showActionsSheet}
        displayName={item.displayName}
        onReport={() => { setShowActionsSheet(false); setShowReportSheet(true); }}
        onBlock={() => { setShowActionsSheet(false); setShowBlockConfirm(true); }}
        onClose={() => setShowActionsSheet(false)}
      />
      <ReportSheet
        visible={showReportSheet}
        displayName={item.displayName}
        targetKind="voice"
        targetId={item.voiceId}
        targetUserId={item.userId}
        onClose={() => setShowReportSheet(false)}
      />
      <BlockConfirmModal
        visible={showBlockConfirm}
        displayName={item.displayName}
        blockedUserId={item.userId}
        onClose={() => setShowBlockConfirm(false)}
      />
    </View>
  );
};

export default ProfileCard;
