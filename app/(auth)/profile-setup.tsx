/* Voice profile setup route — lets new users review and decorate their recorded voice. */

import React from 'react';
import { Alert } from 'react-native';
import { useRouter } from 'expo-router';

import MyVoiceScreen from '../../src/components/onboarding/MyVoiceScreen';
import { COPY } from '../../src/copy';
import { useAuth } from '../../src/features/auth/hooks/useAuth';
import { useFeedState } from '../../src/features/feed/hooks/useFeedState';

export default function ProfileSetupRoute() {
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
    <MyVoiceScreen
      onBack={() => router.back()}
      onSend={() => {
        setHasRecordedVoice(true);
        void goToDiscover();
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
