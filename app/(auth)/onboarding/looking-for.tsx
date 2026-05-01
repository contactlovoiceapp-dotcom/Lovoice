/* Looking-for onboarding route — captures target genders as a required multi-select field. */

import React, { useState } from 'react';
import { useRouter } from 'expo-router';

import { COPY } from '@/copy';
import {
  ProfileOnboardingStep,
  SelectableOption,
} from '@/features/profile/components/ProfileOnboardingStep';
import {
  GENDER_VALUES,
  validateLookingFor,
  type GenderValue,
  type LookingForError,
} from '@/features/profile/helpers/validation';
import { useProfileOnboardingState } from '@/features/profile/hooks/useProfileOnboardingState';

const TOTAL_STEPS = 6;

export default function OnboardingLookingForRoute() {
  const router = useRouter();
  const lookingFor = useProfileOnboardingState((state) => state.lookingFor);
  const toggleLookingFor = useProfileOnboardingState((state) => state.toggleLookingFor);
  const [error, setError] = useState<LookingForError | null>(null);

  const handleNext = () => {
    const result = validateLookingFor(lookingFor);

    if (!result.valid) {
      setError(result.error);
      return;
    }

    setError(null);
    router.push('/(auth)/onboarding/city');
  };

  return (
    <ProfileOnboardingStep
      currentStep={5}
      totalSteps={TOTAL_STEPS}
      title={COPY.onboarding.lookingFor.title}
      subtitle={COPY.onboarding.lookingFor.subtitle}
      errorMessage={error ? COPY.onboarding.lookingFor.errors[error] : null}
      onBack={() => router.back()}
      onNext={handleNext}
    >
      {GENDER_VALUES.map((value: GenderValue) => (
        <SelectableOption
          key={value}
          label={COPY.onboarding.lookingFor.options[value]}
          selected={lookingFor.includes(value)}
          onPress={() => {
            toggleLookingFor(value);
            setError(null);
          }}
        />
      ))}
    </ProfileOnboardingStep>
  );
}
