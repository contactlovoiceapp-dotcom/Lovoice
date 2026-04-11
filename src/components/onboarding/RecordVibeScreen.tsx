/* Voice recording screen — the key onboarding moment where users create their Vibe (Expo / NativeWind / Reanimated). */

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
  withSpring,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowRight, Lightbulb, Mic, Square } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, CTA_GRADIENT, ONBOARDING_GRADIENT } from '../../theme';
import ModalOverlay from '../ui/ModalOverlay';

const INSPIRATION_QUESTIONS = [
  'Dis-moi ton talent le plus inutile mais incroyable...',
  'Quel est ton plus gros plaisir coupable ?',
  'Raconte-moi ta pire honte en cuisine...',
  'Si tu devais manger un seul plat pour le reste de ta vie ?',
  'Quel est le dernier film qui t\'a fait pleurer ?',
];

const MIC_SIZE = 128;
const GLOW_SIZE = 500;
const REACTIVE_GLOW = 'rgba(231, 36, 171, 0.2)';

interface Props {
  onNext: () => void;
  onSkip: () => void;
}

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
    <View className="pointer-events-none absolute inset-0 items-center justify-center overflow-hidden">
      <Animated.View
        style={[
          {
            width: GLOW_SIZE,
            height: GLOW_SIZE,
            borderRadius: GLOW_SIZE / 2,
            backgroundColor: REACTIVE_GLOW,
          },
          animatedStyle,
        ]}
      />
    </View>
  );
}

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

