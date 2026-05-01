/* Profile tab — view and edit the authenticated user's profile fields. */

import React, { useCallback, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { LogOut } from 'lucide-react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { COPY } from '../../src/copy';
import { COLORS, CTA_GRADIENT, FONT, ONBOARDING_GRADIENT, RADIUS, SHADOW } from '../../src/theme';
import { useAuth } from '../../src/features/auth/hooks/useAuth';
import { useFeedState } from '../../src/features/feed/hooks/useFeedState';
import { searchCities, type CitySearchResult } from '../../src/features/profile/api/citySearch';
import { useUpsertProfile } from '../../src/features/profile/api/profileMutations';
import {
  OnboardingTextInput,
  SelectableOption,
} from '../../src/features/profile/components/ProfileOnboardingStep';
import {
  formatBirthdateInput,
  frenchBirthdateToIso,
  isoBirthdateToFrench,
} from '../../src/features/profile/helpers/birthdateInput';
import {
  GENDER_VALUES,
  validateAge,
  validateDisplayName,
  validateGender,
  validateLookingFor,
  type GenderValue,
} from '../../src/features/profile/helpers/validation';

type EditError = keyof typeof COPY.profile.editErrors;

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
  const insets = useSafeAreaInsets();
  const { signOut, profile } = useAuth();
  const { setHasRecordedVoice } = useFeedState();
  const upsertProfile = useUpsertProfile();

  // Form state — initialized once from profile; changes stay local until saved.
  const [displayName, setDisplayName] = useState(profile?.display_name ?? '');
  const [birthdate, setBirthdate] = useState(
    profile?.birthdate ? isoBirthdateToFrench(profile.birthdate) : '',
  );
  const [gender, setGender] = useState<GenderValue | null>(
    (profile?.gender as GenderValue | null) ?? null,
  );
  const [lookingFor, setLookingFor] = useState<GenderValue[]>(
    (profile?.looking_for as GenderValue[]) ?? [],
  );

  // City: we track the confirmed selection separately from the search query.
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

  const [error, setError] = useState<EditError | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const toggleLookingFor = (value: GenderValue) => {
    setLookingFor((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
    );
  };

  const handleCitySearch = async () => {
    setIsSearching(true);
    setError(null);
    setSelectedResultId(null);

    try {
      const results = await searchCities(cityQuery);
      setCityResults(results);
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
    setError(null);
  };

  const handleSave = async () => {
    const nameResult = validateDisplayName(displayName);

    if (!nameResult.valid) {
      setError(nameResult.error === 'too_short' ? 'name_too_short' : 'name_too_long');
      return;
    }

    const isoBirthdate = frenchBirthdateToIso(birthdate);
    const ageResult = validateAge(isoBirthdate ?? birthdate);

    if (!ageResult.valid) {
      setError(ageResult.error === 'invalid_date' ? 'birthdate_invalid' : 'birthdate_underage');
      return;
    }

    const genderResult = validateGender(gender ?? '');

    if (!genderResult.valid) {
      setError('gender_required');
      return;
    }

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

    try {
      await upsertProfile.mutateAsync({
        displayName,
        birthdate: isoBirthdate!,
        gender: gender!,
        lookingFor,
        city: confirmedCity,
        coordinates: newCoordinates ?? undefined,
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

  return (
    <>
      <StatusBar style="dark" />
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

            {/* Personal information */}
            <View style={{ marginBottom: 28, gap: 14 }}>
              <SectionTitle label={COPY.profile.editSectionInfo} />

              <View style={{ gap: 8 }}>
                <Text style={{ fontFamily: FONT.medium, color: COLORS.textSecondary }}>
                  {COPY.profile.editDisplayNameLabel}
                </Text>
                <OnboardingTextInput
                  value={displayName}
                  onChangeText={(text) => {
                    setDisplayName(text);
                    setError(null);
                    setSaveSuccess(false);
                  }}
                  placeholder={COPY.profile.namePlaceholder}
                  autoCapitalize="words"
                  textContentType="givenName"
                />
              </View>

              <View style={{ gap: 8 }}>
                <Text style={{ fontFamily: FONT.medium, color: COLORS.textSecondary }}>
                  {COPY.profile.editBirthdateLabel}
                </Text>
                <OnboardingTextInput
                  value={birthdate}
                  onChangeText={(text) => {
                    setBirthdate(formatBirthdateInput(text));
                    setError(null);
                    setSaveSuccess(false);
                  }}
                  placeholder={COPY.onboarding.birthdate.placeholder}
                  keyboardType="number-pad"
                  maxLength={14}
                />
              </View>
            </View>

            {/* Gender */}
            <View style={{ marginBottom: 28, gap: 14 }}>
              <SectionTitle label={COPY.profile.editGenderLabel} />
              {GENDER_VALUES.map((value: GenderValue) => (
                <SelectableOption
                  key={value}
                  label={COPY.onboarding.gender.options[value]}
                  selected={gender === value}
                  onPress={() => {
                    setGender(value);
                    setError(null);
                    setSaveSuccess(false);
                  }}
                />
              ))}
            </View>

            {/* Looking for */}
            <View style={{ marginBottom: 28, gap: 14 }}>
              <SectionTitle label={COPY.profile.editSectionPreferences} />
              {GENDER_VALUES.map((value: GenderValue) => (
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

              {/* Current confirmed city */}
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

              {/* Change-city toggle */}
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
