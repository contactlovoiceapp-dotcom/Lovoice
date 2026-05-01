/* Voice recording route — standalone step where the user records their introduction voice. */

import React from 'react';
import { useRouter } from 'expo-router';

import RecordVoiceScreen from '../../src/components/onboarding/RecordVoiceScreen';
import { useFeedState } from '../../src/features/feed/hooks/useFeedState';

export default function RecordRoute() {
  const router = useRouter();
  const setHasRecordedVoice = useFeedState((state) => state.setHasRecordedVoice);

  return (
    <RecordVoiceScreen
      onNext={() => {
        setHasRecordedVoice(true);
        router.replace('/(main)/discover');
      }}
      onSkip={() => router.replace('/(main)/discover')}
    />
  );
}
