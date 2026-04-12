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
import { CTA_GRADIENT, THEME_GRADIENTS } from '../theme';
import Waveform from './Waveform';

interface ProfileCardProps {
  profile: Profile;
  togglePlay: (id: string) => void;
  onFinish?: (id: string) => void;
  hasRecordedVibe?: boolean;
  onLike?: () => void;
  onRecordVibe?: () => void;
}

const PLAY_BTN_SIZE = 96;
const RING_PADDING = 20;
const TAP_SPRING = { stiffness: 400, damping: 30 } as const;

/* ─── Reanimated sub-components ────────────────────────────────────────────── */

/** Repeating scale + opacity ring shown before the user presses play. */
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
      style={animStyle}
      className="w-24 h-24 rounded-full border-2 border-white/20"
    />
  );
}

/** Large background glow that breathes while audio plays. */
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

/** Container that renders children immediately visible — no mount animation that could fail silently. */
function EntranceView({
  children,
  style,
}: {
  children: React.ReactNode;
  delay?: number;
  fromY?: number;
  fromScale?: number;
  style?: object;
}) {
  return <View style={style}>{children}</View>;
}

/** Fades in/out based on `visible`. */
function FadeWhen({ visible, children }: { visible: boolean; children: React.ReactNode }) {
  const opacity = useSharedValue(visible ? 1 : 0);

  useEffect(() => {
    opacity.value = withTiming(visible ? 1 : 0, { duration: 250 });
  }, [visible]);

  const animStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return <Animated.View style={animStyle}>{children}</Animated.View>;
}

