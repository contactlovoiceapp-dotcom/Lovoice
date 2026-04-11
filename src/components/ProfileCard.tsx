/* Full-screen immersive profile card — the heart of the Discover feed.
   Renders the audio player, progress ring, waveform, profile info,
   action buttons, and three overlay modals (reply, report, locked). */

import React, { useState } from 'react';
import {
  Pressable,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
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
} from 'lucide-react-native';

import type { Profile } from '../types';
import { CTA_GRADIENT, THEME_GRADIENTS } from '../theme';
import { useAudioProgress } from '../hooks/useAudioProgress';
import Waveform from './Waveform';
import AmbientGlow from './ui/AmbientGlow';
import EntranceView from './ui/EntranceView';
import FadeWhen from './ui/FadeWhen';
import ModalOverlay from './ui/ModalOverlay';
import PulseRing from './ui/PulseRing';

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

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

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

  const { elapsed, progress, hasFinished } = useAudioProgress(
    !!isPlaying,
    audioDurationSec,
    () => onFinish?.(profile.id),
  );

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
      <LinearGradient
        colors={[...themeData.colors]}
        className="flex-1 overflow-hidden"
      >
        {isPlaying && (
          <View
            pointerEvents="none"
            className="absolute inset-x-0 items-center"
            style={{ top: '33%', marginTop: -glowSize / 2 }}
          >
            <AmbientGlow color={themeData.glowColor} size={glowSize} />
          </View>
        )}

        <View className="absolute right-4 top-16 z-20">
          <Pressable
            onPress={() => setShowReportModal(true)}
            className="rounded-full bg-white/10 p-2"
          >
            <MoreHorizontal size={18} className="text-white/40" />
          </Pressable>
        </View>

        <View className="relative z-10 flex-1 items-center justify-center pb-4 pt-20">
          <EntranceView delay={0} fromY={20} style={{ marginBottom: 40, paddingHorizontal: 24, maxWidth: 384 }}>
            {profile.promptTitle ? (
              <Text className="text-center font-serif text-3xl font-bold leading-snug tracking-tight text-white">
                {'\u201C'}
                {profile.promptTitle}
                {'\u201D'}
              </Text>
            ) : (
              <Text className="text-center font-serif text-3xl italic leading-snug tracking-tight text-white/60">
                Écoute ma vibe…
              </Text>
            )}
          </EntranceView>

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

            {!isPlaying && !hasFinished && elapsed === 0 && (
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
              className="h-24 w-24 items-center justify-center rounded-full border border-white/20 bg-white/15"
            >
              {!hasRecordedVibe ? (
                <Lock size={32} className="text-white/80" />
              ) : hasFinished && !isPlaying ? (
                <RotateCcw size={28} className="text-white/90" />
              ) : isPlaying ? (
                <Pause size={32} fill="white" className="text-white" />
              ) : (
                <Play size={32} fill="white" className="text-white" />
              )}
            </Pressable>
          </EntranceView>

          <EntranceView delay={300} fromY={0} style={{ width: '100%', paddingHorizontal: 12 }}>
            <Waveform isPlaying={!!isPlaying} theme={theme} />
          </EntranceView>

          <Text className="mt-3 font-mono text-sm text-white/40">
            {elapsed > 0
              ? `${formatTime(elapsed)} / ${formatTime(audioDurationSec)}`
              : formatTime(audioDurationSec)}
          </Text>
        </View>

        <View className="relative z-10 gap-5 px-6 pb-24">
          <FadeWhen visible={hasFinished && !isPlaying}>
            <Text className="text-center font-serif text-lg italic text-white/60">
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
            <Text className="mt-0.5 text-sm font-medium text-white/50">
              {profile.city}
            </Text>
          </View>

          <View className="flex-row items-center gap-4">
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
                className={`h-14 flex-row items-center justify-center gap-2 rounded-full ${
                  liked ? 'bg-red-500' : 'border border-white/15 bg-white/10'
                }`}
              >
                <Heart
                  size={22}
                  className="text-white"
                  fill={liked ? 'white' : 'none'}
                />
                <Text className="text-base font-semibold text-white">
                  {liked ? 'Liké !' : 'Liker'}
                </Text>
              </Animated.View>
            </Pressable>

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
                  className="h-14 flex-row items-center justify-center gap-2 rounded-full"
                >
                  <Mic size={22} className="text-white" />
                  <Text className="text-base font-semibold text-white">
                    Répondre
                  </Text>
                </LinearGradient>
              </Animated.View>
            </Pressable>
          </View>
        </View>
      </LinearGradient>

      <ModalOverlay visible={showReplyModal} onClose={() => setShowReplyModal(false)}>
        <View className="mb-4 h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <Mic size={24} className="text-primary" />
        </View>
        <Text className="mb-2 text-xl font-bold text-dark">Un seul message.</Text>
        <Text className="mb-6 text-dark/50">
          Envoie un vocal à {profile.name}. {profile.name} l'écoute et décide de te répondre,
          ou non. Un seul message, pour que chacun reste libre.
        </Text>
        <Pressable onPress={() => setShowReplyModal(false)}>
          <LinearGradient
            colors={[...CTA_GRADIENT]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            className="flex-row items-center justify-center gap-2 rounded-full py-3.5"
          >
            <Mic size={18} className="text-white" />
            <Text className="font-bold text-white">Enregistrer ma réponse</Text>
          </LinearGradient>
        </Pressable>
      </ModalOverlay>

      <ModalOverlay visible={showReportModal} onClose={() => setShowReportModal(false)}>
        <Text className="mb-4 text-xl font-bold text-dark">Signaler {profile.name}</Text>
        <TextInput
          value={reportReason}
          onChangeText={setReportReason}
          placeholder="Pourquoi signales-tu ce profil ?"
          placeholderTextColor="rgba(75, 22, 76, 0.3)"
          multiline
          className="mb-3 w-full rounded-2xl border border-dark/10 bg-dark/5 p-4 text-dark"
          style={{ minHeight: 100, textAlignVertical: 'top' }}
        />
        <View className="mb-6 rounded-xl border border-red-500/15 bg-red-500/10 p-3">
          <Text className="text-xs text-red-600">
            Le signalement supprimera ce profil de ton fil et enverra un mail à la modération.
          </Text>
        </View>
        <Pressable
          onPress={() => { setShowReportModal(false); setReportReason(''); }}
          disabled={!reportReason.trim()}
          style={{ opacity: reportReason.trim() ? 1 : 0.4 }}
        >
          <View className="flex-row items-center justify-center gap-2 rounded-full bg-red-500 py-3.5">
            <Send size={18} className="text-white" />
            <Text className="font-bold text-white">Envoyer le signalement</Text>
          </View>
        </Pressable>
      </ModalOverlay>

      <ModalOverlay visible={showLockedModal} onClose={() => setShowLockedModal(false)} centered>
        <View className="mb-5 h-20 w-20 items-center justify-center rounded-full bg-primary/10">
          <Lock size={36} className="text-primary" />
        </View>
        <Text className="mb-3 text-center font-serif text-2xl font-bold text-dark">
          Prêt·e à les entendre ?
        </Text>
        <Text className="mb-8 text-center text-dark/45">
          Enregistre ta voix pour débloquer les autres vocaux. 30 secondes. Juste toi.
        </Text>
        <Pressable onPress={() => { setShowLockedModal(false); onRecordVibe?.(); }} className="w-full">
          <LinearGradient
            colors={[...CTA_GRADIENT]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            className="items-center rounded-full py-4"
          >
            <Text className="font-bold text-white">Enregistrer ma Voix</Text>
          </LinearGradient>
        </Pressable>
        <Pressable onPress={() => setShowLockedModal(false)} className="mt-4 w-full items-center py-2">
          <Text className="font-medium text-dark/30">Plus tard</Text>
        </Pressable>
      </ModalOverlay>
    </View>
  );
};

export default ProfileCard;
