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
import { COLORS, CTA_GRADIENT, FONT, ONBOARDING_GRADIENT, RADIUS, SHADOW } from '../../theme';
import { ColorTheme } from '../../types';
import { COPY } from '../../copy';

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

const MOOD_OPTIONS: {
  id: ColorTheme;
  label: string;
  colors: readonly [string, string];
  emoji: string;
}[] = [
  { id: ColorTheme.Sunset, label: 'Sunset', colors: ['#FF8A3D', '#FF6B35'], emoji: '🌅' },
  { id: ColorTheme.Chill, label: 'Chill', colors: ['#667EEA', '#764BA2'], emoji: '🎧' },
  { id: ColorTheme.Electric, label: 'Electric', colors: ['#F5515F', '#C9302C'], emoji: '⚡' },
  { id: ColorTheme.Dream, label: 'Dream', colors: ['#89CFF0', '#B8A9E8'], emoji: '✨' },
  { id: ColorTheme.Midnight, label: 'Midnight', colors: ['#302B63', '#24243E'], emoji: '🌙' },
];

function getMoodGradient(theme: ColorTheme): readonly [string, string] {
  return MOOD_OPTIONS.find((m) => m.id === theme)?.colors ?? ['#FF8A3D', '#FF6B35'];
}

/** Decorative animated waveform bar — invisible if animation fails. */
function MiniWaveBar({
  isPlaying,
  containerHeight,
  barColor,
}: {
  isPlaying: boolean;
  containerHeight: number;
  barColor: string;
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
          backgroundColor: barColor,
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
  const [mood, setMood] = useState<ColorTheme>(ColorTheme.Sunset);
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

  const playColors = getMoodGradient(mood);
  const activeMoodAccent = playColors[0];

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
          backgroundColor: COLORS.primaryMuted,
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
              accessibilityLabel={COPY.common.back}
              onPress={onBack}
              style={{ borderRadius: RADIUS.full, backgroundColor: COLORS.border, padding: 8 }}
            >
              <ArrowLeft size={22} color={COLORS.textSecondary} />
            </Pressable>
            <Text style={{ fontFamily: FONT.bold, fontSize: 20, color: COLORS.dark }}>
              {COPY.profile.title}
            </Text>
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
                    borderRadius: RADIUS.lg,
                    borderWidth: 1,
                    borderColor: COLORS.border,
                    borderLeftWidth: 3,
                    borderLeftColor: activeMoodAccent,
                    backgroundColor: COLORS.surfaceMuted,
                    padding: 20,
                    ...SHADOW.card,
                  }}
                >
                  <View style={{ marginBottom: 16, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                    <View>
                      <Text style={{ fontFamily: FONT.bold, fontSize: 16, color: COLORS.dark }}>
                        {COPY.profile.voiceCard}
                      </Text>
                      <Text style={{ fontFamily: FONT.regular, fontSize: 12, color: COLORS.textTertiary }}>
                        {COPY.profile.voiceTimestamp}
                      </Text>
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={COPY.a11y.deleteVoice}
                      onPress={() => onDeleteVibe?.()}
                      style={{ padding: 8 }}
                    >
                      <Trash2 size={18} color={COLORS.textTertiary} />
                    </Pressable>
                  </View>

                  <View style={{ marginBottom: 20, flexDirection: 'row', alignItems: 'center', gap: 16 }}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={isPlaying ? COPY.a11y.pause : COPY.a11y.play}
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
                        <MiniWaveBar
                          key={i}
                          isPlaying={isPlaying}
                          containerHeight={WAVE_CONTAINER_HEIGHT}
                          barColor={activeMoodAccent}
                        />
                      ))}
                    </View>

                    <Text
                      style={{
                        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
                        fontSize: 12,
                        color: COLORS.textTertiary,
                      }}
                    >
                      0:01
                    </Text>
                  </View>

                  <View style={{ borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: 16 }}>
                    <Text style={{ fontFamily: FONT.bold, fontSize: 14, color: COLORS.dark, marginBottom: 4 }}>
                      {COPY.profile.catchphraseLabel}
                      <Text style={{ fontFamily: FONT.regular, fontSize: 12, color: COLORS.textTertiary }}>
                        {COPY.common.optional}
                      </Text>
                    </Text>
                    <Text style={{ fontFamily: FONT.regular, fontSize: 12, color: COLORS.textTertiary, marginBottom: 12 }}>
                      {COPY.profile.catchphraseHint}
                    </Text>
                    <View style={{ position: 'relative' }}>
                      <TextInput
                        value={catchphrase}
                        onChangeText={setCatchphrase}
                        placeholder={COPY.profile.catchphrasePlaceholder}
                        placeholderTextColor={COLORS.textTertiary}
                        maxLength={60}
                        style={{
                          borderRadius: RADIUS.md,
                          borderWidth: 1,
                          borderColor: COLORS.border,
                          backgroundColor: COLORS.surfaceMuted,
                          paddingVertical: 12,
                          paddingLeft: 16,
                          paddingRight: 48,
                          fontSize: 14,
                          fontFamily: FONT.regular,
                          color: COLORS.dark,
                        }}
                      />
                      <View
                        pointerEvents="none"
                        style={{ position: 'absolute', bottom: 0, right: 16, top: 0, justifyContent: 'center' }}
                      >
                        <Text style={{ fontFamily: FONT.regular, fontSize: 12, color: COLORS.textTertiary }}>
                          {catchphrase.length}/60
                        </Text>
                      </View>
                    </View>
                  </View>
                </View>
              )}

              <View>
                <Text style={{ fontFamily: FONT.bold, fontSize: 16, color: COLORS.dark, marginBottom: 16 }}>
                  {COPY.profile.moodLabel}
                </Text>
                <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 16 }}>
                  {MOOD_OPTIONS.map((opt) => {
                    const selected = mood === opt.id;
                    return (
                      <View key={opt.id} style={{ alignItems: 'center', gap: 6 }}>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityState={{ selected }}
                          onPress={() => setMood(opt.id)}
                          style={{
                            transform: [{ scale: selected ? 1.15 : 1 }],
                            borderWidth: selected ? 2.5 : 0,
                            borderColor: COLORS.primary,
                            borderRadius: RADIUS.full,
                            overflow: 'hidden',
                            opacity: selected ? 1 : 0.45,
                          }}
                        >
                          <LinearGradient
                            colors={[...opt.colors]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={{ width: 52, height: 52, alignItems: 'center', justifyContent: 'center' }}
                          >
                            <Text style={{ fontSize: 22 }}>{opt.emoji}</Text>
                          </LinearGradient>
                        </Pressable>
                        <Text
                          style={{
                            fontFamily: FONT.medium,
                            fontSize: 11,
                            color: selected ? COLORS.primary : COLORS.textTertiary,
                          }}
                        >
                          {opt.label}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </View>

              <View style={{ gap: 16 }}>
                <Text style={{ fontFamily: FONT.bold, fontSize: 16, color: COLORS.dark }}>
                  {COPY.profile.infoLabel}
                </Text>
                <View>
                  <Text style={{ fontFamily: FONT.medium, fontSize: 13, color: COLORS.textSecondary, marginBottom: 6, marginLeft: 4 }}>
                    {COPY.profile.nameLabel}
                  </Text>
                  <TextInput
                    value={name}
                    onChangeText={setName}
                    placeholder={COPY.profile.namePlaceholder}
                    placeholderTextColor={COLORS.textTertiary}
                    style={{
                      borderRadius: RADIUS.md,
                      borderWidth: 1,
                      borderColor: COLORS.border,
                      backgroundColor: COLORS.surfaceMuted,
                      padding: 12,
                      fontFamily: FONT.regular,
                      letterSpacing: 0,
                      color: COLORS.dark,
                    }}
                  />
                </View>
                <View style={{ flexDirection: 'row', gap: 16 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: FONT.medium, fontSize: 13, color: COLORS.textSecondary, marginBottom: 6, marginLeft: 4 }}>
                      {COPY.profile.ageLabel}
                    </Text>
                    <TextInput
                      value={age}
                      onChangeText={setAge}
                      placeholder={COPY.profile.agePlaceholder}
                      placeholderTextColor={COLORS.textTertiary}
                      keyboardType="number-pad"
                      style={{
                        borderRadius: RADIUS.md,
                        borderWidth: 1,
                        borderColor: COLORS.border,
                        backgroundColor: COLORS.surfaceMuted,
                        padding: 12,
                        fontFamily: FONT.regular,
                        letterSpacing: 0,
                        color: COLORS.dark,
                      }}
                    />
                  </View>
                  <View style={{ flex: 2 }}>
                    <Text style={{ fontFamily: FONT.medium, fontSize: 13, color: COLORS.textSecondary, marginBottom: 6, marginLeft: 4 }}>
                      {COPY.profile.cityLabel}
                    </Text>
                    <TextInput
                      value={city}
                      onChangeText={setCity}
                      placeholder={COPY.profile.cityPlaceholder}
                      placeholderTextColor={COLORS.textTertiary}
                      style={{
                        borderRadius: RADIUS.md,
                        borderWidth: 1,
                        borderColor: COLORS.border,
                        backgroundColor: COLORS.surfaceMuted,
                        padding: 12,
                        fontFamily: FONT.regular,
                        letterSpacing: 0,
                        color: COLORS.dark,
                      }}
                    />
                  </View>
                </View>
              </View>

              <View>
                <Text style={{ fontFamily: FONT.bold, fontSize: 16, color: COLORS.dark, marginBottom: 16 }}>
                  {COPY.profile.emojisLabel}
                  <Text style={{ fontFamily: FONT.regular, fontSize: 14, color: COLORS.textTertiary }}>
                    {COPY.common.optional}
                  </Text>
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
                        borderRadius: RADIUS.xl,
                        borderWidth: 1,
                        borderColor: COLORS.border,
                        backgroundColor: COLORS.surfaceMuted,
                      }}
                    >
                      <TextInput
                        value={emojis[index]}
                        onChangeText={(t) => handleEmojiChange(index, t)}
                        placeholder="+"
                        placeholderTextColor={COLORS.textTertiary}
                        maxLength={2}
                        style={{
                          position: 'absolute',
                          inset: 0,
                          width: '100%',
                          height: '100%',
                          backgroundColor: 'transparent',
                          textAlign: 'center',
                          fontSize: 24,
                          letterSpacing: 0,
                          color: COLORS.dark,
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
              colors={['transparent', 'rgba(255,249,245,0.9)', COLORS.background]}
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
                  borderRadius: RADIUS.full,
                  overflow: 'hidden',
                  maxWidth: contentMaxWidth,
                  opacity: isFormValid ? 1 : 0.2,
                  ...SHADOW.button,
                }}
              >
                <LinearGradient
                  colors={[...CTA_GRADIENT]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16 }}>
                    <Text style={{ fontFamily: FONT.bold, color: COLORS.surface }}>
                      {isOnboarding ? COPY.profile.submitOnboarding : COPY.common.save}
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
