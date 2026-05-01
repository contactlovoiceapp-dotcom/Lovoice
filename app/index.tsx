/* App entry route — shows the brand splash then redirects to the auth flow. */

import React, { useEffect } from 'react';
import { useRouter } from 'expo-router';

import SplashScreen from '../src/components/onboarding/SplashScreen';
import { useAuth } from '../src/features/auth/hooks/useAuth';

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

      // Authenticated but profile incomplete (returning user who never finished signup):
      // resume the wizard instead of dumping them on a phone-entry screen they can't use.
      if (session && !profile) {
        router.replace('/(auth)/onboarding/name');
        return;
      }

      router.replace('/(auth)/home');
    }, 2800);

    return () => clearTimeout(timer);
  }, [isLoading, profile, router, session]);

  return <SplashScreen />;
}
