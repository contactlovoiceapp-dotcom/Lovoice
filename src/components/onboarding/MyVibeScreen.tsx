/* Profile setup and editing screen — used in onboarding and from the main app header (Expo / NativeWind / Reanimated). */

import React, { useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, ArrowRight, Pause, Play, Trash2 } from 'lucide-react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { COLORS, CTA_GRADIENT, ONBOARDING_GRADIENT } from '../../theme';
import { ColorTheme } from '../../types';

const PLACEHOLDER_TEXT = '#4b164c40';
const PRIMARY_MUTED = 'rgba(231, 36, 171, 0.6)';
const WAVE_CONTAINER_HEIGHT = 32;
const WAVE_BAR_WIDTH = 4;
const WAVE_BAR_COUNT = 40;

interface Props {
  onBack?: () => void;
  onSend?: () => void;
  onDeleteVibe?: () => void;
  hasRecordedVibe?: boolean;
  isOnboarding?: boolean;
}

const ENERGY_OPTIONS: {
  id: ColorTheme;
  label: string;
  colors: readonly [string, string];
}[] = [
  {
    id: ColorTheme.Solaire,
    label: 'Solaire',
    colors: ['#fbbf24', '#f97316'],
  },
  {
    id: ColorTheme.Posee,
    label: 'Posée',
    colors: ['#a78bfa', '#9333ea'],
  },
  {
    id: ColorTheme.Actif,
    label: 'Actif',
    colors: ['#ec4899', '#c026d3'],
  },
  {
    id: ColorTheme.Mystere,
    label: 'Mystère',
    colors: ['#9ca3af', '#374151'],
  },
];

function getEnergyGradient(theme: ColorTheme): readonly [string, string] {
  return (
    ENERGY_OPTIONS.find((e) => e.id === theme)?.colors ?? [
      '#fbbf24',
      '#f97316',
    ]
  );
}

function MiniWaveBar({
  isPlaying,
  containerHeight,
}: {
  isPlaying: boolean;
  containerHeight: number;
}) {
  const targetHigh = useMemo(() => 0.1 + Math.random() * 0.9, []);
  const targetLow = useMemo(() => 0.1 + Math.random() * 0.9, []);
  const durationA = useMemo(() => 400 + Math.random() * 400, []);
  const durationB = useMemo(() => 400 + Math.random() * 400, []);

  const heightFrac = useSharedValue(0.2);

  useEffect(() => {
    if (isPlaying) {
      heightFrac.value = withRepeat(
        withSequence(
          withTiming(targetHigh, { duration: durationA }),
          withTiming(targetLow, { duration: durationB }),
        ),
        -1,
        false,
      );
    } else {
      cancelAnimation(heightFrac);
      heightFrac.value = withTiming(0.2, { duration: 200 });
    }
  }, [isPlaying, targetHigh, targetLow, durationA, durationB]);

  const animatedStyle = useAnimatedStyle(() => ({
    height: heightFrac.value * containerHeight,
  }));

  return (
    <Animated.View
      style={[
        {
          width: WAVE_BAR_WIDTH,
          borderRadius: WAVE_BAR_WIDTH / 2,
          backgroundColor: PRIMARY_MUTED,
          opacity: isPlaying ? 0.8 : 0.3,
        },
        animatedStyle,
      ]}
    />
  );
}

