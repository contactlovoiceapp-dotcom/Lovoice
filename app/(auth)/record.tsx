/* Voice recording route — standalone step where the user records their introduction voice. */

import React from 'react';
import { Alert } from 'react-native';
import { useRouter } from 'expo-router';

import { COPY } from '../../src/copy';
import RecordVoiceScreen from '../../src/components/onboarding/RecordVoiceScreen';
import { useAuth } from '../../src/features/auth/hooks/useAuth';
import { useFeedState } from '../../src/features/feed/hooks/useFeedState';

export default function RecordRoute() {
  const router = useRouter();
  const { refreshProfile } = useAuth();
  const setHasRecordedVoice = useFeedState((state) => state.setHasRecordedVoice);

  const goToDiscover = async () => {
    try {
      await refreshProfile();
      router.replace('/(main)/discover');
    } catch {
      Alert.alert(COPY.common.appName, COPY.record.profileRefreshError);
    }
  };

  return (
    <RecordVoiceScreen
      onNext={() => {
        setHasRecordedVoice(true);
        void goToDiscover();
      }}
      onSkip={() => {
        void goToDiscover();
      }}
    />
  );
}
