/* Gender onboarding route — captures the user's own gender for matching filters. */

import React, { useState } from 'react';
import { useRouter } from 'expo-router';

import { COPY } from '@/copy';
import {
  ProfileOnboardingStep,
  SelectableOption,
} from '@/features/profile/components/ProfileOnboardingStep';
import {
  GENDER_VALUES,
  validateGender,
  type GenderError,
  type GenderValue,
} from '@/features/profile/helpers/validation';
import { useProfileOnboardingState } from '@/features/profile/hooks/useProfileOnboardingState';

const TOTAL_STEPS = 5;

export default function OnboardingGenderRoute() {
  const router = useRouter();
  const gender = useProfileOnboardingState((state) => state.gender);
  const setGender = useProfileOnboardingState((state) => state.setGender);
  const [error, setError] = useState<GenderError | null>(null);

  const handleNext = () => {
    const result = validateGender(gender ?? '');

    if (!result.valid) {
      setError(result.error);
      return;
    }

    setError(null);
    router.push('/(auth)/onboarding/looking-for');
  };

  return (
    <ProfileOnboardingStep
      currentStep={3}
      totalSteps={TOTAL_STEPS}
      title={COPY.onboarding.gender.title}
      subtitle={COPY.onboarding.gender.subtitle}
      errorMessage={error ? COPY.onboarding.gender.errors[error] : null}
      onBack={() => router.back()}
      onNext={handleNext}
    >
      {GENDER_VALUES.map((value: GenderValue) => (
        <SelectableOption
          key={value}
          label={COPY.onboarding.gender.options[value]}
          selected={gender === value}
          onPress={() => {
            setGender(value);
            setError(null);
          }}
        />
      ))}
    </ProfileOnboardingStep>
  );
}
