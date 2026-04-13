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
  const insets = useSafeAreaInsets();
  const bottomNavHeight = 56 + insets.bottom + 16;

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
    <View style={{ flex: 1 }}>
      {/* ── Card background ─────────────────────────────────────────── */}
      <LinearGradient
        colors={[...themeData.colors]}
        style={{ flex: 1 }}
      >
        {/* Ambient glow */}
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

        {/* More / report button */}
        <View style={{ position: 'absolute', top: 64, right: 16, zIndex: 20 }}>
          <Pressable
            onPress={() => setShowReportModal(true)}
            style={{
              padding: 8,
              borderRadius: 999,
              backgroundColor: 'rgba(255,255,255,0.1)',
            }}
          >
            <MoreHorizontal size={18} color="rgba(255,255,255,0.4)" />
          </Pressable>
        </View>

        {/* ── Center: catchphrase + play + waveform ─────────────────── */}
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', zIndex: 10 }}>
          {/* Prompt title */}
          <EntranceView delay={0} fromY={20} style={{ marginBottom: 40, paddingHorizontal: 24, maxWidth: 384 }}>
            {profile.promptTitle ? (
              <Text
                style={{
                  fontFamily: 'PlayfairDisplay_700Bold',
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
                  fontFamily: 'PlayfairDisplay_400Regular_Italic',
                  fontSize: 28,
                  lineHeight: 36,
                  color: 'rgba(255,255,255,0.6)',
                  textAlign: 'center',
                  letterSpacing: -0.5,
                  fontStyle: 'italic',
                }}
              >
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
          </EntranceView>

          {/* Waveform */}
          <EntranceView delay={300} fromY={0} style={{ width: '100%', paddingHorizontal: 12 }}>
            <Waveform isPlaying={!!isPlaying} theme={theme} />
          </EntranceView>

          {/* Timer */}
          <Text style={{ marginTop: 12, fontSize: 14, color: 'rgba(255,255,255,0.4)', fontVariant: ['tabular-nums'] }}>
            {elapsed > 0
              ? `${formatTime(elapsed)} / ${formatTime(audioDurationSec)}`
              : formatTime(audioDurationSec)}
          </Text>
        </View>

        {/* ── Bottom: info + actions ────────────────────────────────── */}
        <View style={{ zIndex: 10, paddingHorizontal: 24, paddingBottom: bottomNavHeight, gap: 16 }}>
          <FadeWhen visible={hasListened && !isPlaying}>
            <Text
              style={{
                textAlign: 'center',
                fontFamily: 'PlayfairDisplay_400Regular_Italic',
                fontSize: 18,
                color: 'rgba(255,255,255,0.6)',
                fontStyle: 'italic',
              }}
            >
              Ça vibre ?
            </Text>
          </FadeWhen>

          <View>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 12 }}>
              <Text style={{ fontSize: 24, fontWeight: '700', color: 'white' }}>
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
            <Text style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', fontWeight: '500', marginTop: 2 }}>
              {profile.city}
            </Text>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
            {/* Like */}
            <Pressable
              onPress={handleLike}
              onPressIn={() => {
                likeScale.value = withSpring(0.9, TAP_SPRING);
              }}
              onPressOut={() => {
                likeScale.value = withSpring(1, TAP_SPRING);
              }}
              style={{ flex: 1 }}
            >
              <Animated.View
                style={[
                  {
                    height: 56,
                    borderRadius: 999,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    backgroundColor: liked ? '#ef4444' : 'rgba(255,255,255,0.1)',
                    borderWidth: liked ? 0 : 1,
                    borderColor: 'rgba(255,255,255,0.15)',
                  },
                  likeAnimStyle,
                ]}
              >
                <Heart
                  size={22}
                  color="white"
                  fill={liked ? 'white' : 'none'}
                />
                <Text style={{ fontWeight: '600', fontSize: 16, color: 'white' }}>
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
              style={{ flex: 1 }}
            >
              <Animated.View style={replyAnimStyle}>
                <LinearGradient
                  colors={[...CTA_GRADIENT]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={{
                    height: 56,
                    borderRadius: 999,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                  }}
                >
                  <Mic size={22} color="white" />
                  <Text style={{ fontWeight: '600', fontSize: 16, color: 'white' }}>
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
        <View style={{ width: 48, height: 48, backgroundColor: 'rgba(231,36,171,0.1)', borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
          <Mic size={24} color="#e724ab" />
        </View>
        <Text style={{ fontSize: 20, fontWeight: '700', marginBottom: 8, color: '#4b164c' }}>Un seul message.</Text>
        <Text style={{ color: 'rgba(75,22,76,0.5)', marginBottom: 24 }}>
          Envoie un vocal à {profile.name}. {profile.name} l'écoute et décide de te répondre,
          ou non. Un seul message, pour que chacun reste libre.
        </Text>
        <Pressable onPress={() => setShowReplyModal(false)}>
          <LinearGradient
            colors={[...CTA_GRADIENT]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{ borderRadius: 999, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}
          >
            <Mic size={18} color="white" />
            <Text style={{ color: 'white', fontWeight: '700' }}>Enregistrer ma réponse</Text>
          </LinearGradient>
        </Pressable>
      </ModalOverlay>

      {/* ── Report Modal ────────────────────────────────────────────── */}
      <ModalOverlay visible={showReportModal} onClose={() => setShowReportModal(false)}>
        <Text style={{ fontSize: 20, fontWeight: '700', marginBottom: 16, color: '#4b164c' }}>Signaler {profile.name}</Text>
        <TextInput
          value={reportReason}
          onChangeText={setReportReason}
          placeholder="Pourquoi signales-tu ce profil ?"
          placeholderTextColor="rgba(75, 22, 76, 0.3)"
          multiline
          style={{
            width: '100%',
            backgroundColor: 'rgba(75,22,76,0.05)',
            borderWidth: 1,
            borderColor: 'rgba(75,22,76,0.1)',
            borderRadius: 16,
            padding: 16,
            color: '#4b164c',
            marginBottom: 12,
            minHeight: 100,
            textAlignVertical: 'top',
          }}
        />
        <View style={{ backgroundColor: 'rgba(239,68,68,0.1)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.15)', borderRadius: 12, padding: 12, marginBottom: 24 }}>
          <Text style={{ color: '#dc2626', fontSize: 12 }}>
            Le signalement supprimera ce profil de ton fil et enverra un mail à la modération.
          </Text>
        </View>
        <Pressable
          onPress={() => { setShowReportModal(false); setReportReason(''); }}
          disabled={!reportReason.trim()}
          style={{ opacity: reportReason.trim() ? 1 : 0.4 }}
        >
          <View style={{ backgroundColor: '#ef4444', borderRadius: 999, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <Send size={18} color="white" />
            <Text style={{ color: 'white', fontWeight: '700' }}>Envoyer le signalement</Text>
          </View>
        </Pressable>
      </ModalOverlay>

      {/* ── Locked Modal ────────────────────────────────────────────── */}
      <ModalOverlay visible={showLockedModal} onClose={() => setShowLockedModal(false)} centered>
        <View style={{ width: 80, height: 80, backgroundColor: 'rgba(231,36,171,0.1)', borderRadius: 40, alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
          <Lock size={36} color="#e724ab" />
        </View>
        <Text style={{ fontSize: 24, fontWeight: '700', marginBottom: 12, color: '#4b164c', fontFamily: 'PlayfairDisplay_700Bold', textAlign: 'center' }}>
          Prêt·e à les entendre ?
        </Text>
        <Text style={{ color: 'rgba(75,22,76,0.45)', marginBottom: 32, textAlign: 'center' }}>
          Enregistre ta voix pour débloquer les autres vocaux. 30 secondes. Juste toi.
        </Text>
        <Pressable onPress={() => { setShowLockedModal(false); onRecordVibe?.(); }} style={{ width: '100%' }}>
          <LinearGradient
            colors={[...CTA_GRADIENT]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{ borderRadius: 999, paddingVertical: 16, alignItems: 'center' }}
          >
            <Text style={{ color: 'white', fontWeight: '700' }}>Enregistrer ma Voix</Text>
          </LinearGradient>
        </Pressable>
        <Pressable onPress={() => setShowLockedModal(false)} style={{ width: '100%', marginTop: 16, paddingVertical: 8, alignItems: 'center' }}>
          <Text style={{ color: 'rgba(75,22,76,0.3)', fontWeight: '500' }}>Plus tard</Text>
        </Pressable>
      </ModalOverlay>
    </View>
  );
};

export default ProfileCard;
