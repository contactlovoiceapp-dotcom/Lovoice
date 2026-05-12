/* Voice re-record route reachable from the main profile screen — replaces the legacy `(auth)/record?source=profile` flow. */

import React from 'react';
import { useRouter } from 'expo-router';

import RecordVoiceScreen from '../../../src/components/onboarding/RecordVoiceScreen';
import { useFeedState } from '../../../src/features/feed/hooks/useFeedState';

export default function ProfileRecordRoute() {
  const router = useRouter();
  const setHasRecordedVoice = useFeedState((state) => state.setHasRecordedVoice);

  const handleNext = () => {
    setHasRecordedVoice(true);
    router.replace('/(main)/profile');
  };

  return (
    <RecordVoiceScreen
      onNext={handleNext}
      onCancel={() => router.replace('/(main)/profile')}
    />
  );
}
