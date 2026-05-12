/* Onboarding voice recording route — records the introduction voice, then profile setup or Discover via skip. */

import React from 'react';
import { Alert } from 'react-native';
import { useRouter } from 'expo-router';

import { COPY } from '../../../src/copy';
import RecordVoiceScreen from '../../../src/components/onboarding/RecordVoiceScreen';
import { useAuth } from '../../../src/features/auth/hooks/useAuth';

export default function RecordRoute() {
  const router = useRouter();
  const { refreshProfile } = useAuth();

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
      onNext={() => router.push('/(auth)/profile-setup')}
      onSkip={() => {
        void goToDiscover();
      }}
    />
  );
}
