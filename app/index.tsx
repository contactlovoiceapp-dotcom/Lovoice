/* App entry route — shows the brand splash then redirects based on auth + profile state. */

import React, { useEffect } from 'react';
import { useRouter } from 'expo-router';

import SplashScreen from '../src/components/onboarding/SplashScreen';
import { useAuth } from '../src/features/auth/hooks/useAuth';

const SPLASH_DURATION_MS = 2800;

export default function SplashRoute() {
  const router = useRouter();
  const { session, profile, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading) {
      return undefined;
    }

    const timer = setTimeout(() => {
      if (session && profile) {
        router.replace('/(main)/discover');
        return;
      }

      // Session without a profile means OTP succeeded but signup never completed.
      // Resume from the first wizard step — the in-memory wizard state is wiped on
      // app restart, so jumping to a later step would skip required validations.
      if (session && !profile) {
        router.replace('/(auth)/onboarding/name');
        return;
      }

      router.replace('/(auth)/home');
    }, SPLASH_DURATION_MS);

    return () => clearTimeout(timer);
  }, [isLoading, profile, router, session]);

  return <SplashScreen />;
}
