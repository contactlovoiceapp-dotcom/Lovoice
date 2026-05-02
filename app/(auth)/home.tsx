/* Landing route — delegates branding to HomeScreen and navigates to phone auth. */

import React from 'react';
import { useRouter } from 'expo-router';

import HomeScreen from '../../src/components/onboarding/HomeScreen';

export default function HomeRoute() {
  const router = useRouter();

  return <HomeScreen onConnect={() => router.push('/(auth)/phone')} />;
}