/** Fade + scale modal overlay with backdrop. */
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
        backgroundColor: 'rgba(75, 22, 76, 0.45)',
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
          <X size={22} color="rgba(75, 22, 76, 0.3)" />
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
  onLike,
  onRecordVibe,
}) => {
  const { theme, isPlaying, audioDurationSec } = profile;
  const { width: windowWidth } = useWindowDimensions();

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [hasListened, setHasListened] = useState(false);
  const [liked, setLiked] = useState(false);
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
  const themeData = THEME_GRADIENTS[theme];
  const ringRadius = (PLAY_BTN_SIZE + RING_PADDING) / 2;
  const ringCircumference = ringRadius * 2 * Math.PI;
  const ringOffset =
    ringCircumference - (progress / 100) * ringCircumference;
  const svgSize = PLAY_BTN_SIZE + RING_PADDING + 4;
  const glowSize = windowWidth * 0.8;

  const handleLike = () => {
    setLiked(true);
    setTimeout(() => onLike?.(), 600);
  };

  return (
    <View className="flex-1">
      {/* ── Card background ─────────────────────────────────────────── */}
      <LinearGradient
        colors={[...themeData.colors]}
        className="flex-1 overflow-hidden"
      >
        {/* Ambient glow */}
        {isPlaying && (
          <View
            pointerEvents="none"
            className="absolute inset-x-0 items-center"
            style={{ top: '33%', marginTop: -glowSize / 2 }}
          >
            <AmbientGlow color={themeData.glowColor} size={glowSize} />
          </View>
        )}

        {/* More / report button */}
        <View className="absolute top-16 right-4 z-20">
          <Pressable
            onPress={() => setShowReportModal(true)}
            className="p-2 rounded-full bg-white/10"
          >
            <MoreHorizontal size={18} className="text-white/40" />
          </Pressable>
        </View>

        {/* ── Center: catchphrase + play + waveform ─────────────────── */}
        <View className="relative z-10 flex-1 items-center justify-center pt-20 pb-4">
          {/* Prompt title */}
          <EntranceView delay={0} fromY={20} style={{ marginBottom: 40, paddingHorizontal: 24, maxWidth: 384 }}>
            {profile.promptTitle ? (
              <Text className="font-serif text-3xl font-bold text-white text-center leading-snug tracking-tight">
                {'\u201C'}
                {profile.promptTitle}
                {'\u201D'}
              </Text>
            ) : (
              <Text className="font-serif italic text-3xl text-white/60 text-center leading-snug tracking-tight">
                Écoute ma vibe…
              </Text>
            )}
          </EntranceView>

          {/* Play button + progress ring */}
          <EntranceView delay={200} fromScale={0} style={{ position: 'relative', marginBottom: 24, alignItems: 'center', justifyContent: 'center', width: svgSize, height: svgSize }}>
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
                className="absolute items-center justify-center"
                style={{ width: svgSize, height: svgSize }}
              >
                <PulseRing />
              </View>
            )}

            <Pressable
              onPress={handlePlayPress}
              className="w-24 h-24 rounded-full bg-white/15 border border-white/20 items-center justify-center"
            >
              {!hasRecordedVibe ? (
                <Lock size={32} className="text-white/80" />
              ) : hasListened && !isPlaying ? (
                <RotateCcw size={28} className="text-white/90" />
              ) : isPlaying ? (
                <Pause size={32} fill="white" className="text-white" />
              ) : (
                <Play size={32} fill="white" className="text-white" />
              )}
            </Pressable>
          </EntranceView>

          {/* Waveform */}
          <EntranceView delay={300} fromY={0} style={{ width: '100%', paddingHorizontal: 12 }}>
            <Waveform isPlaying={!!isPlaying} theme={theme} />
          </EntranceView>

          {/* Timer */}
          <Text className="mt-3 font-mono text-sm text-white/40">
            {elapsed > 0
              ? `${formatTime(elapsed)} / ${formatTime(audioDurationSec)}`
              : formatTime(audioDurationSec)}
          </Text>
        </View>

        {/* ── Bottom: info + actions ────────────────────────────────── */}
        <View className="relative z-10 px-6 pb-24 gap-5">
          <FadeWhen visible={hasListened && !isPlaying}>
            <Text className="text-center font-serif italic text-lg text-white/60">
              Ça vibre ?
            </Text>
          </FadeWhen>

          <View>
            <View className="flex-row items-baseline gap-3">
              <Text className="text-2xl font-bold text-white">
                {profile.name}, {profile.age}
              </Text>
              <View className="flex-row gap-1">
                {profile.emojis.map((emoji, idx) => (
                  <Text key={idx} className="text-base">
                    {emoji}
                  </Text>
                ))}
              </View>
            </View>
            <Text className="text-sm text-white/50 font-medium mt-0.5">
              {profile.city}
            </Text>
          </View>

          <View className="flex-row items-center gap-4">
            {/* Like */}
            <Pressable
              onPress={handleLike}
              onPressIn={() => {
                likeScale.value = withSpring(0.9, TAP_SPRING);
              }}
              onPressOut={() => {
                likeScale.value = withSpring(1, TAP_SPRING);
              }}
              className="flex-1"
            >
              <Animated.View
                style={likeAnimStyle}
                className={`h-14 rounded-full flex-row items-center justify-center gap-2 ${
                  liked ? 'bg-red-500' : 'bg-white/10 border border-white/15'
                }`}
              >
                <Heart
                  size={22}
                  className="text-white"
                  fill={liked ? 'white' : 'none'}
                />
                <Text className="font-semibold text-base text-white">
                  {liked ? 'Liké !' : 'Liker'}
                </Text>
              </Animated.View>
            </Pressable>

            {/* Reply */}
            <Pressable
              onPress={() => setShowReplyModal(true)}
              onPressIn={() => {
                replyScale.value = withSpring(0.9, TAP_SPRING);
              }}
              onPressOut={() => {
                replyScale.value = withSpring(1, TAP_SPRING);
              }}
              className="flex-1"
            >
              <Animated.View style={replyAnimStyle}>
                <LinearGradient
                  colors={[...CTA_GRADIENT]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  className="h-14 rounded-full flex-row items-center justify-center gap-2"
                >
                  <Mic size={22} className="text-white" />
                  <Text className="font-semibold text-base text-white">
                    Répondre
                  </Text>
                </LinearGradient>
              </Animated.View>
            </Pressable>
          </View>
        </View>
      </LinearGradient>

      {/* ── Reply Modal ─────────────────────────────────────────────── */}
      <ModalOverlay visible={showReplyModal} onClose={() => setShowReplyModal(false)}>
        <View className="w-12 h-12 bg-primary/10 rounded-full items-center justify-center mb-4">
          <Mic size={24} className="text-primary" />
        </View>
        <Text className="text-xl font-bold mb-2 text-dark">Un seul message.</Text>
        <Text className="text-dark/50 mb-6">
          Envoie un vocal à {profile.name}. {profile.name} l'écoute et décide de te répondre,
          ou non. Un seul message, pour que chacun reste libre.
        </Text>
        <Pressable onPress={() => setShowReplyModal(false)}>
          <LinearGradient
            colors={[...CTA_GRADIENT]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            className="rounded-full py-3.5 flex-row items-center justify-center gap-2"
          >
            <Mic size={18} className="text-white" />
            <Text className="text-white font-bold">Enregistrer ma réponse</Text>
          </LinearGradient>
        </Pressable>
      </ModalOverlay>

      {/* ── Report Modal ────────────────────────────────────────────── */}
      <ModalOverlay visible={showReportModal} onClose={() => setShowReportModal(false)}>
        <Text className="text-xl font-bold mb-4 text-dark">Signaler {profile.name}</Text>
        <TextInput
          value={reportReason}
          onChangeText={setReportReason}
          placeholder="Pourquoi signales-tu ce profil ?"
          placeholderTextColor="rgba(75, 22, 76, 0.3)"
          multiline
          className="w-full bg-dark/5 border border-dark/10 rounded-2xl p-4 text-dark mb-3"
          style={{ minHeight: 100, textAlignVertical: 'top' }}
        />
        <View className="bg-red-500/10 border border-red-500/15 rounded-xl p-3 mb-6">
          <Text className="text-red-600 text-xs">
            Le signalement supprimera ce profil de ton fil et enverra un mail à la modération.
          </Text>
        </View>
        <Pressable
          onPress={() => { setShowReportModal(false); setReportReason(''); }}
          disabled={!reportReason.trim()}
          style={{ opacity: reportReason.trim() ? 1 : 0.4 }}
        >
          <View className="bg-red-500 rounded-full py-3.5 flex-row items-center justify-center gap-2">
            <Send size={18} className="text-white" />
            <Text className="text-white font-bold">Envoyer le signalement</Text>
          </View>
        </Pressable>
      </ModalOverlay>

      {/* ── Locked Modal ────────────────────────────────────────────── */}
      <ModalOverlay visible={showLockedModal} onClose={() => setShowLockedModal(false)} centered>
        <View className="w-20 h-20 bg-primary/10 rounded-full items-center justify-center mb-5">
          <Lock size={36} className="text-primary" />
        </View>
        <Text className="text-2xl font-bold mb-3 text-dark font-serif text-center">
          Prêt·e à les entendre ?
        </Text>
        <Text className="text-dark/45 mb-8 text-center">
          Enregistre ta voix pour débloquer les autres vocaux. 30 secondes. Juste toi.
        </Text>
        <Pressable onPress={() => { setShowLockedModal(false); onRecordVibe?.(); }} className="w-full">
          <LinearGradient
            colors={[...CTA_GRADIENT]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            className="rounded-full py-4 items-center"
          >
            <Text className="text-white font-bold">Enregistrer ma Voix</Text>
          </LinearGradient>
        </Pressable>
        <Pressable onPress={() => setShowLockedModal(false)} className="w-full mt-4 py-2 items-center">
          <Text className="text-dark/30 font-medium">Plus tard</Text>
        </Pressable>
      </ModalOverlay>
    </View>
  );
};

export default ProfileCard;
