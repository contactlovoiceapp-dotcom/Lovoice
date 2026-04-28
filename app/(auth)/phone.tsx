/* Phone verification route — handles both signup and login flows via query param. */

import React from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';

import PhoneScreen from '../../src/components/onboarding/PhoneScreen';

export default function PhoneRoute() {
  const router = useRouter();
  const { mode } = useLocalSearchParams<{ mode?: string }>();

  const handleNext = () => {
    if (mode === 'login') {
      router.replace('/(main)/discover');
    } else {
      router.push('/(auth)/record');
    }
  };

  return (
    <PhoneScreen
      onNext={handleNext}
      onBack={() => router.back()}
    />
  );
}
