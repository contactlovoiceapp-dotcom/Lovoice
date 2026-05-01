/* City onboarding route — resolves a manually searched city to coordinates before authentication. */

import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { COPY } from '@/copy';
import { COLORS, FONT, RADIUS } from '@/theme';
import { searchCities, type CitySearchResult } from '@/features/profile/api/citySearch';
import {
  OnboardingTextInput,
  ProfileOnboardingStep,
} from '@/features/profile/components/ProfileOnboardingStep';
import { useProfileOnboardingState } from '@/features/profile/hooks/useProfileOnboardingState';

const TOTAL_STEPS = 5;

type CityError =
  | 'required'
  | 'select_result'
  | 'query_too_short'
  | 'search_failed';

function mapCitySearchError(error: unknown): CityError {
  if (error instanceof Error && error.message === 'profile.city_query_too_short') {
    return 'query_too_short';
  }

  return 'search_failed';
}

export default function OnboardingCityRoute() {
  const router = useRouter();
  const { city, coordinates, setCitySelection, clearCitySelection } =
    useProfileOnboardingState();
  const [query, setQuery] = useState(city);
  const [results, setResults] = useState<CitySearchResult[]>([]);
  const [selectedResultId, setSelectedResultId] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<CityError | null>(null);

  const handleSearch = async () => {
    setIsSearching(true);
    setError(null);
    setSelectedResultId(null);

    try {
      const nextResults = await searchCities(query);
      const uniqueResults = nextResults.filter(
        (result, index, list) =>
          index === list.findIndex((item) => item.city === result.city && item.displayName === result.displayName),
      );

      setResults(uniqueResults);
      if (uniqueResults.length === 0) {
        setError('select_result');
      }
    } catch (searchError) {
      setResults([]);
      setError(mapCitySearchError(searchError));
    } finally {
      setIsSearching(false);
    }
  };

  const handleFinish = () => {
    if (query.trim().length === 0) {
      setError('required');
      return;
    }

    if (!city || !coordinates) {
      setError('select_result');
      return;
    }

    setError(null);
    router.push('/(auth)/phone?mode=signup');
  };

  return (
    <ProfileOnboardingStep
      currentStep={5}
      totalSteps={TOTAL_STEPS}
      title={COPY.onboarding.city.title}
      subtitle={COPY.onboarding.city.subtitle}
      errorMessage={error ? COPY.onboarding.city.errors[error] : null}
      onBack={() => router.back()}
      onNext={handleFinish}
    >
      <View style={{ gap: 12 }}>
        <OnboardingTextInput
          value={query}
          onChangeText={(text) => {
            setQuery(text);
            setError(null);
            setSelectedResultId(null);
            clearCitySelection();
          }}
          placeholder={COPY.onboarding.city.placeholder}
          autoCapitalize="words"
          returnKeyType="search"
          onSubmitEditing={handleSearch}
        />

        <Pressable
          accessibilityRole="button"
          disabled={isSearching}
          onPress={handleSearch}
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
            {isSearching ? COPY.onboarding.city.searching : COPY.onboarding.city.searchCta}
          </Text>
        </Pressable>
      </View>

      {results.length > 0 ? (
        <View style={{ gap: 10 }}>
          <Text style={{ fontFamily: FONT.medium, color: COLORS.textSecondary }}>
            {COPY.onboarding.city.selectResult}
          </Text>
          {results.map((result) => {
            const selected = selectedResultId === result.id;

            return (
              <Pressable
                key={result.id}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => {
                  setSelectedResultId(result.id);
                  setQuery(result.city);
                  setCitySelection(result.city, result.coordinates);
                  setResults([]);
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
