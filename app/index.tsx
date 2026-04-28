/* App entry route — shows the brand splash then redirects to the auth flow. */

import React, { useEffect } from 'react';
import { useRouter } from 'expo-router';

import SplashScreen from '../src/components/onboarding/SplashScreen';

export default function SplashRoute() {
  const router = useRouter();

  useEffect(() => {
    const timer = setTimeout(() => {
      router.replace('/(auth)/home');
    }, 2800);
    return () => clearTimeout(timer);
  }, [router]);

  return <SplashScreen />;
}
