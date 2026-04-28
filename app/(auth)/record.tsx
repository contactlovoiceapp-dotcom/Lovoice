/* Voice recording route — onboarding step where the user records their introduction. */

import React from 'react';
import { useRouter } from 'expo-router';

import RecordVoiceScreen from '../../src/components/onboarding/RecordVoiceScreen';

export default function RecordRoute() {
  const router = useRouter();

  return (
    <RecordVoiceScreen
      onNext={() => router.push('/(auth)/profile-setup')}
      onSkip={() => router.replace('/(main)/discover')}
    />
  );
}
