/* Looking-for onboarding route — captures target genders as a required multi-select field. */

import React, { useState } from 'react';
import { useRouter } from 'expo-router';

import { COPY } from '@/copy';
import {
  ProfileOnboardingStep,
  SelectableOption,
} from '@/features/profile/components/ProfileOnboardingStep';
import {
  validateLookingFor,
  type GenderValue,
  type LookingForError,
} from '@/features/profile/helpers/validation';
import { useProfileOnboardingState } from '@/features/profile/hooks/useProfileOnboardingState';

const TOTAL_STEPS = 5;

const ONBOARDING_GENDERS: GenderValue[] = ['male', 'female', 'other'];

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
      currentStep={4}
      totalSteps={TOTAL_STEPS}
      title={COPY.onboarding.lookingFor.title}
      subtitle={COPY.onboarding.lookingFor.subtitle}
      errorMessage={error ? COPY.onboarding.lookingFor.errors[error] : null}
      onBack={() => router.back()}
      onNext={handleNext}
    >
      {ONBOARDING_GENDERS.map((value) => (
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
