/* Name onboarding route — collects the display name before profile persistence. */

import React, { useState } from 'react';
import { useRouter } from 'expo-router';

import { COPY } from '@/copy';
import {
  OnboardingTextInput,
  ProfileOnboardingStep,
} from '@/features/profile/components/ProfileOnboardingStep';
import { useProfileOnboardingState } from '@/features/profile/hooks/useProfileOnboardingState';
import { validateDisplayName, type DisplayNameError } from '@/features/profile/helpers/validation';

const TOTAL_STEPS = 5;

export default function OnboardingNameRoute() {
  const router = useRouter();
  const displayName = useProfileOnboardingState((state) => state.displayName);
  const setDisplayName = useProfileOnboardingState((state) => state.setDisplayName);
  const [error, setError] = useState<DisplayNameError | null>(null);

  const handleNext = () => {
    const result = validateDisplayName(displayName);

    if (!result.valid) {
      setError(result.error);
      return;
    }

    setError(null);
    router.push('/(auth)/onboarding/birthdate');
  };

  return (
    <ProfileOnboardingStep
      currentStep={1}
      totalSteps={TOTAL_STEPS}
      title={COPY.onboarding.name.title}
      subtitle={COPY.onboarding.name.subtitle}
      errorMessage={error ? COPY.onboarding.name.errors[error] : null}
      onBack={() => router.back()}
      onNext={handleNext}
    >
      <OnboardingTextInput
        value={displayName}
        onChangeText={(text) => {
          setDisplayName(text);
          setError(null);
        }}
        placeholder={COPY.onboarding.name.placeholder}
        autoCapitalize="words"
        autoComplete="name"
        textContentType="givenName"
        returnKeyType="next"
        onSubmitEditing={handleNext}
      />
    </ProfileOnboardingStep>
  );
}
