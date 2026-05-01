/* Birthdate onboarding route — blocks underage profiles before the server trigger is reached. */

import React, { useState } from 'react';
import { useRouter } from 'expo-router';

import { COPY } from '@/copy';
import {
  OnboardingTextInput,
  ProfileOnboardingStep,
} from '@/features/profile/components/ProfileOnboardingStep';
import {
  formatBirthdateInput,
  frenchBirthdateToIso,
} from '@/features/profile/helpers/birthdateInput';
import { validateAge, type BirthdateError } from '@/features/profile/helpers/validation';
import { useProfileOnboardingState } from '@/features/profile/hooks/useProfileOnboardingState';

const TOTAL_STEPS = 5;

export default function OnboardingBirthdateRoute() {
  const router = useRouter();
  const birthdate = useProfileOnboardingState((state) => state.birthdate);
  const setBirthdate = useProfileOnboardingState((state) => state.setBirthdate);
  const [error, setError] = useState<BirthdateError | null>(null);

  const handleNext = () => {
    const isoBirthdate = frenchBirthdateToIso(birthdate);
    const result = validateAge(isoBirthdate ?? birthdate);

    if (!result.valid) {
      setError(result.error);
      return;
    }

    setError(null);
    router.push('/(auth)/onboarding/gender');
  };

  return (
    <ProfileOnboardingStep
      currentStep={2}
      totalSteps={TOTAL_STEPS}
      title={COPY.onboarding.birthdate.title}
      subtitle={COPY.onboarding.birthdate.subtitle}
      errorMessage={error ? COPY.onboarding.birthdate.errors[error] : null}
      onBack={() => router.back()}
      onNext={handleNext}
    >
      <OnboardingTextInput
        value={birthdate}
        onChangeText={(text) => {
          setBirthdate(formatBirthdateInput(text));
          setError(null);
        }}
        placeholder={COPY.onboarding.birthdate.placeholder}
        keyboardType="number-pad"
        maxLength={14}
        returnKeyType="next"
        onSubmitEditing={handleNext}
      />
    </ProfileOnboardingStep>
  );
}
