/* Profile setup and editing screen — used in onboarding and from the main app header. */

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
  { id: ColorTheme.Solaire, label: 'Solaire', colors: ['#fbbf24', '#f97316'] },
  { id: ColorTheme.Posee, label: 'Posée', colors: ['#a78bfa', '#9333ea'] },
  { id: ColorTheme.Actif, label: 'Actif', colors: ['#ec4899', '#c026d3'] },
  { id: ColorTheme.Mystere, label: 'Mystère', colors: ['#9ca3af', '#374151'] },
];

function getEnergyGradient(theme: ColorTheme): readonly [string, string] {
  return ENERGY_OPTIONS.find((e) => e.id === theme)?.colors ?? ['#fbbf24', '#f97316'];
}

/** Decorative animated waveform bar — invisible if animation fails. */
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
      style={{ flex: 1 }}
    >
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          right: '-33%',
          top: '-33%',
          width: 400,
          height: 400,
          borderRadius: 200,
          backgroundColor: 'rgba(231, 36, 171, 0.1)',
        }}
      />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top : 0}
      >
        <SafeAreaView style={{ position: 'relative', zIndex: 10, flex: 1, paddingHorizontal: 16, paddingVertical: 24 }} edges={['top']}>
          <View style={{ marginBottom: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Retour"
              onPress={onBack}
              style={{ borderRadius: 999, backgroundColor: 'rgba(75,22,76,0.05)', padding: 8 }}
            >
              <ArrowLeft size={22} color="rgba(75, 22, 76, 0.5)" />
            </Pressable>
            <Text className="text-xl font-bold text-dark">Ton Profil</Text>
            <View style={{ width: 40 }} />
          </View>

          <View style={{ flex: 1 }}>
            <ScrollView
              style={{ flex: 1 }}
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
                <View
                  style={{
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: 'rgba(75,22,76,0.05)',
                    backgroundColor: 'rgba(255,255,255,0.7)',
                    padding: 20,
                  }}
                >
                  <View style={{ marginBottom: 16, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                    <View>
                      <Text className="font-bold text-dark">Ton vocal</Text>
                      <Text className="text-sm text-dark/30">À l&apos;instant</Text>
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Supprimer le vocal"
                      onPress={() => onDeleteVibe?.()}
                      style={{ padding: 8 }}
                    >
                      <Trash2 size={18} color="rgba(75, 22, 76, 0.2)" />
                    </Pressable>
                  </View>

                  <View style={{ marginBottom: 20, flexDirection: 'row', alignItems: 'center', gap: 16 }}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={isPlaying ? 'Mettre en pause' : 'Lecture'}
                      onPress={() => setIsPlaying((p) => !p)}
                      style={{ width: 48, height: 48, flexShrink: 0, borderRadius: 24, overflow: 'hidden' }}
                    >
                      <LinearGradient
                        colors={[...playColors]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}
                      >
                        {isPlaying ? (
                          <Pause size={18} color={COLORS.surface} fill={COLORS.surface} />
                        ) : (
                          <Play size={18} color={COLORS.surface} fill={COLORS.surface} style={{ marginLeft: 2 }} />
                        )}
                      </LinearGradient>
                    </Pressable>

                    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'flex-end', overflow: 'hidden', height: WAVE_CONTAINER_HEIGHT, gap: 2 }}>
                      {Array.from({ length: WAVE_BAR_COUNT }, (_, i) => (
                        <MiniWaveBar key={i} isPlaying={isPlaying} containerHeight={WAVE_CONTAINER_HEIGHT} />
                      ))}
                    </View>

                    <Text
                      className="text-xs text-dark/25"
                      style={{ fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }}
                    >
                      0:01
                    </Text>
                  </View>

                  <View style={{ borderTopWidth: 1, borderTopColor: 'rgba(75,22,76,0.05)', paddingTop: 16 }}>
                    <Text className="mb-1 text-sm font-bold text-dark">
                      Titre de ta vibe{' '}
                      <Text className="text-xs font-normal text-dark/25">(Facultatif)</Text>
                    </Text>
                    <Text className="mb-3 text-xs text-dark/30">
                      Une phrase courte pour teaser ton vocal.
                    </Text>
                    <View style={{ position: 'relative' }}>
                      <TextInput
                        value={catchphrase}
                        onChangeText={setCatchphrase}
                        placeholder="Ex: Ma pire honte en cuisine 🍳..."
                        placeholderTextColor={PLACEHOLDER_TEXT}
                        maxLength={60}
                        style={{
                          borderRadius: 12,
                          borderWidth: 1,
                          borderColor: 'rgba(75,22,76,0.1)',
                          backgroundColor: 'rgba(255,255,255,0.8)',
                          paddingVertical: 12,
                          paddingLeft: 16,
                          paddingRight: 48,
                          fontSize: 14,
                          color: '#4b164c',
                        }}
                      />
                      <View
                        pointerEvents="none"
                        style={{ position: 'absolute', bottom: 0, right: 16, top: 0, justifyContent: 'center' }}
                      >
                        <Text className="text-xs text-dark/15">{catchphrase.length}/60</Text>
                      </View>
                    </View>
                  </View>
                </View>
              )}

              <View>
                <Text className="mb-4 font-bold text-dark">Ton énergie</Text>
                <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 20 }}>
                  {ENERGY_OPTIONS.map((opt) => {
                    const selected = energy === opt.id;
                    return (
                      <View key={opt.id} style={{ alignItems: 'center', gap: 8 }}>
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
                            style={{ width: 56, height: 56 }}
                          />
                        </Pressable>
                        <Text
                          className={`text-xs font-medium ${selected ? 'text-primary' : 'text-dark/30'}`}
                        >
                          {opt.label}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </View>

              <View style={{ gap: 16 }}>
                <Text className="font-bold text-dark">Tes infos</Text>
                <View>
                  <Text className="mb-1.5 ml-1 text-sm font-medium text-dark/40">Prénom</Text>
                  <TextInput
                    value={name}
                    onChangeText={setName}
                    placeholder="Alex"
                    placeholderTextColor={PLACEHOLDER_TEXT}
                    style={{
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: 'rgba(75,22,76,0.1)',
                      backgroundColor: 'rgba(255,255,255,0.8)',
                      padding: 12,
                      color: '#4b164c',
                    }}
                  />
                </View>
                <View style={{ flexDirection: 'row', gap: 16 }}>
                  <View style={{ flex: 1 }}>
                    <Text className="mb-1.5 ml-1 text-sm font-medium text-dark/40">Âge</Text>
                    <TextInput
                      value={age}
                      onChangeText={setAge}
                      placeholder="28"
                      placeholderTextColor={PLACEHOLDER_TEXT}
                      keyboardType="number-pad"
                      style={{
                        borderRadius: 12,
                        borderWidth: 1,
                        borderColor: 'rgba(75,22,76,0.1)',
                        backgroundColor: 'rgba(255,255,255,0.8)',
                        padding: 12,
                        color: '#4b164c',
                      }}
                    />
                  </View>
                  <View style={{ flex: 2 }}>
                    <Text className="mb-1.5 ml-1 text-sm font-medium text-dark/40">Ville</Text>
                    <TextInput
                      value={city}
                      onChangeText={setCity}
                      placeholder="Paris"
                      placeholderTextColor={PLACEHOLDER_TEXT}
                      style={{
                        borderRadius: 12,
                        borderWidth: 1,
                        borderColor: 'rgba(75,22,76,0.1)',
                        backgroundColor: 'rgba(255,255,255,0.8)',
                        padding: 12,
                        color: '#4b164c',
                      }}
                    />
                  </View>
                </View>
              </View>

              <View>
                <Text className="mb-4 font-bold text-dark">
                  Tes 3 Emojis{' '}
                  <Text className="text-sm font-normal text-dark/25">(Facultatif)</Text>
                </Text>
                <View style={{ flexDirection: 'row', gap: 16 }}>
                  {[0, 1, 2].map((index) => (
                    <View
                      key={index}
                      style={{
                        position: 'relative',
                        width: 56,
                        height: 56,
                        alignItems: 'center',
                        justifyContent: 'center',
                        overflow: 'hidden',
                        borderRadius: 28,
                        borderWidth: 1,
                        borderColor: 'rgba(75,22,76,0.1)',
                        backgroundColor: 'rgba(255,255,255,0.8)',
                      }}
                    >
                      <TextInput
                        value={emojis[index]}
                        onChangeText={(t) => handleEmojiChange(index, t)}
                        placeholder="+"
                        placeholderTextColor="rgba(75, 22, 76, 0.15)"
                        maxLength={2}
                        style={{
                          position: 'absolute',
                          inset: 0,
                          width: '100%',
                          height: '100%',
                          backgroundColor: 'transparent',
                          textAlign: 'center',
                          fontSize: 24,
                          color: '#4b164c',
                        }}
                      />
                    </View>
                  ))}
                </View>
              </View>
            </ScrollView>
          </View>

          <View
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              zIndex: 20,
              paddingHorizontal: 16,
              paddingBottom: Math.max(insets.bottom, 16),
            }}
          >
            <LinearGradient
              colors={['transparent', 'rgba(248,245,255,0.9)', '#f8f5ff']}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={{ paddingTop: 24, paddingBottom: 8 }}
            >
              <Pressable
                accessibilityRole="button"
                disabled={!isFormValid}
                onPress={onSend}
                style={{
                  width: '100%',
                  alignSelf: 'center',
                  borderRadius: 999,
                  overflow: 'hidden',
                  maxWidth: contentMaxWidth,
                  opacity: isFormValid ? 1 : 0.2,
                }}
              >
                <LinearGradient
                  colors={[...CTA_GRADIENT]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16 }}>
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
