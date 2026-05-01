/* Profile tab — view the authenticated user's identity and edit preferences, city, mood, and emojis. */

import React, { useCallback, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { LogOut, Pause, Play, Plus, RefreshCw, X } from 'lucide-react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { COPY } from '../../src/copy';
import { COLORS, CTA_GRADIENT, FONT, ONBOARDING_GRADIENT, RADIUS, SHADOW, THEME_GRADIENTS } from '../../src/theme';
import { ColorTheme } from '../../src/types';
import { useAuth } from '../../src/features/auth/hooks/useAuth';
import { useFeedState } from '../../src/features/feed/hooks/useFeedState';
import { searchCities, type CitySearchResult } from '../../src/features/profile/api/citySearch';
import { useUpsertProfile } from '../../src/features/profile/api/profileMutations';
import {
  OnboardingTextInput,
  SelectableOption,
} from '../../src/features/profile/components/ProfileOnboardingStep';
import { isoBirthdateToFrench } from '../../src/features/profile/helpers/birthdateInput';
import {
  validateLookingFor,
  type GenderValue,
} from '../../src/features/profile/helpers/validation';

type EditError = keyof typeof COPY.profile.editErrors;

const PROFILE_GENDERS: GenderValue[] = ['male', 'female', 'other'];

const MOOD_OPTIONS: {
  id: ColorTheme;
  label: string;
  colors: readonly [string, string];
  ctaBorderColor: string;
}[] = [
  {
    id: ColorTheme.Sunset,
    label: COPY.moods.sunset,
    colors: [THEME_GRADIENTS.sunset.colors[0], THEME_GRADIENTS.sunset.colors[1]],
    ctaBorderColor: THEME_GRADIENTS.sunset.ctaGradient[0],
  },
  {
    id: ColorTheme.Chill,
    label: COPY.moods.chill,
    colors: [THEME_GRADIENTS.chill.colors[0], THEME_GRADIENTS.chill.colors[1]],
    ctaBorderColor: THEME_GRADIENTS.chill.ctaGradient[0],
  },
  {
    id: ColorTheme.Electric,
    label: COPY.moods.electric,
    colors: [THEME_GRADIENTS.electric.colors[0], THEME_GRADIENTS.electric.colors[1]],
    ctaBorderColor: THEME_GRADIENTS.electric.ctaGradient[0],
  },
  {
    id: ColorTheme.Midnight,
    label: COPY.moods.midnight,
    colors: [THEME_GRADIENTS.midnight.colors[0], THEME_GRADIENTS.midnight.colors[1]],
    // Magenta CTA so the selection ring is visible against the dark grey circle.
    ctaBorderColor: THEME_GRADIENTS.midnight.ctaGradient[0],
  },
];

const SUGGESTED_EMOJIS = [
  '😂', '🔥', '🎵', '🍕', '✈️', '🏄',
  '💃', '🎸', '🐶', '🍜', '👻', '🌙',
  '🎯', '💪', '🌊', '🦋', '🎭', '🍫',
  '🤓', '⚡', '🌈', '🏆', '🎤', '🦁',
  '🍓', '🎮', '🌺', '💎', '🚀', '🎪',
];

const GENDER_LABELS: Partial<Record<string, string>> = {
  male: COPY.onboarding.gender.options.male,
  female: COPY.onboarding.gender.options.female,
  other: COPY.onboarding.gender.options.other,
  nonbinary: COPY.onboarding.gender.options.nonbinary,
};

function normalizeProfileGender(value: string | null | undefined): GenderValue | null {
  if (value === 'male' || value === 'female' || value === 'other') return value;
  if (value === 'nonbinary') return 'other';
  return null;
}

function normalizeProfileGenders(values: unknown): GenderValue[] {
  if (!Array.isArray(values)) return [];

  return Array.from(
    new Set(
      values
        .map((value) => normalizeProfileGender(typeof value === 'string' ? value : null))
        .filter((value): value is GenderValue => value !== null),
    ),
  );
}

function uniqueCityResults(results: CitySearchResult[]): CitySearchResult[] {
  return results.filter(
    (result, index, list) =>
      index === list.findIndex((item) => item.city === result.city && item.displayName === result.displayName),
  );
}

function calculateAge(isoBirthdate: string): number {
  const today = new Date();
  const birth = new Date(isoBirthdate);
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}

function SectionTitle({ label }: { label: string }) {
  return (
    <Text
      style={{
        marginBottom: 12,
        fontSize: 13,
        fontFamily: FONT.bold,
        color: COLORS.textSecondary,
        textTransform: 'uppercase',
        letterSpacing: 0.6,
      }}
    >
      {label}
    </Text>
  );
}

export default function ProfileRoute() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { signOut, profile } = useAuth();
  const { setHasRecordedVoice } = useFeedState();
  const upsertProfile = useUpsertProfile();
  const [isVoicePlaying, setIsVoicePlaying] = useState(false);
  const [voiceTitle, setVoiceTitle] = useState('');
  const [mood, setMood] = useState<ColorTheme>(ColorTheme.Sunset);
  const [bioEmojis, setBioEmojis] = useState<[string, string, string]>([
    profile?.bio_emojis?.[0] ?? '',
    profile?.bio_emojis?.[1] ?? '',
    profile?.bio_emojis?.[2] ?? '',
  ]);

  // lookingFor stays editable.
  const [lookingFor, setLookingFor] = useState<GenderValue[]>(
    normalizeProfileGenders(profile?.looking_for),
  );

  // City: track the confirmed selection separately from the search query.
  const [confirmedCity, setConfirmedCity] = useState(profile?.city ?? '');
  const [newCoordinates, setNewCoordinates] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [cityChanged, setCityChanged] = useState(false);
  const [cityQuery, setCityQuery] = useState('');
  const [cityResults, setCityResults] = useState<CitySearchResult[]>([]);
  const [selectedResultId, setSelectedResultId] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  // Emoji picker — tracks which slot (0–2) is open; null means closed.
  const [emojiPickerIndex, setEmojiPickerIndex] = useState<number | null>(null);
  const [emojiManualInput, setEmojiManualInput] = useState('');

  const [error, setError] = useState<EditError | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const toggleLookingFor = (value: GenderValue) => {
    setLookingFor((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
    );
  };

  const openEmojiPicker = (index: number) => {
    setEmojiPickerIndex(index);
    setEmojiManualInput('');
  };

  const selectEmoji = (emoji: string) => {
    if (emojiPickerIndex === null) return;
    const trimmed = emoji.trim().slice(0, 2);
    if (!trimmed) return;
    setBioEmojis((current) => {
      const next: [string, string, string] = [...current];
      next[emojiPickerIndex] = trimmed;
      return next;
    });
    setSaveSuccess(false);
    setEmojiPickerIndex(null);
  };

  const clearEmoji = (index: number) => {
    setBioEmojis((current) => {
      const next: [string, string, string] = [...current];
      next[index] = '';
      return next;
    });
    setSaveSuccess(false);
  };

  const handleCitySearch = async () => {
    setIsSearching(true);
    setError(null);
    setSelectedResultId(null);

    try {
      const results = await searchCities(cityQuery);
      setCityResults(uniqueCityResults(results));
    } catch {
      setCityResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleCitySelect = (result: CitySearchResult) => {
    setSelectedResultId(result.id);
    setConfirmedCity(result.city);
    setNewCoordinates(result.coordinates);
    setCityChanged(true);
    setCityResults([]);
    setCityQuery(result.city);
    setError(null);
  };

  const handleSave = async () => {
    const lookingForResult = validateLookingFor(lookingFor);

    if (!lookingForResult.valid) {
      setError('looking_for_empty');
      return;
    }

    // If the user opened city search but didn't confirm a result, block save.
    if (cityChanged && !newCoordinates) {
      setError('city_select_result');
      return;
    }

    setError(null);

    // Pass immutable fields as-is from the profile — only lookingFor, city, and bioEmojis are editable.
    const profileGender = normalizeProfileGender(profile?.gender) ?? 'other';

    try {
      await upsertProfile.mutateAsync({
        displayName: profile?.display_name ?? '',
        birthdate: profile?.birthdate ?? '',
        gender: profileGender,
        lookingFor,
        city: confirmedCity,
        coordinates: newCoordinates ?? undefined,
        bioEmojis,
      });
      setSaveSuccess(true);
      setCityChanged(false);
      setNewCoordinates(null);
    } catch {
      setError('save_failed');
    }
  };

  const handleSignOut = useCallback(async () => {
    try {
      await signOut();
      setHasRecordedVoice(false);
    } catch {
      Alert.alert(COPY.profile.signOutTitle, COPY.profile.signOutError);
    }
  }, [signOut, setHasRecordedVoice]);

  const age = profile?.birthdate ? calculateAge(profile.birthdate) : null;
  const genderText = GENDER_LABELS[profile?.gender ?? ''] ?? '';
  const infoLine = [
    profile?.display_name,
    age !== null ? `${age} ans` : null,
    genderText,
  ]
    .filter(Boolean)
    .join(' · ');

  // Use the mood's circle colors so the play button visually matches the selected mood.
  // ctaGradient is intentionally NOT used here — for Mystère it's magenta which clashes
  // with the dark grey circle that the user just selected.
  const currentMoodColors = [
    THEME_GRADIENTS[mood].colors[0],
    THEME_GRADIENTS[mood].colors[1],
  ] as const;

  return (
    <>
      <StatusBar style="dark" />

      {/* Emoji picker modal */}
      <Modal
        visible={emojiPickerIndex !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setEmojiPickerIndex(null)}
      >
        <Pressable
          style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }}
          onPress={() => setEmojiPickerIndex(null)}
        >
          <Pressable
            onPress={() => {
              /* Prevent tap-through closing modal when tapping inside sheet. */
            }}
            style={{
              backgroundColor: COLORS.surface,
              borderTopLeftRadius: RADIUS.modal,
              borderTopRightRadius: RADIUS.modal,
              padding: 24,
              paddingBottom: insets.bottom + 24,
            }}
          >
            <Text
              style={{
                marginBottom: 20,
                fontSize: 17,
                fontFamily: FONT.bold,
                color: COLORS.dark,
                textAlign: 'center',
              }}
            >
              {COPY.profile.emojiPickerTitle}
            </Text>

            {/* Emoji grid — 6 columns */}
            <View
              style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                gap: 8,
                justifyContent: 'center',
                marginBottom: 20,
              }}
            >
              {SUGGESTED_EMOJIS.map((emoji) => (
                <Pressable
                  key={emoji}
                  accessibilityRole="button"
                  onPress={() => selectEmoji(emoji)}
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: RADIUS.md,
                    backgroundColor: COLORS.surfaceMuted,
                    borderWidth: 1,
                    borderColor: COLORS.border,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ fontSize: 26 }}>{emoji}</Text>
                </Pressable>
              ))}
            </View>

            {/* Free-text fallback */}
            <TextInput
              value={emojiManualInput}
              onChangeText={(text) => {
                setEmojiManualInput(text);
                if (text.trim().length > 0) {
                  selectEmoji(text.trim());
                }
              }}
              placeholder={COPY.profile.emojiPickerInputPlaceholder}
              placeholderTextColor={COLORS.textTertiary}
              maxLength={2}
              style={{
                borderRadius: RADIUS.input,
                borderWidth: 1,
                borderColor: COLORS.border,
                backgroundColor: COLORS.surfaceMuted,
                paddingVertical: 14,
                paddingHorizontal: 16,
                fontSize: 24,
                textAlign: 'center',
                fontFamily: FONT.regular,
                color: COLORS.dark,
              }}
            />
          </Pressable>
        </Pressable>
      </Modal>

      <LinearGradient
        colors={[...ONBOARDING_GRADIENT]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ flex: 1 }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}
        >
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{
              flexGrow: 1,
              paddingTop: insets.top + 16,
              paddingBottom: insets.bottom + 120,
              paddingHorizontal: 24,
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 28,
              }}
            >
              <Text
                style={{ fontSize: 26, fontFamily: FONT.extrabold, color: COLORS.dark }}
              >
                {COPY.profile.title}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={COPY.profile.signOutCta}
                onPress={() => {
                  void handleSignOut();
                }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  paddingVertical: 8,
                  paddingHorizontal: 12,
                  borderRadius: RADIUS.full,
                  borderWidth: 1,
                  borderColor: COLORS.border,
                  backgroundColor: COLORS.surfaceMuted,
                }}
              >
                <LogOut size={16} color={COLORS.textSecondary} />
                <Text style={{ fontFamily: FONT.semibold, color: COLORS.textSecondary }}>
                  {COPY.profile.signOutCta}
                </Text>
              </Pressable>
            </View>

            {/* Voice */}
            <View style={{ marginBottom: 28, gap: 16 }}>
              <SectionTitle label={COPY.profile.voiceCard} />

              <View
                style={{
                  borderRadius: RADIUS.xl,
                  borderWidth: 1,
                  borderColor: COLORS.border,
                  backgroundColor: COLORS.surfaceMuted,
                  padding: 16,
                  ...SHADOW.card,
                }}
              >
                <View style={{ marginBottom: 14 }}>
                  <Text style={{ fontFamily: FONT.bold, fontSize: 16, color: COLORS.dark }}>
                    {COPY.profile.voiceCard}
                  </Text>
                  <Text style={{ fontFamily: FONT.regular, fontSize: 12, color: COLORS.textTertiary }}>
                    {COPY.profile.voiceTimestamp}
                  </Text>
                  {/* Subtle redo link — navigates without clearing existing recording. */}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={COPY.a11y.retakeVoice}
                    onPress={() => router.push('/(auth)/record?source=profile')}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 4,
                      marginTop: 6,
                      alignSelf: 'flex-start',
                    }}
                  >
                    <RefreshCw size={12} color={COLORS.textTertiary} />
                    <Text
                      style={{
                        fontSize: 12,
                        fontFamily: FONT.medium,
                        color: COLORS.textTertiary,
                      }}
                    >
                      {COPY.profile.recordVoiceAgain}
                    </Text>
                  </Pressable>
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={isVoicePlaying ? COPY.a11y.pause : COPY.a11y.play}
                    onPress={() => setIsVoicePlaying((playing) => !playing)}
                    style={{ width: 48, height: 48, borderRadius: 24, overflow: 'hidden' }}
                  >
                    <LinearGradient
                      colors={[...currentMoodColors]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}
                    >
                      {isVoicePlaying ? (
                        <Pause size={18} color={COLORS.surface} fill={COLORS.surface} />
                      ) : (
                        <Play size={18} color={COLORS.surface} fill={COLORS.surface} style={{ marginLeft: 2 }} />
                      )}
                    </LinearGradient>
                  </Pressable>

                  <View style={{ flex: 1, gap: 3 }}>
                    <Text style={{ fontFamily: FONT.semibold, color: COLORS.dark }}>
                      {voiceTitle.trim() || COPY.profile.catchphraseHint}
                    </Text>
                    <Text style={{ fontFamily: FONT.regular, fontSize: 12, color: COLORS.textTertiary }}>
                      {bioEmojis.filter(Boolean).join(' ') || COPY.profile.emojisLabel.trim()}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Voice title input */}
              <View style={{ gap: 8 }}>
                <Text style={{ fontFamily: FONT.medium, color: COLORS.textSecondary }}>
                  {COPY.profile.catchphraseLabel}
                </Text>
                <TextInput
                  value={voiceTitle}
                  onChangeText={(text) => {
                    setVoiceTitle(text.slice(0, 60));
                    setSaveSuccess(false);
                  }}
                  placeholder={COPY.profile.catchphrasePlaceholder}
                  placeholderTextColor={COLORS.textTertiary}
                  maxLength={60}
                  style={{
                    borderRadius: RADIUS.lg,
                    borderWidth: 1,
                    borderColor: COLORS.border,
                    backgroundColor: COLORS.surfaceMuted,
                    paddingVertical: 16,
                    paddingHorizontal: 16,
                    fontFamily: FONT.regular,
                    color: COLORS.dark,
                  }}
                />
              </View>

              {/* Mood selector */}
              <View>
                <Text style={{ marginBottom: 12, fontFamily: FONT.medium, color: COLORS.textSecondary }}>
                  {COPY.profile.moodLabel}
                </Text>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  {MOOD_OPTIONS.map((option) => {
                    const selected = mood === option.id;

                    return (
                      <View key={option.id} style={{ alignItems: 'center', gap: 8 }}>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityState={{ selected }}
                          onPress={() => {
                            setMood(option.id);
                            setSaveSuccess(false);
                          }}
                          style={{
                            padding: 8,
                            borderRadius: RADIUS.full,
                            opacity: selected ? 1 : 0.45,
                          }}
                        >
                          <LinearGradient
                            colors={[...option.colors]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={{
                              width: 48,
                              height: 48,
                              borderRadius: RADIUS.full,
                              borderWidth: selected ? 2.5 : 0,
                              // Use the mood's own CTA color so midnight shows magenta, not pink.
                              borderColor: option.ctaBorderColor,
                            }}
                          />
                        </Pressable>
                        <Text
                          style={{
                            fontFamily: selected ? FONT.semibold : FONT.medium,
                            fontSize: 11,
                            color: selected ? option.ctaBorderColor : COLORS.textTertiary,
                          }}
                        >
                          {option.label}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </View>

              {/* Emoji picker */}
              <View>
                <Text style={{ marginBottom: 12, fontFamily: FONT.medium, color: COLORS.textSecondary }}>
                  {COPY.profile.emojisLabel}
                </Text>
                <View style={{ flexDirection: 'row', gap: 16 }}>
                  {bioEmojis.map((emoji, index) => (
                    <View key={index} style={{ position: 'relative' }}>
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => openEmojiPicker(index)}
                        style={{
                          width: 72,
                          height: 72,
                          borderRadius: RADIUS.full,
                          borderWidth: 1,
                          borderColor: COLORS.border,
                          backgroundColor: COLORS.surface,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        {emoji ? (
                          <Text style={{ fontSize: 32 }}>{emoji}</Text>
                        ) : (
                          <Plus size={20} color={COLORS.textTertiary} />
                        )}
                      </Pressable>
                      {emoji ? (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={COPY.a11y.clearEmoji}
                          onPress={() => clearEmoji(index)}
                          style={{
                            position: 'absolute',
                            top: 0,
                            right: 0,
                            width: 22,
                            height: 22,
                            borderRadius: RADIUS.full,
                            backgroundColor: COLORS.surfaceMuted,
                            borderWidth: 1,
                            borderColor: COLORS.border,
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <X size={11} color={COLORS.textTertiary} />
                        </Pressable>
                      ) : null}
                    </View>
                  ))}
                </View>
              </View>
            </View>

            {/* Read-only identity info */}
            <View style={{ marginBottom: 28 }}>
              <SectionTitle label={COPY.profile.editSectionInfo} />
              <View
                style={{
                  borderRadius: RADIUS.input,
                  borderWidth: 1,
                  borderColor: COLORS.border,
                  backgroundColor: COLORS.surfaceMuted,
                  paddingVertical: 14,
                  paddingHorizontal: 16,
                }}
              >
                <Text style={{ fontFamily: FONT.semibold, fontSize: 15, color: COLORS.dark }}>
                  {infoLine || '—'}
                </Text>
                {profile?.birthdate ? (
                  <Text style={{ marginTop: 4, fontFamily: FONT.regular, fontSize: 13, color: COLORS.textSecondary }}>
                    {isoBirthdateToFrench(profile.birthdate)}
                  </Text>
                ) : null}
              </View>
            </View>

            {/* Looking for — editable */}
            <View style={{ marginBottom: 28, gap: 14 }}>
              <SectionTitle label={COPY.profile.editSectionPreferences} />
              {PROFILE_GENDERS.map((value) => (
                <SelectableOption
                  key={value}
                  label={COPY.onboarding.lookingFor.options[value]}
                  selected={lookingFor.includes(value)}
                  onPress={() => {
                    toggleLookingFor(value);
                    setError(null);
                    setSaveSuccess(false);
                  }}
                />
              ))}
            </View>

            {/* City */}
            <View style={{ marginBottom: 28, gap: 14 }}>
              <SectionTitle label={COPY.profile.editSectionCity} />

              {confirmedCity ? (
                <View
                  style={{
                    borderRadius: RADIUS.md,
                    borderWidth: 1,
                    borderColor: COLORS.border,
                    backgroundColor: COLORS.surfaceMuted,
                    padding: 14,
                    marginBottom: 4,
                  }}
                >
                  <Text style={{ fontFamily: FONT.semibold, color: COLORS.dark }}>
                    {COPY.profile.editCityCurrentLabel(confirmedCity)}
                  </Text>
                </View>
              ) : null}

              {!cityChanged ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    setCityChanged(true);
                    setSaveSuccess(false);
                  }}
                  style={{
                    alignSelf: 'flex-start',
                    borderRadius: RADIUS.full,
                    borderWidth: 1,
                    borderColor: COLORS.border,
                    backgroundColor: COLORS.surfaceMuted,
                    paddingVertical: 10,
                    paddingHorizontal: 14,
                  }}
                >
                  <Text style={{ fontFamily: FONT.semibold, color: COLORS.textSecondary }}>
                    {COPY.profile.editCityChangePrompt}
                  </Text>
                </Pressable>
              ) : (
                <View style={{ gap: 12 }}>
                  <Text
                    style={{
                      fontSize: 13,
                      fontFamily: FONT.regular,
                      color: COLORS.textSecondary,
                    }}
                  >
                    {COPY.profile.editCityChangeHint}
                  </Text>

                  <OnboardingTextInput
                    value={cityQuery}
                    onChangeText={(text) => {
                      setCityQuery(text);
                      setSelectedResultId(null);
                      setNewCoordinates(null);
                    }}
                    placeholder={COPY.onboarding.city.placeholder}
                    autoCapitalize="words"
                    returnKeyType="search"
                    onSubmitEditing={handleCitySearch}
                  />

                  <Pressable
                    accessibilityRole="button"
                    disabled={isSearching}
                    onPress={handleCitySearch}
                    style={{
                      alignSelf: 'flex-start',
                      borderRadius: RADIUS.full,
                      backgroundColor: COLORS.border,
                      paddingVertical: 10,
                      paddingHorizontal: 16,
                      opacity: isSearching ? 0.5 : 1,
                    }}
                  >
                    <Text style={{ fontFamily: FONT.bold, color: COLORS.dark }}>
                      {isSearching
                        ? COPY.onboarding.city.searching
                        : COPY.onboarding.city.searchCta}
                    </Text>
                  </Pressable>

                  {cityResults.length > 0 ? (
                    <View style={{ gap: 8 }}>
                      {cityResults.map((result) => {
                        const selected = selectedResultId === result.id;

                        return (
                          <Pressable
                            key={result.id}
                            accessibilityRole="button"
                            accessibilityState={{ selected }}
                            onPress={() => handleCitySelect(result)}
                            style={{
                              borderRadius: RADIUS.md,
                              borderWidth: 1,
                              borderColor: selected ? COLORS.primary : COLORS.border,
                              backgroundColor: selected ? COLORS.primaryMuted : COLORS.surfaceMuted,
                              padding: 14,
                            }}
                          >
                            <Text
                              style={{ marginBottom: 4, fontFamily: FONT.bold, color: COLORS.dark }}
                            >
                              {result.city}
                            </Text>
                            <Text
                              style={{
                                fontSize: 12,
                                lineHeight: 17,
                                fontFamily: FONT.regular,
                                color: COLORS.textSecondary,
                              }}
                            >
                              {result.displayName}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  ) : null}
                </View>
              )}
            </View>

            {/* Error / success feedback */}
            {error ? (
              <Text
                style={{
                  marginBottom: 12,
                  textAlign: 'center',
                  fontFamily: FONT.medium,
                  color: COLORS.primary,
                }}
              >
                {COPY.profile.editErrors[error]}
              </Text>
            ) : null}
            {saveSuccess && !error ? (
              <Text
                style={{
                  marginBottom: 12,
                  textAlign: 'center',
                  fontFamily: FONT.medium,
                  color: COLORS.dark,
                }}
              >
                {COPY.profile.editSaveSuccess}
              </Text>
            ) : null}

            {/* Save CTA */}
            <Pressable
              accessibilityRole="button"
              disabled={upsertProfile.isPending}
              onPress={() => {
                void handleSave();
              }}
              style={{
                width: '100%',
                borderRadius: RADIUS.full,
                overflow: 'hidden',
                opacity: upsertProfile.isPending ? 0.5 : 1,
                ...SHADOW.button,
              }}
            >
              <LinearGradient
                colors={[...CTA_GRADIENT]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <View
                  style={{
                    alignItems: 'center',
                    justifyContent: 'center',
                    paddingVertical: 16,
                  }}
                >
                  <Text style={{ fontFamily: FONT.bold, color: '#ffffff' }}>
                    {upsertProfile.isPending
                      ? COPY.profile.editSaving
                      : COPY.profile.editSaveChanges}
                  </Text>
                </View>
              </LinearGradient>
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </LinearGradient>
    </>
  );
}
