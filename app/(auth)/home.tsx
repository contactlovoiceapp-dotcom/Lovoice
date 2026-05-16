/* Landing route — delegates branding to HomeScreen and navigates to phone auth. */

import React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';

import HomeScreen from '../../src/components/onboarding/HomeScreen';
import { useHideSplash } from '../../src/lib/useHideSplash';

export default function HomeRoute() {
  const router = useRouter();
  const onSplashReady = useHideSplash();

  return (
    <View style={{ flex: 1 }} onLayout={onSplashReady}>
      <HomeScreen onConnect={() => router.push('/(auth)/phone')} />
    </View>
  );
}
