/* City onboarding route — final wizard step: resolves a city to coordinates and persists the profile. */

import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { COPY } from '@/copy';
import { COLORS, FONT, RADIUS } from '@/theme';
import {
  OnboardingTextInput,
  ProfileOnboardingStep,
} from '@/features/profile/components/ProfileOnboardingStep';
import { useUpsertProfile } from '@/features/profile/api/profileMutations';
import { frenchBirthdateToIso } from '@/features/profile/helpers/birthdateInput';
import { useProfileOnboardingState } from '@/features/profile/hooks/useProfileOnboardingState';
import { useCitySearch } from '@/features/profile/hooks/useCitySearch';

const TOTAL_STEPS = 5;

type CityError =
  | 'required'
  | 'select_result'
  | 'query_too_short'
  | 'search_failed'
  | 'wizard_incomplete'
  | 'save_failed';

export default function OnboardingCityRoute() {
  const router = useRouter();
  const {
    displayName,
    birthdate,
    gender,
    lookingFor,
    city,
    coordinates,
    setCitySelection,
    clearCitySelection,
  } = useProfileOnboardingState();
  const upsertProfile = useUpsertProfile();
  const citySearch = useCitySearch(city);
  const [error, setError] = useState<CityError | null>(null);

  const handleSearch = async () => {
    setError(null);
    const { results: found, error: searchError } = await citySearch.search();
    if (searchError) {
      setError(searchError);
    } else if (found.length === 0) {
      setError('select_result');
    }
  };

  const handleFinish = async () => {
    if (citySearch.query.trim().length === 0) {
      setError('required');
      return;
    }

    if (!city || !coordinates) {
      setError('select_result');
      return;
    }

    // The wizard enforces these client-side already, but we guard before hitting the server
    // so a corrupted Zustand state surfaces a clear error instead of an opaque 23514.
    const isoBirthdate = frenchBirthdateToIso(birthdate);
    if (!displayName.trim() || !isoBirthdate || !gender || lookingFor.length === 0) {
      setError('wizard_incomplete');
      return;
    }

    setError(null);

    try {
      await upsertProfile.mutateAsync({
        displayName,
        birthdate: isoBirthdate,
        gender,
        lookingFor,
        city,
        coordinates,
      });
      router.push('/(auth)/onboarding/record');
    } catch {
      setError('save_failed');
    }
  };

  return (
    <ProfileOnboardingStep
      currentStep={5}
      totalSteps={TOTAL_STEPS}
      title={COPY.onboarding.city.title}
      subtitle={COPY.onboarding.city.subtitle}
      errorMessage={error ? COPY.onboarding.city.errors[error] : null}
      isSubmitting={upsertProfile.isPending}
      ctaLabel={upsertProfile.isPending ? COPY.onboarding.city.saving : COPY.common.continue}
      onBack={() => router.back()}
      onNext={handleFinish}
    >
      <View style={{ gap: 12 }}>
        <OnboardingTextInput
          value={citySearch.query}
          onChangeText={(text) => {
            citySearch.setQuery(text);
            setError(null);
            clearCitySelection();
          }}
          placeholder={COPY.onboarding.city.placeholder}
          autoCapitalize="words"
          returnKeyType="search"
          onSubmitEditing={() => { void handleSearch(); }}
        />

        <Pressable
          accessibilityRole="button"
          disabled={citySearch.isSearching}
          onPress={() => { void handleSearch(); }}
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
            {citySearch.isSearching ? COPY.onboarding.city.searching : COPY.onboarding.city.searchCta}
          </Text>
        </Pressable>
      </View>

      {citySearch.results.length > 0 ? (
        <View style={{ gap: 10 }}>
          <Text style={{ fontFamily: FONT.medium, color: COLORS.textSecondary }}>
            {COPY.onboarding.city.selectResult}
          </Text>
          {citySearch.results.map((result) => {
            const selected = citySearch.selectedResultId === result.id;

            return (
              <Pressable
                key={result.id}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => {
                  citySearch.select(result);
                  setCitySelection(result.city, result.coordinates);
                  setError(null);
                }}
                style={{
                  borderRadius: RADIUS.lg,
                  borderWidth: 1,
                  borderColor: selected ? COLORS.primary : COLORS.border,
                  backgroundColor: selected ? COLORS.primaryMuted : COLORS.surfaceMuted,
                  padding: 14,
                }}
              >
                <Text style={{ marginBottom: 4, fontFamily: FONT.bold, color: COLORS.dark }}>
                  {result.city}
                </Text>
                <Text style={{ fontSize: 12, lineHeight: 17, fontFamily: FONT.regular, color: COLORS.textSecondary }}>
                  {result.displayName}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : (
        error === 'select_result' && (
          <Text style={{ fontFamily: FONT.medium, color: COLORS.textSecondary }}>
            {COPY.onboarding.city.noResults}
          </Text>
        )
      )}

      {city && coordinates ? (
        <View
          style={{
            borderRadius: RADIUS.md,
            borderWidth: 1,
            borderColor: COLORS.primary,
            backgroundColor: COLORS.primaryMuted,
            padding: 14,
          }}
        >
          <Text style={{ marginBottom: 6, fontFamily: FONT.bold, color: COLORS.primary }}>
            {COPY.onboarding.city.selectedResult}
          </Text>
          <Text style={{ marginBottom: 4, fontSize: 17, fontFamily: FONT.bold, color: COLORS.dark }}>
            {city}
          </Text>
          <Text style={{ fontSize: 12, lineHeight: 18, fontFamily: FONT.regular, color: COLORS.textSecondary }}>
            {COPY.onboarding.city.coordinatesHint}
          </Text>
        </View>
      ) : null}
    </ProfileOnboardingStep>
  );
}
