/* Shared profile screen — renders the full profile editor for both the main tab and onboarding setup. */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Constants from 'expo-constants';
import {
  ActivityIndicator,
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
import { LogOut, Mic, Pause, Plus, RefreshCw, Trash2, X } from 'lucide-react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';

import { COPY } from '@/copy';
import { COLORS, CTA_GRADIENT, FONT, ONBOARDING_GRADIENT, RADIUS, SHADOW, THEME_GRADIENTS, ColorTheme } from '@/theme';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { ProfileAccountPrivacySection } from '@/features/profile/components/ProfileAccountPrivacySection';
import { type CitySearchResult } from '@/features/profile/api/citySearch';
import { useUpsertProfile } from '@/features/profile/api/profileMutations';
import { useCitySearch } from '@/features/profile/hooks/useCitySearch';
import { useActiveVoice, useVoiceSignedUrl } from '@/features/voices/api/voiceQueries';
import { useDeleteVoice, useUpdateVoice } from '@/features/voices/api/voiceMutations';
import { useVoicePlayer } from '@/features/voices/hooks/useVoicePlayer';
import type { VoiceTheme } from '@/features/voices/types';
import { formatRelativeTime } from '@/lib/formatRelativeTime';
import {
  OnboardingTextInput,
  SelectableOption,
} from '@/features/profile/components/ProfileOnboardingStep';
import { isoBirthdateToFrench } from '@/features/profile/helpers/birthdateInput';
import {
  validateLookingFor,
  type GenderValue,
} from '@/features/profile/helpers/validation';

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

const VALID_VOICE_THEMES: ReadonlySet<VoiceTheme> = new Set(['sunset', 'chill', 'electric', 'midnight']);

function PlayGlyph({ size = 18, color = COLORS.surface }: { size?: number; color?: string }) {
  return (
    <View
      style={{
        width: 0,
        height: 0,
        marginLeft: size * 0.12,
        borderTopWidth: size * 0.32,
        borderBottomWidth: size * 0.32,
        borderLeftWidth: size * 0.5,
        borderTopColor: 'transparent',
        borderBottomColor: 'transparent',
        borderLeftColor: color,
      }}
    />
  );
}

function voiceThemeToColorTheme(theme: string | null | undefined): ColorTheme {
  if (theme && VALID_VOICE_THEMES.has(theme as VoiceTheme)) {
    return theme as ColorTheme;
  }
  return ColorTheme.Sunset;
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

interface ProfileScreenProps {
  isOnboarding?: boolean;
  onOnboardingComplete?: () => void;
}

export default function ProfileScreen({ isOnboarding = false, onOnboardingComplete }: ProfileScreenProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { signOut, profile } = useAuth();
  const upsertProfile = useUpsertProfile();
  const updateVoice = useUpdateVoice();
  const deleteVoice = useDeleteVoice();
  const activeVoiceQuery = useActiveVoice(profile?.id ?? null);
  const activeVoice = activeVoiceQuery.data ?? null;
  const signedUrlQuery = useVoiceSignedUrl(activeVoice?.storage_path ?? null);
  const signedUrl = signedUrlQuery.data ?? null;
  const voicePlayer = useVoicePlayer({ uri: signedUrl });

  // Stop playback (pause + reset to 0) when navigating away from the profile tab.
  // Use a ref to avoid re-registering the effect on every render (voicePlayer status changes every tick).
  const voicePlayerRef = useRef(voicePlayer);
  voicePlayerRef.current = voicePlayer;

  useFocusEffect(
    useCallback(() => {
      return () => {
        voicePlayerRef.current.stop();
      };
    }, []),
  );

  const [voiceTitle, setVoiceTitle] = useState('');
  const [mood, setMood] = useState<ColorTheme>(ColorTheme.Sunset);
  const [voiceDirty, setVoiceDirty] = useState(false);
  const [bioEmojis, setBioEmojis] = useState<[string, string, string]>([
    profile?.bio_emojis?.[0] ?? '',
    profile?.bio_emojis?.[1] ?? '',
    profile?.bio_emojis?.[2] ?? '',
  ]);

  // Sync local title/mood with the latest active voice each time it changes (login, refetch, new upload).
  // Resets the dirty flag because the new server values supersede in-flight edits.
  useEffect(() => {
    if (!activeVoice) return;
    setVoiceTitle(activeVoice.title ?? '');
    setMood(voiceThemeToColorTheme(activeVoice.theme));
    setVoiceDirty(false);
  }, [activeVoice?.id, activeVoice?.title, activeVoice?.theme, activeVoice]);

  const [lookingFor, setLookingFor] = useState<GenderValue[]>(
    normalizeProfileGenders(profile?.looking_for),
  );

  const [confirmedCity, setConfirmedCity] = useState(profile?.city ?? '');
  const [newCoordinates, setNewCoordinates] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [cityChanged, setCityChanged] = useState(false);
  const citySearch = useCitySearch();

  // Re-sync UI state whenever the profile identity changes (login, refetch, account switch).
  useEffect(() => {
    if (!profile) return;
    setBioEmojis([
      profile.bio_emojis?.[0] ?? '',
      profile.bio_emojis?.[1] ?? '',
      profile.bio_emojis?.[2] ?? '',
    ]);
    setLookingFor(normalizeProfileGenders(profile.looking_for));
    setConfirmedCity(profile.city ?? '');
  }, [profile?.id]); // eslint-disable-line react-hooks/exhaustive-deps

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
    await citySearch.search();
  };

  const handleCitySelect = (result: CitySearchResult) => {
    citySearch.select(result);
    setConfirmedCity(result.city);
    setNewCoordinates(result.coordinates);
    setCityChanged(true);
    setError(null);
  };

  const handleSave = async () => {
    const lookingForResult = validateLookingFor(lookingFor);

    if (!lookingForResult.valid) {
      setError('looking_for_empty');
      return;
    }

    if (cityChanged && !newCoordinates) {
      setError('city_select_result');
      return;
    }

    setError(null);

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
        country: profile?.country ?? undefined,
      });
    } catch {
      setError('save_failed');
      return;
    }

    // Persist voice metadata only when the user actually changed it; avoids needless writes
    // and respects the catchphrase max length already enforced server-side by update_own_voice.
    if (activeVoice && voiceDirty) {
      try {
        await updateVoice.mutateAsync({
          voiceId: activeVoice.id,
          title: voiceTitle.trim() || null,
          theme: mood as VoiceTheme,
        });
        setVoiceDirty(false);
      } catch {
        // Profile was saved successfully; only the voice metadata update failed.
        // updateVoice.isError surfaces the feedback via existing error state.
      }
    }

    if (isOnboarding) {
      onOnboardingComplete?.();
    } else {
      setSaveSuccess(true);
      setCityChanged(false);
      setNewCoordinates(null);
    }
  };

  const handleSignOut = useCallback(async () => {
    try {
      await signOut();
    } catch {
      Alert.alert(COPY.profile.signOutTitle, COPY.profile.signOutError);
    }
  }, [signOut]);

  const handleDeleteVoice = useCallback(() => {
    if (!activeVoice || !profile?.id) return;

    Alert.alert(
      COPY.profile.deleteVoiceConfirmTitle,
      COPY.profile.deleteVoiceConfirmBody,
      [
        { text: COPY.common.cancel, style: 'cancel' },
        {
          text: COPY.profile.deleteVoiceConfirmCta,
          style: 'destructive',
          onPress: async () => {
            try {
              voicePlayer.unload();
              await deleteVoice.mutateAsync({ voiceId: activeVoice.id, userId: profile.id });
            } catch {
              Alert.alert(COPY.profile.deleteVoiceConfirmTitle, COPY.profile.deleteVoiceError);
            }
          },
        },
      ],
    );
  }, [activeVoice, deleteVoice, profile?.id, voicePlayer]);

  const age = profile?.birthdate ? calculateAge(profile.birthdate) : null;
  const genderText = GENDER_LABELS[profile?.gender ?? ''] ?? '';
  const infoLine = [
    profile?.display_name,
    age !== null ? `${age} ans` : null,
    genderText,
  ]
    .filter(Boolean)
    .join(' · ');

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
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}
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
                maxHeight: '80%',
              }}
            >
              <ScrollView
                keyboardShouldPersistTaps="handled"
                bounces={false}
                contentContainerStyle={{
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
              </ScrollView>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
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
              {!isOnboarding && (
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
              )}
            </View>

            {/* Voice */}
            <View style={{ marginBottom: 28, gap: 16 }}>
              <SectionTitle label={COPY.profile.voiceCard} />

              {!activeVoice && !activeVoiceQuery.isLoading ? (
                <View
                  style={{
                    borderRadius: RADIUS.xl,
                    borderWidth: 1,
                    borderColor: COLORS.border,
                    backgroundColor: COLORS.surfaceMuted,
                    padding: 16,
                    gap: 12,
                    ...SHADOW.card,
                    ...(Platform.OS === 'android' ? { elevation: 0 } : undefined),
                  }}
                >
                  <Text style={{ fontFamily: FONT.bold, fontSize: 16, color: COLORS.dark }}>
                    {COPY.profile.voiceMissingTitle}
                  </Text>
                  <Text style={{ fontFamily: FONT.regular, fontSize: 13, color: COLORS.textSecondary }}>
                    {COPY.profile.voiceMissingHint}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => router.push('/(main)/profile/record')}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      marginTop: 4,
                      borderRadius: RADIUS.full,
                      paddingVertical: 12,
                      backgroundColor: COLORS.primary,
                    }}
                  >
                    <Mic size={16} color={COLORS.surface} />
                    <Text style={{ fontFamily: FONT.bold, color: COLORS.surface }}>
                      {COPY.profile.voiceMissingCta}
                    </Text>
                  </Pressable>
                </View>
              ) : (
                <View
                  style={{
                    borderRadius: RADIUS.xl,
                    borderWidth: 1,
                    borderColor: COLORS.border,
                    backgroundColor: COLORS.surfaceMuted,
                    padding: 16,
                    ...SHADOW.card,
                    ...(Platform.OS === 'android' ? { elevation: 0 } : undefined),
                  }}
                >
                  <View style={{ marginBottom: 14 }}>
                    <Text style={{ fontFamily: FONT.bold, fontSize: 16, color: COLORS.dark }}>
                      {COPY.profile.voiceCard}
                    </Text>
                    <Text style={{ fontFamily: FONT.regular, fontSize: 12, color: COLORS.textSecondary }}>
                      {activeVoice ? formatRelativeTime(activeVoice.created_at) : ''}
                    </Text>
                    {!isOnboarding && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 6 }}>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={COPY.a11y.retakeVoice}
                          onPress={() => router.push('/(main)/profile/record')}
                          style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
                        >
                          <RefreshCw size={12} color={COLORS.textSecondary} />
                          <Text style={{ fontSize: 12, fontFamily: FONT.medium, color: COLORS.textSecondary }}>
                            {COPY.profile.recordVoiceAgain}
                          </Text>
                        </Pressable>

                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={COPY.a11y.deleteVoice}
                          disabled={deleteVoice.isPending}
                          onPress={handleDeleteVoice}
                          style={{ flexDirection: 'row', alignItems: 'center', gap: 4, opacity: deleteVoice.isPending ? 0.4 : 1 }}
                        >
                          <Trash2 size={12} color={COLORS.primary} />
                          <Text style={{ fontSize: 12, fontFamily: FONT.medium, color: COLORS.primary }}>
                            {COPY.a11y.deleteVoice}
                          </Text>
                        </Pressable>
                      </View>
                    )}
                  </View>

                  {/* Play button + inline title */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={voicePlayer.isPlaying ? COPY.a11y.pause : COPY.a11y.play}
                      disabled={!signedUrl}
                      onPress={() => {
                        if (!signedUrl) return;
                        if (voicePlayer.isPlaying) {
                          voicePlayer.pause();
                        } else {
                          void voicePlayer.play();
                        }
                      }}
                      style={{
                        width: 48,
                        height: 48,
                        borderRadius: 24,
                        overflow: 'hidden',
                        opacity: signedUrl ? 1 : 0.5,
                      }}
                    >
                      <LinearGradient
                        colors={[...currentMoodColors]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}
                      >
                        {signedUrlQuery.isLoading ? (
                          <ActivityIndicator color={COLORS.surface} size="small" />
                        ) : voicePlayer.isPlaying ? (
                          <Pause size={18} color={COLORS.surface} fill={COLORS.surface} />
                        ) : (
                          <PlayGlyph />
                        )}
                      </LinearGradient>
                    </Pressable>

                    {/* Android: never put flex:1 on TextInput inside ScrollView — it expands vertically and draws the default white edit background. */}
                    <View
                      style={{
                        flex: 1,
                        minWidth: 0,
                        justifyContent: 'center',
                        backgroundColor: 'transparent',
                      }}
                    >
                      <TextInput
                        value={voiceTitle}
                        multiline={false}
                        numberOfLines={1}
                        disableFullscreenUI
                        importantForAutofill="no"
                        underlineColorAndroid="transparent"
                        selectionColor={COLORS.primary}
                        cursorColor={COLORS.primary}
                        onChangeText={(text) => {
                          setVoiceTitle(text.slice(0, 60));
                          setVoiceDirty(true);
                          setSaveSuccess(false);
                        }}
                        placeholder={COPY.profile.catchphraseHint}
                        placeholderTextColor={COLORS.textTertiary}
                        maxLength={60}
                        style={{
                          width: '100%',
                          minHeight: Platform.OS === 'android' ? 40 : undefined,
                          maxHeight: 44,
                          fontFamily: FONT.semibold,
                          fontSize: 14,
                          lineHeight: Platform.OS === 'android' ? 20 : 18,
                          color: COLORS.dark,
                          padding: 0,
                          paddingVertical: 0,
                          margin: 0,
                          borderWidth: 0,
                          backgroundColor: 'transparent',
                          includeFontPadding: false,
                          textAlignVertical: 'center',
                        }}
                      />
                    </View>
                  </View>

                  <Text
                    style={{
                      marginTop: 4,
                      paddingLeft: 62,
                      fontSize: 11,
                      fontFamily: FONT.regular,
                      color: COLORS.textTertiary,
                      fontStyle: 'italic',
                      opacity: voiceTitle.trim().length === 0 ? 1 : 0,
                    }}
                  >
                    {COPY.profile.catchphraseEditHint}
                  </Text>

                  {signedUrlQuery.isError ? (
                    <Text
                      style={{
                        marginTop: 12,
                        fontSize: 12,
                        fontFamily: FONT.medium,
                        color: COLORS.primary,
                      }}
                    >
                      {COPY.profile.voicePlayError}
                    </Text>
                  ) : null}
                </View>
              )}

              {/* Mood selector — only meaningful when there's a voice to attach a theme to. */}
              {activeVoice ? (
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
                              setVoiceDirty(true);
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
              ) : null}

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
                    value={citySearch.query}
                    onChangeText={(text) => {
                      citySearch.setQuery(text);
                      setNewCoordinates(null);
                    }}
                    placeholder={COPY.onboarding.city.placeholder}
                    autoCapitalize="words"
                    returnKeyType="search"
                    onSubmitEditing={() => { void handleCitySearch(); }}
                  />

                  <Pressable
                    accessibilityRole="button"
                    disabled={citySearch.isSearching}
                    onPress={() => { void handleCitySearch(); }}
                    style={{
                      alignSelf: 'flex-start',
                      borderRadius: RADIUS.full,
                      backgroundColor: COLORS.border,
                      paddingVertical: 10,
                      paddingHorizontal: 16,
                      opacity: citySearch.isSearching ? 0.5 : 1,
                    }}
                  >
                    <Text style={{ fontFamily: FONT.bold, color: COLORS.dark }}>
                      {citySearch.isSearching
                        ? COPY.onboarding.city.searching
                        : COPY.onboarding.city.searchCta}
                    </Text>
                  </Pressable>

                  {citySearch.results.length > 0 ? (
                    <View style={{ gap: 8 }}>
                      {citySearch.results.map((result) => {
                        const selected = citySearch.selectedResultId === result.id;

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

            <AppVersion />

            {/* Save CTA */}
            <Pressable
              accessibilityRole="button"
              disabled={upsertProfile.isPending || updateVoice.isPending}
              onPress={() => {
                void handleSave();
              }}
              style={{
                width: '100%',
                borderRadius: RADIUS.full,
                overflow: 'hidden',
                opacity: upsertProfile.isPending || updateVoice.isPending ? 0.5 : 1,
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
                    {upsertProfile.isPending || updateVoice.isPending
                      ? COPY.profile.editSaving
                      : isOnboarding
                        ? COPY.profile.submitOnboarding
                        : COPY.profile.editSaveChanges}
                  </Text>
                </View>
              </LinearGradient>
            </Pressable>

            {!isOnboarding ? <ProfileAccountPrivacySection /> : null}
          </ScrollView>
        </KeyboardAvoidingView>
      </LinearGradient>
    </>
  );
}

function AppVersion() {
  // Constants.expoConfig is available in both development and production EAS builds.
  // Constants.platform is unreliable for native build numbers in production —
  // use the manifest nativeAppVersion / nativeBuildVersion fields instead.
  const version = Constants.expoConfig?.version
    ?? (Constants.manifest as { version?: string } | null)?.version
    ?? null;

  const buildVersion = (Constants as unknown as { nativeBuildVersion?: string | number }).nativeBuildVersion
    ?? null;

  if (!version) return null;

  const label = buildVersion != null ? `v${version} (${buildVersion})` : `v${version}`;

  return (
    <Text
      style={{
        marginTop: 20,
        textAlign: 'center',
        fontSize: 12,
        fontFamily: FONT.regular,
        color: COLORS.textSecondary,
      }}
    >
      {label}
    </Text>
  );
}
