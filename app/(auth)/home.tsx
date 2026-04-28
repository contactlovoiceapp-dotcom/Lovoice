/* Landing screen route — delegates to HomeScreen component with expo-router navigation. */

import React from 'react';
import { useRouter } from 'expo-router';

import HomeScreen from '../../src/components/onboarding/HomeScreen';

export default function HomeRoute() {
  const router = useRouter();

  return (
    <HomeScreen
      onSignUp={() => router.push('/(auth)/phone?mode=signup')}
      onLogin={() => router.push('/(auth)/phone?mode=login')}
    />
  );
}