const MyVibeScreen: React.FC<Props> = ({
  onBack,
  onSend,
  onDeleteVibe,
  hasRecordedVibe = true,
  isOnboarding = false,
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [energy, setEnergy] = useState<ColorTheme>(ColorTheme.Solaire);
  const [catchphrase, setCatchphrase] = useState('');
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [city, setCity] = useState('');
  const [emojis, setEmojis] = useState(['', '', '']);

  const { width: windowWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const contentMaxWidth = Math.min(448, windowWidth - 32);

  const handleEmojiChange = (index: number, value: string) => {
    const updated = [...emojis];
    updated[index] = value.substring(0, 2);
    setEmojis(updated);
  };

  const isFormValid =
    name.trim() !== '' && age.trim() !== '' && city.trim() !== '';

  const playColors = getEnergyGradient(energy);

  return (
    <LinearGradient
      colors={[...ONBOARDING_GRADIENT]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      className="flex-1"
    >
      <View
        pointerEvents="none"
        className="absolute -right-[33%] -top-[33%] h-[400px] w-[400px] rounded-full"
        style={{ backgroundColor: 'rgba(231, 36, 171, 0.1)' }}
      />

      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top : 0}
      >
        <SafeAreaView className="relative z-10 flex-1 px-4 py-6" edges={['top']}>
          <View className="mb-6 flex-row items-center justify-between">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Retour"
              onPress={onBack}
              className="rounded-full bg-dark/5 p-2"
            >
              <ArrowLeft size={22} color="rgba(75, 22, 76, 0.5)" />
            </Pressable>
            <Text className="text-xl font-bold text-dark">Ton Profil</Text>
            <View className="w-10" />
          </View>

          <View className="flex-1">
            <ScrollView
              className="flex-1"
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{
                gap: 24,
                paddingBottom: 140,
                paddingHorizontal: 4,
                maxWidth: contentMaxWidth,
                alignSelf: 'center',
                width: '100%',
              }}
            >
              {hasRecordedVibe && (
                <View className="rounded-2xl border border-dark/5 bg-white/70 p-5">
                  <View className="mb-4 flex-row items-start justify-between">
                    <View>
                      <Text className="font-bold text-dark">Ton vocal</Text>
                      <Text className="text-sm text-dark/30">À l&apos;instant</Text>
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Supprimer le vocal"
                      onPress={() => onDeleteVibe?.()}
                      className="p-2"
                    >
                      <Trash2 size={18} color="rgba(75, 22, 76, 0.2)" />
                    </Pressable>
                  </View>

                  <View className="mb-5 flex-row items-center gap-4">
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={
                        isPlaying ? 'Mettre en pause' : 'Lecture'
                      }
                      onPress={() => setIsPlaying((p) => !p)}
                      className="h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full shadow-lg shadow-primary/30"
                    >
                      <LinearGradient
                        colors={[...playColors]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={{
                          width: 48,
                          height: 48,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        {isPlaying ? (
                          <Pause
                            size={18}
                            color={COLORS.surface}
                            fill={COLORS.surface}
                          />
                        ) : (
                          <Play
                            size={18}
                            color={COLORS.surface}
                            fill={COLORS.surface}
                            style={{ marginLeft: 2 }}
                          />
                        )}
                      </LinearGradient>
                    </Pressable>

                    <View
                      className="flex-1 flex-row items-end overflow-hidden"
                      style={{ height: WAVE_CONTAINER_HEIGHT, gap: 2 }}
                    >
                      {Array.from({ length: WAVE_BAR_COUNT }, (_, i) => (
                        <MiniWaveBar
                          key={i}
                          isPlaying={isPlaying}
                          containerHeight={WAVE_CONTAINER_HEIGHT}
                        />
                      ))}
                    </View>

                    <Text
                      className="text-xs text-dark/25"
                      style={{
                        fontFamily:
                          Platform.OS === 'ios' ? 'Menlo' : 'monospace',
                      }}
                    >
                      0:01
                    </Text>
                  </View>

                  <View className="border-t border-dark/5 pt-4">
                    <Text className="mb-1 text-sm font-bold text-dark">
                      Titre de ta vibe{' '}
                      <Text className="text-xs font-normal text-dark/25">
                        (Facultatif)
                      </Text>
                    </Text>
                    <Text className="mb-3 text-xs text-dark/30">
                      Une phrase courte pour teaser ton vocal.
                    </Text>
                    <View className="relative">
                      <TextInput
                        value={catchphrase}
                        onChangeText={setCatchphrase}
                        placeholder="Ex: Ma pire honte en cuisine 🍳..."
                        placeholderTextColor={PLACEHOLDER_TEXT}
                        maxLength={60}
                        className="rounded-xl border border-dark/10 bg-white/80 py-3 pl-4 pr-12 text-sm text-dark"
                      />
                      <View
                        pointerEvents="none"
                        className="absolute bottom-0 right-4 top-0 justify-center"
                      >
                        <Text className="text-xs text-dark/15">
                          {catchphrase.length}/60
                        </Text>
                      </View>
                    </View>
                  </View>
                </View>
              )}

              <View>
                <Text className="mb-4 font-bold text-dark">Ton énergie</Text>
                <View className="flex-row justify-center gap-5">
                  {ENERGY_OPTIONS.map((opt) => {
                    const selected = energy === opt.id;
                    return (
                      <View key={opt.id} className="items-center gap-2">
                        <Pressable
                          accessibilityRole="button"
                          accessibilityState={{ selected }}
                          onPress={() => setEnergy(opt.id)}
                          style={{
                            transform: [{ scale: selected ? 1.1 : 1 }],
                            borderWidth: selected ? 2 : 0,
                            borderColor: COLORS.primary,
                            borderRadius: 9999,
                            overflow: 'hidden',
                            opacity: selected ? 1 : 0.5,
                          }}
                        >
                          <LinearGradient
                            colors={[...opt.colors]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={{
                              width: 56,
                              height: 56,
                            }}
                          />
                        </Pressable>
                        <Text
                          className={`text-xs font-medium ${
                            selected ? 'text-primary' : 'text-dark/30'
                          }`}
                        >
                          {opt.label}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </View>

              <View className="gap-4">
                <Text className="font-bold text-dark">Tes infos</Text>
                <View>
                  <Text className="mb-1.5 ml-1 text-sm font-medium text-dark/40">
                    Prénom
                  </Text>
                  <TextInput
                    value={name}
                    onChangeText={setName}
                    placeholder="Alex"
                    placeholderTextColor={PLACEHOLDER_TEXT}
                    className="rounded-xl border border-dark/10 bg-white/80 p-3 text-dark"
                  />
                </View>
                <View className="flex-row gap-4">
                  <View className="flex-1">
                    <Text className="mb-1.5 ml-1 text-sm font-medium text-dark/40">
                      Âge
                    </Text>
                    <TextInput
                      value={age}
                      onChangeText={setAge}
                      placeholder="28"
                      placeholderTextColor={PLACEHOLDER_TEXT}
                      keyboardType="number-pad"
                      className="rounded-xl border border-dark/10 bg-white/80 p-3 text-dark"
                    />
                  </View>
                  <View style={{ flex: 2 }}>
                    <Text className="mb-1.5 ml-1 text-sm font-medium text-dark/40">
                      Ville
                    </Text>
                    <TextInput
                      value={city}
                      onChangeText={setCity}
                      placeholder="Paris"
                      placeholderTextColor={PLACEHOLDER_TEXT}
                      className="rounded-xl border border-dark/10 bg-white/80 p-3 text-dark"
                    />
                  </View>
                </View>
              </View>

              <View>
                <Text className="mb-4 font-bold text-dark">
                  Tes 3 Emojis{' '}
                  <Text className="text-sm font-normal text-dark/25">
                    (Facultatif)
                  </Text>
                </Text>
                <View className="flex-row gap-4">
                  {[0, 1, 2].map((index) => (
                    <View
                      key={index}
                      className="relative h-14 w-14 items-center justify-center overflow-hidden rounded-full border border-dark/10 bg-white/80"
                    >
                      <TextInput
                        value={emojis[index]}
                        onChangeText={(t) => handleEmojiChange(index, t)}
                        placeholder="+"
                        placeholderTextColor="rgba(75, 22, 76, 0.15)"
                        maxLength={2}
                        className="absolute inset-0 h-full w-full bg-transparent text-center text-2xl text-dark"
                      />
                    </View>
                  ))}
                </View>
              </View>
            </ScrollView>
          </View>

          <View
            className="absolute bottom-0 left-0 right-0 z-20 px-4"
            style={{ paddingBottom: Math.max(insets.bottom, 16) }}
          >
            <LinearGradient
              colors={['transparent', 'rgba(248,245,255,0.9)', '#f8f5ff']}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={{ paddingHorizontal: 0, paddingTop: 24, paddingBottom: 8 }}
            >
              <Pressable
                accessibilityRole="button"
                disabled={!isFormValid}
                onPress={onSend}
                className={`w-full self-center overflow-hidden rounded-full shadow-lg shadow-primary/30 ${
                  isFormValid ? '' : 'opacity-20'
                }`}
                style={{ maxWidth: contentMaxWidth }}
              >
                <LinearGradient
                  colors={[...CTA_GRADIENT]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                >
                  <View className="flex-row items-center justify-center gap-2 py-4">
                    <Text className="font-bold text-white">
                      {isOnboarding ? 'Lancer ma Vibe' : 'Sauvegarder'}
                    </Text>
                    <ArrowRight size={20} color={COLORS.surface} />
                  </View>
                </LinearGradient>
              </Pressable>
            </LinearGradient>
          </View>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
};

export default MyVibeScreen;
