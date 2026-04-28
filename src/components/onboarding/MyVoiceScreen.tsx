/* Profile setup and editing screen — used in onboarding and from the main app header. */

import React, { useEffect, useMemo, useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Modal,
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
import { ArrowLeft, ArrowRight, ChevronDown, Pause, Play, Trash2 } from 'lucide-react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { COLORS, CTA_GRADIENT, FONT, ONBOARDING_GRADIENT, RADIUS, SHADOW, THEME_GRADIENTS } from '../../theme';
import { ColorTheme } from '../../types';
import { COPY } from '../../copy';

const WAVE_CONTAINER_HEIGHT = 32;
const WAVE_BAR_WIDTH = 4;
const WAVE_BAR_COUNT = 40;

interface Props {
  onBack?: () => void;
  onSend?: () => void;
  onDeleteVoice?: () => void;
  onDeleteProfile?: () => void;
  hasRecordedVoice?: boolean;
  isOnboarding?: boolean;
}

// Derived from THEME_GRADIENTS so swatch colors always stay in sync with the feed.
const MOOD_OPTIONS: {
  id: ColorTheme;
  label: string;
  colors: readonly [string, string];
}[] = [
  { id: ColorTheme.Sunset, label: COPY.moods.sunset, colors: [THEME_GRADIENTS.sunset.colors[0], THEME_GRADIENTS.sunset.colors[1]] },
  { id: ColorTheme.Chill, label: COPY.moods.chill, colors: [THEME_GRADIENTS.chill.colors[0], THEME_GRADIENTS.chill.colors[1]] },
  { id: ColorTheme.Electric, label: COPY.moods.electric, colors: [THEME_GRADIENTS.electric.colors[0], THEME_GRADIENTS.electric.colors[1]] },
  { id: ColorTheme.Midnight, label: COPY.moods.midnight, colors: [THEME_GRADIENTS.midnight.colors[0], THEME_GRADIENTS.midnight.colors[1]] },
];

const GENDER_OPTIONS = [
  { value: COPY.gender.female, label: COPY.gender.female },
  { value: COPY.gender.male, label: COPY.gender.male },
  { value: COPY.gender.other, label: COPY.gender.other },
] as const;

const INTEREST_OPTIONS = [
  { value: 'female', label: COPY.gender.interestedInFemale },
  { value: 'male', label: COPY.gender.interestedInMale },
  { value: 'other', label: COPY.gender.interestedInOther },
] as const;

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

const MyVoiceScreen: React.FC<Props> = ({
  onBack,
  onSend,
  onDeleteVoice,
  onDeleteProfile,
  hasRecordedVoice = true,
  isOnboarding = false,
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [mood, setMood] = useState<ColorTheme>(ColorTheme.Sunset);
  const [catchphrase, setCatchphrase] = useState('');
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [city, setCity] = useState('');
  const [emojis, setEmojis] = useState(['', '', '']);
  const [gender, setGender] = useState('');
  const [interestedIn, setInterestedIn] = useState<string[]>([]);
  const [showGenderPicker, setShowGenderPicker] = useState(false);
  const [showDeleteProfileModal, setShowDeleteProfileModal] = useState(false);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  const { width: windowWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const contentMaxWidth = Math.min(448, windowWidth - 32);

  const handleEmojiChange = (index: number, value: string) => {
    const updated = [...emojis];
    updated[index] = value.substring(0, 2);
    setEmojis(updated);
  };

  const toggleInterestedIn = (value: string) => {
    setInterestedIn((current) =>
      current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value],
    );
  };

  const isFormValid =
    name.trim() !== '' &&
    age.trim() !== '' &&
    city.trim() !== '' &&
    gender !== '' &&
    interestedIn.length > 0;

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardWillShow', () => {
      setIsKeyboardVisible(true);
    });
    const hideSub = Keyboard.addListener('keyboardWillHide', () => {
      setIsKeyboardVisible(false);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

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

          {hasRecordedVoice && (
            <View
              style={{
                width: '100%',
                maxWidth: contentMaxWidth,
                alignSelf: 'center',
                marginBottom: 20,
                borderRadius: RADIUS.lg,
                borderWidth: 1,
                borderColor: COLORS.border,
                borderLeftWidth: 3,
                borderLeftColor: activeMoodAccent,
                backgroundColor: COLORS.surfaceMuted,
                padding: 16,
                ...SHADOW.card,
              }}
            >
              <View style={{ marginBottom: 12, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
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
                  onPress={() => onDeleteVoice?.()}
                  style={{ padding: 8 }}
                >
                  <Trash2 size={18} color={COLORS.textTertiary} />
                </Pressable>
              </View>

              <View style={{ marginBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
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

              <Text
                numberOfLines={2}
                style={{
                  fontFamily: catchphrase.trim() ? FONT.semibold : FONT.regular,
                  fontSize: 13,
                  lineHeight: 18,
                  color: catchphrase.trim() ? COLORS.dark : COLORS.textTertiary,
                  fontStyle: catchphrase.trim() ? 'normal' : 'italic',
                }}
              >
                {catchphrase.trim() ? `“${catchphrase.trim()}”` : COPY.profile.catchphraseHint}
              </Text>
            </View>
          )}

          <View style={{ flex: 1 }}>
            <ScrollView
              style={{ flex: 1 }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{
                gap: 24,
                paddingBottom: 112,
                paddingHorizontal: 4,
                maxWidth: contentMaxWidth,
                alignSelf: 'center',
                width: '100%',
              }}
            >
              {hasRecordedVoice && (
                <View>
                  <Text style={{ fontFamily: FONT.bold, fontSize: 16, color: COLORS.dark, marginBottom: 4 }}>
                    {COPY.profile.catchphraseLabel}
                    <Text style={{ fontFamily: FONT.regular, fontSize: 14, color: COLORS.textTertiary }}>
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
                        lineHeight: 20,
                        fontFamily: FONT.regular,
                        letterSpacing: 0,
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
              )}

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
                <View>
                  <Text style={{ fontFamily: FONT.medium, fontSize: 13, color: COLORS.textSecondary, marginBottom: 6, marginLeft: 4 }}>
                    {COPY.gender.label}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setShowGenderPicker(true)}
                    style={{
                      borderRadius: RADIUS.md,
                      borderWidth: 1,
                      borderColor: COLORS.border,
                      backgroundColor: COLORS.surfaceMuted,
                      padding: 12,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: FONT.regular,
                        color: gender ? COLORS.dark : COLORS.textTertiary,
                      }}
                    >
                      {gender || COPY.gender.placeholder}
                    </Text>
                    <ChevronDown size={18} color={COLORS.textTertiary} />
                  </Pressable>
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

              <View style={{ gap: 16 }}>
                <Text style={{ fontFamily: FONT.bold, fontSize: 16, color: COLORS.dark }}>
                  {COPY.profile.preferencesLabel}
                </Text>
                <View>
                  <Text style={{ fontFamily: FONT.medium, fontSize: 13, color: COLORS.textSecondary, marginBottom: 6, marginLeft: 4 }}>
                    {COPY.gender.interestedInLabel}
                  </Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                    {INTEREST_OPTIONS.map((opt) => {
                      const selected = interestedIn.includes(opt.value);
                      return (
                        <Pressable
                          key={opt.value}
                          accessibilityRole="button"
                          accessibilityState={{ selected }}
                          onPress={() => toggleInterestedIn(opt.value)}
                          style={{
                            borderRadius: RADIUS.full,
                            borderWidth: 1,
                            borderColor: selected ? COLORS.primary : COLORS.border,
                            backgroundColor: selected ? COLORS.primaryMuted : COLORS.surfaceMuted,
                            paddingHorizontal: 16,
                            paddingVertical: 10,
                          }}
                        >
                          <Text
                            style={{
                              fontFamily: selected ? FONT.semibold : FONT.medium,
                              fontSize: 13,
                              color: selected ? COLORS.primary : COLORS.textSecondary,
                            }}
                          >
                            {opt.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  {interestedIn.length === 0 && (
                    <Text style={{ marginTop: 8, marginLeft: 4, fontFamily: FONT.regular, fontSize: 12, color: COLORS.textTertiary }}>
                      {COPY.gender.interestedInHint}
                    </Text>
                  )}
                </View>
              </View>

              <View>
                <Text style={{ fontFamily: FONT.bold, fontSize: 16, color: COLORS.dark, marginBottom: 16 }}>
                  {COPY.profile.moodLabel}
                </Text>
                <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
                  {MOOD_OPTIONS.map((opt) => {
                    const selected = mood === opt.id;
                    return (
                      <View key={opt.id} style={{ alignItems: 'center', gap: 8 }}>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityState={{ selected }}
                          onPress={() => setMood(opt.id)}
                          style={{
                            padding: 10,
                            borderRadius: RADIUS.full,
                            opacity: selected ? 1 : 0.45,
                          }}
                          hitSlop={4}
                        >
                          <LinearGradient
                            colors={[...opt.colors]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={{
                              width: 52,
                              height: 52,
                              borderRadius: RADIUS.full,
                              borderWidth: selected ? 2.5 : 0,
                              borderColor: COLORS.primary,
                            }}
                          />
                        </Pressable>
                        <Text
                          style={{
                            fontFamily: selected ? FONT.semibold : FONT.medium,
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

              {!isOnboarding && (
                <View
                  style={{
                    borderTopWidth: 1,
                    borderTopColor: COLORS.border,
                    paddingTop: 24,
                    gap: 12,
                  }}
                >
                  <Text style={{ fontFamily: FONT.bold, fontSize: 16, color: '#dc2626' }}>
                    {COPY.profile.dangerTitle}
                  </Text>
                  <Text style={{ fontFamily: FONT.regular, fontSize: 13, lineHeight: 19, color: COLORS.textSecondary }}>
                    {COPY.profile.dangerBody}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setShowDeleteProfileModal(true)}
                    style={{
                      alignSelf: 'flex-start',
                      borderRadius: RADIUS.full,
                      borderWidth: 1,
                      borderColor: 'rgba(220,38,38,0.28)',
                      backgroundColor: 'rgba(220,38,38,0.06)',
                      paddingHorizontal: 16,
                      paddingVertical: 10,
                    }}
                  >
                    <Text style={{ fontFamily: FONT.semibold, fontSize: 13, color: '#dc2626' }}>
                      {COPY.profile.dangerCta}
                    </Text>
                  </Pressable>
                </View>
              )}
            </ScrollView>
          </View>

          {!isKeyboardVisible && (
            <View
              style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                zIndex: 20,
                paddingHorizontal: 16,
                paddingBottom: Math.max(insets.bottom, 16) + 8,
              }}
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
            </View>
          )}
        </SafeAreaView>
      </KeyboardAvoidingView>

      <Modal
        visible={showGenderPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowGenderPicker(false)}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}
          onPress={() => setShowGenderPicker(false)}
        >
          <View
            onStartShouldSetResponder={() => true}
            style={{
              backgroundColor: COLORS.surface,
              borderTopLeftRadius: RADIUS.xl,
              borderTopRightRadius: RADIUS.xl,
              paddingTop: 24,
              paddingBottom: Math.max(insets.bottom, 24),
              paddingHorizontal: 24,
            }}
          >
            <Text style={{ fontFamily: FONT.bold, fontSize: 18, color: COLORS.dark, marginBottom: 20 }}>
              {COPY.gender.label}
            </Text>
            {GENDER_OPTIONS.map((opt) => (
              <Pressable
                key={opt.value}
                accessibilityRole="button"
                onPress={() => {
                  setGender(opt.value);
                  setShowGenderPicker(false);
                }}
                style={{
                  paddingVertical: 14,
                  borderBottomWidth: 1,
                  borderBottomColor: COLORS.border,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <Text
                  style={{
                    fontFamily: gender === opt.value ? FONT.bold : FONT.regular,
                    fontSize: 16,
                    color: gender === opt.value ? COLORS.primary : COLORS.dark,
                  }}
                >
                  {opt.label}
                </Text>
                {gender === opt.value && (
                  <View
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: 10,
                      backgroundColor: COLORS.primary,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text style={{ color: COLORS.surface, fontSize: 12, fontFamily: FONT.bold }}>✓</Text>
                  </View>
                )}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>

      <Modal
        visible={showDeleteProfileModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDeleteProfileModal(false)}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 24 }}
          onPress={() => setShowDeleteProfileModal(false)}
        >
          <View
            onStartShouldSetResponder={() => true}
            style={{
              width: '100%',
              maxWidth: contentMaxWidth,
              alignSelf: 'center',
              borderRadius: RADIUS.xl,
              backgroundColor: COLORS.surface,
              padding: 24,
              borderWidth: 1,
              borderColor: COLORS.border,
              ...SHADOW.card,
            }}
          >
            <View
              style={{
                width: 48,
                height: 48,
                borderRadius: 24,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'rgba(220,38,38,0.08)',
                marginBottom: 16,
              }}
            >
              <Trash2 size={22} color="#dc2626" />
            </View>
            <Text style={{ fontFamily: FONT.bold, fontSize: 20, color: COLORS.dark, marginBottom: 8 }}>
              {COPY.profile.deleteConfirmTitle}
            </Text>
            <Text style={{ fontFamily: FONT.regular, fontSize: 14, lineHeight: 20, color: COLORS.textSecondary, marginBottom: 24 }}>
              {COPY.profile.deleteConfirmBody}
            </Text>

            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setShowDeleteProfileModal(false);
                onDeleteProfile?.();
              }}
              style={{
                borderRadius: RADIUS.full,
                backgroundColor: '#dc2626',
                paddingVertical: 14,
                alignItems: 'center',
                marginBottom: 12,
              }}
            >
              <Text style={{ fontFamily: FONT.bold, color: COLORS.surface }}>
                {COPY.profile.deleteConfirmCta}
              </Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              onPress={() => setShowDeleteProfileModal(false)}
              style={{ borderRadius: RADIUS.full, paddingVertical: 12, alignItems: 'center' }}
            >
              <Text style={{ fontFamily: FONT.medium, color: COLORS.textTertiary }}>
                {COPY.common.cancel}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </LinearGradient>
  );
};

export default MyVoiceScreen;
