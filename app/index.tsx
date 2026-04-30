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
      if (!session) {
        router.replace('/(auth)/home');
        return;
      }

      router.replace(profile ? '/(main)/discover' : '/(auth)/onboarding/name');
    }, 2800);

    return () => clearTimeout(timer);
  }, [isLoading, profile, router, session]);

  return <SplashScreen />;
}
