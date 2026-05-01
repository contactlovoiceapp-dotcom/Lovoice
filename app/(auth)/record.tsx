/* Voice recording route — standalone step where the user records their introduction voice.
 *
 * Two entry points:
 *   1. Onboarding (no `source` param) → after recording, push to the shared profile setup.
 *   2. Profile re-record (`source=profile`) → after recording or cancellation, return to profile.
 */

import React from 'react';
import { Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { COPY } from '../../src/copy';
import RecordVoiceScreen from '../../src/components/onboarding/RecordVoiceScreen';
import { useAuth } from '../../src/features/auth/hooks/useAuth';
import { useFeedState } from '../../src/features/feed/hooks/useFeedState';

export default function RecordRoute() {
  const router = useRouter();
  const { refreshProfile } = useAuth();
  const { source } = useLocalSearchParams<{ source?: string }>();
  const setHasRecordedVoice = useFeedState((state) => state.setHasRecordedVoice);
  const fromProfile = source === 'profile';

  const goToDiscover = async () => {
    try {
      await refreshProfile();
      router.replace('/(main)/discover');
    } catch {
      Alert.alert(COPY.common.appName, COPY.record.profileRefreshError);
    }
  };

  const handleNext = () => {
    setHasRecordedVoice(true);

    if (fromProfile) {
      router.replace('/(main)/profile');
    } else {
      router.push('/(auth)/profile-setup');
    }
  };

  return (
    <RecordVoiceScreen
      onNext={handleNext}
      onSkip={fromProfile ? undefined : () => { void goToDiscover(); }}
      onCancel={fromProfile ? () => router.replace('/(main)/profile') : undefined}
    />
  );
}
