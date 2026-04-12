/* Voice recording screen — the key onboarding moment where users create their Vibe. */

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
import { ArrowRight, Lightbulb, Mic, Square, X } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, CTA_GRADIENT, ONBOARDING_GRADIENT } from '../../theme';

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
            backgroundColor: REACTIVE_GLOW,
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

const RecordVibeScreen: React.FC<Props> = ({ onNext, onSkip }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [time, setTime] = useState(0);
  const [hasRecorded, setHasRecorded] = useState(false);
  const [showInspiration, setShowInspiration] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const { width: windowWidth } = useWindowDimensions();
  const contentMaxWidth = Math.min(384, windowWidth - 48);

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
            <Text className="mb-2 text-center text-3xl font-bold text-dark">
              Ta{' '}
              <Text className="font-serif italic text-primary">Vibe</Text>
            </Text>
            <Text className="text-center font-medium text-dark/40">
              Zéro pression. Juste ta voix.
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
                    fillColor="rgba(231, 36, 171, 0.25)"
                  />
                  <PingRing
                    delayMs={500}
                    diameter={MIC_SIZE + 64}
                    fillColor="rgba(231, 36, 171, 0.1)"
                  />
                </>
              )}
              <View style={{ position: 'absolute' }}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={isRecording ? 'Arrêter l\'enregistrement' : 'Enregistrer'}
                  onPress={toggleRecording}
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
                    ) : (
                      <Mic size={44} color={COLORS.surface} />
                    )}
                  </LinearGradient>
                </Pressable>
              </View>
            </View>

            <View style={{ marginTop: 24, height: 64, flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start' }}>
              {(isRecording || hasRecorded) && (
                <Text
                  className="text-3xl font-semibold tracking-tight text-dark"
                  style={{ fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }}
                >
                  {formatTime(time)}{' '}
                  <Text className="text-lg text-dark/25">/ 1:30</Text>
                </Text>
              )}

              {hasRecorded && !isRecording && (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    setHasRecorded(false);
                    setTime(0);
                  }}
                  style={{ marginTop: 8 }}
                >
                  <Text
                    className="text-sm font-medium text-dark/30"
                    style={{ textDecorationLine: 'underline' }}
                  >
                    Recommencer
                  </Text>
                </Pressable>
              )}
            </View>
          </View>

          {/* Bottom */}
          <View style={{ width: '100%', alignSelf: 'center', gap: 12, maxWidth: contentMaxWidth }}>
            <View
              style={{
                borderRadius: 16,
                borderWidth: 1,
                borderColor: 'rgba(75,22,76,0.05)',
                backgroundColor: 'rgba(255,255,255,0.7)',
                padding: 16,
              }}
            >
              <Text className="text-sm leading-relaxed text-dark/45">
                {hasRecorded
                  ? 'Vibe enregistrée ! 🎤'
                  : 'Une intro, une pensée, un délire... Parle librement. (1m30 max)'}
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
                    borderRadius: 12,
                    backgroundColor: 'rgba(75,22,76,0.05)',
                    paddingVertical: 10,
                  }}
                >
                  <Lightbulb size={16} color="#f59e0b" />
                  <Text className="text-sm font-medium text-dark/50">
                    Besoin d'inspiration ?
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
                borderRadius: 999,
                overflow: 'hidden',
                opacity: hasRecorded ? 1 : 0.2,
              }}
            >
              <LinearGradient
                colors={[...CTA_GRADIENT]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16 }}>
                  <Text className="font-bold text-white">Continuer</Text>
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
                <Text className="text-center text-sm font-medium text-dark/25">
                  Passer pour l'instant
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
            backgroundColor: 'rgba(75, 22, 76, 0.4)',
          }}
        >
          <View
            style={{
              position: 'relative',
              width: '100%',
              maxWidth: contentMaxWidth,
              backgroundColor: 'white',
              borderRadius: 24,
              borderWidth: 1,
              borderColor: 'rgba(75,22,76,0.05)',
              padding: 32,
            }}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Fermer"
              onPress={() => setShowInspiration(false)}
              style={{ position: 'absolute', right: 16, top: 16, padding: 8 }}
            >
              <X size={22} color="rgba(75, 22, 76, 0.3)" />
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
              style={{
                width: '100%',
                borderRadius: 999,
                borderWidth: 1,
                borderColor: 'rgba(75,22,76,0.05)',
                backgroundColor: 'rgba(75,22,76,0.05)',
                paddingVertical: 12,
              }}
            >
              <Text className="text-center font-bold text-dark/60">Une autre idée</Text>
            </Pressable>
          </View>
        </View>
      )}
    </LinearGradient>
  );
};

export default RecordVibeScreen;