const RecordVibeScreen: React.FC<Props> = ({ onNext, onSkip }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [time, setTime] = useState(0);
  const [hasRecorded, setHasRecorded] = useState(false);
  const [showInspiration, setShowInspiration] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const { width: windowWidth } = useWindowDimensions();
  const contentMaxWidth = Math.min(384, windowWidth - 48);

  const micScale = useSharedValue(0);
  const headerOpacity = useSharedValue(0);
  const headerY = useSharedValue(-20);
  const subtitleOpacity = useSharedValue(0);
  const timerOpacity = useSharedValue(0);
  const recommencerOpacity = useSharedValue(0);
  const inspirationCtaOpacity = useSharedValue(0);

  useEffect(() => {
    micScale.value = withSpring(1, { damping: 15, stiffness: 200 });
    headerOpacity.value = withTiming(1, { duration: 400 });
    headerY.value = withTiming(0, { duration: 400 });
    subtitleOpacity.value = withDelay(100, withTiming(1, { duration: 400 }));
  }, []);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isRecording) {
      interval = setInterval(() => {
        setTime((prev) => {
          if (prev >= 90) {
            setIsRecording(false);
            setHasRecorded(true);
            return 90;
          }
          return prev + 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isRecording]);

  useEffect(() => {
    timerOpacity.value = withTiming(isRecording || hasRecorded ? 1 : 0, { duration: 200 });
  }, [isRecording, hasRecorded]);

  useEffect(() => {
    recommencerOpacity.value = withTiming(hasRecorded && !isRecording ? 1 : 0, { duration: 200 });
  }, [hasRecorded, isRecording]);

  useEffect(() => {
    inspirationCtaOpacity.value = withTiming(!hasRecorded ? 1 : 0, { duration: 200 });
  }, [hasRecorded]);

  const toggleRecording = () => {
    if (isRecording) {
      setIsRecording(false);
      setHasRecorded(true);
    } else {
      setTime(0);
      setIsRecording(true);
      setHasRecorded(false);
    }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const micContainerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: micScale.value }],
  }));

  const recordingMicStyle = useAnimatedStyle(() => ({
    transform: [{ scale: withTiming(isRecording ? 1.1 : 1, { duration: 200 }) }],
  }));

  const headerStyle = useAnimatedStyle(() => ({
    opacity: headerOpacity.value,
    transform: [{ translateY: headerY.value }],
  }));

  const subtitleStyle = useAnimatedStyle(() => ({
    opacity: subtitleOpacity.value,
  }));

  const timerStyle = useAnimatedStyle(() => ({
    opacity: timerOpacity.value,
  }));

  const recommencerStyle = useAnimatedStyle(() => ({
    opacity: recommencerOpacity.value,
  }));

  const inspirationCtaStyle = useAnimatedStyle(() => ({
    opacity: inspirationCtaOpacity.value,
  }));

  return (
    <LinearGradient
      colors={[...ONBOARDING_GRADIENT]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      className="flex-1"
    >
      <ReactiveGlow isRecording={isRecording} />

      <SafeAreaView className="relative z-10 flex-1" edges={['top', 'bottom']}>
        <View className="flex-1 flex-col justify-between px-6 py-8">
          <View
            className="w-full self-center pt-4"
            style={{ maxWidth: contentMaxWidth }}
          >
            <Animated.View style={headerStyle}>
              <Text className="mb-2 text-center text-3xl font-bold text-dark">
                Ta{' '}
                <Text className="font-serif italic text-primary">Vibe</Text>
              </Text>
            </Animated.View>
            <Animated.Text
              style={subtitleStyle}
              className="text-center font-medium text-dark/40"
            >
              Zéro pression. Juste ta voix.
            </Animated.Text>
          </View>

          <View className="flex-col items-center">
            <Animated.View
              style={[micContainerStyle, { position: 'relative', alignItems: 'center', justifyContent: 'center', width: 220, height: 220 }]}
            >
              {isRecording && (
                <>
                  <PingRing
                    delayMs={0}
                    diameter={MIC_SIZE + 32}
                    fillColor="rgba(231, 36, 171, 0.25)"
                  />
                  <PingRing
                    delayMs={500}
                    diameter={MIC_SIZE + 64}
                    fillColor="rgba(231, 36, 171, 0.1)"
                  />
                </>
              )}
              <Animated.View className="absolute" style={recordingMicStyle}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={isRecording ? 'Arrêter l\'enregistrement' : 'Enregistrer'}
                  onPress={toggleRecording}
                  className="h-32 w-32 overflow-hidden rounded-full shadow-2xl shadow-primary/30"
                  style={{ opacity: isRecording ? 0.9 : 1 }}
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
                    ) : (
                      <Mic size={44} color={COLORS.surface} />
                    )}
                  </LinearGradient>
                </Pressable>
              </Animated.View>
            </Animated.View>

            <View className="mt-6 h-16 flex-col items-center justify-start">
              <Animated.View style={timerStyle}>
                <Text
                  className="text-3xl font-semibold tracking-tight text-dark"
                  style={{ fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }}
                >
                  {formatTime(time)}{' '}
                  <Text className="text-lg text-dark/25">/ 1:30</Text>
                </Text>
              </Animated.View>

              <Animated.View style={recommencerStyle}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    setHasRecorded(false);
                    setTime(0);
                  }}
                  className="mt-2"
                >
                  <Text
                    className="text-sm font-medium text-dark/30"
                    style={{ textDecorationLine: 'underline' }}
                  >
                    Recommencer
                  </Text>
                </Pressable>
              </Animated.View>
            </View>
          </View>

          <View
            className="w-full self-center gap-3"
            style={{ maxWidth: contentMaxWidth }}
          >
            <View className="rounded-2xl border border-dark/5 bg-white/70 p-4">
              <Text className="text-sm leading-relaxed text-dark/45">
                {hasRecorded
                  ? 'Vibe enregistrée ! 🎤'
                  : 'Une intro, une pensée, un délire... Parle librement. (1m30 max)'}
              </Text>

              <Animated.View style={[inspirationCtaStyle, { marginTop: 12 }]}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setShowInspiration(true)}
                  className="w-full flex-row items-center justify-center gap-2 rounded-xl bg-dark/5 py-2.5"
                >
                  <Lightbulb size={16} color="#f59e0b" />
                  <Text className="text-sm font-medium text-dark/50">
                    Besoin d'inspiration ?
                  </Text>
                </Pressable>
              </Animated.View>
            </View>

            <Pressable
              accessibilityRole="button"
              disabled={!hasRecorded}
              onPress={onNext}
              className={`w-full overflow-hidden rounded-full shadow-lg shadow-primary/30 ${
                hasRecorded ? '' : 'opacity-20'
              }`}
            >
              <LinearGradient
                colors={[...CTA_GRADIENT]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <View className="flex-row items-center justify-center gap-2 py-4">
                  <Text className="font-bold text-white">Continuer</Text>
                  <ArrowRight size={20} color={COLORS.surface} />
                </View>
              </LinearGradient>
            </Pressable>

            {!hasRecorded && (
              <Pressable
                accessibilityRole="button"
                onPress={onSkip}
                className="w-full py-2"
              >
                <Text className="text-center text-sm font-medium text-dark/25">
                  Passer pour l'instant
                </Text>
              </Pressable>
            )}
          </View>
        </View>
      </SafeAreaView>

      <ModalOverlay visible={showInspiration} onClose={() => setShowInspiration(false)}>
        <View className="mb-6 h-12 w-12 items-center justify-center rounded-full bg-amber-500/10">
          <Lightbulb size={24} color="#f59e0b" />
        </View>

        <Text className="mb-4 text-xl font-bold text-dark">Idée de vibe</Text>
        <Text
          className="mb-8 font-serif text-lg font-medium italic text-dark/50"
          style={{ minHeight: 80 }}
        >
          {`\u201C${INSPIRATION_QUESTIONS[currentQuestion]}\u201D`}
        </Text>

        <Pressable
          accessibilityRole="button"
          onPress={() =>
            setCurrentQuestion((prev) => (prev + 1) % INSPIRATION_QUESTIONS.length)
          }
          className="w-full rounded-full border border-dark/5 bg-dark/5 py-3"
        >
          <Text className="text-center font-bold text-dark/60">Une autre idée</Text>
        </Pressable>
      </ModalOverlay>
    </LinearGradient>
  );
};

export default RecordVibeScreen;
