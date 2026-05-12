/* Voice re-record route reachable from the main profile screen — replaces the legacy `(auth)/record?source=profile` flow. */

import React from 'react';
import { useRouter } from 'expo-router';

import RecordVoiceScreen from '../../../src/components/onboarding/RecordVoiceScreen';

export default function ProfileRecordRoute() {
  const router = useRouter();
  const goBackToProfile = () => router.replace('/(main)/profile');

  return (
    <RecordVoiceScreen
      onNext={goBackToProfile}
      onCancel={goBackToProfile}
    />
  );
}
