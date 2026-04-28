/* Profile setup route — onboarding wizard for name, age, gender, preferences. */

import React from 'react';
import { useRouter } from 'expo-router';

import MyVoiceScreen from '../../src/components/onboarding/MyVoiceScreen';

export default function ProfileSetupRoute() {
  const router = useRouter();

  return (
    <MyVoiceScreen
      onBack={() => router.back()}
      onSend={() => router.replace('/(main)/discover')}
      onDeleteVoice={() => router.replace('/(auth)/record')}
      hasRecordedVoice
      isOnboarding
    />
  );
}
