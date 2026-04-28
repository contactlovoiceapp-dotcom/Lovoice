/* Profile setup route — onboarding wizard for name, age, gender, preferences. */

import React from 'react';
import { useRouter } from 'expo-router';

import MyVoiceScreen from '../../src/components/onboarding/MyVoiceScreen';
import { useFeedState } from '../../src/features/feed/hooks/useFeedState';

export default function ProfileSetupRoute() {
  const router = useRouter();
  const setHasRecordedVoice = useFeedState((state) => state.setHasRecordedVoice);

  return (
    <MyVoiceScreen
      onBack={() => router.back()}
      onSend={() => {
        setHasRecordedVoice(true);
        router.replace('/(main)/discover');
      }}
      onDeleteVoice={() => {
        setHasRecordedVoice(false);
        router.replace('/(auth)/record');
      }}
      hasRecordedVoice
      isOnboarding
    />
  );
}
