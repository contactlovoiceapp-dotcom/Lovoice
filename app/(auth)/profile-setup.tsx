/* Voice profile setup route — onboarding step where new users set up their profile before entering the feed. */

import React from 'react';
import { Alert } from 'react-native';
import { useRouter } from 'expo-router';

import ProfileScreen from '../../src/components/main/ProfileScreen';
import { COPY } from '../../src/copy';
import { useAuth } from '../../src/features/auth/hooks/useAuth';
import { useFeedState } from '../../src/features/feed/hooks/useFeedState';

export default function ProfileSetupRoute() {
  const router = useRouter();
  const { refreshProfile } = useAuth();
  const setHasRecordedVoice = useFeedState((state) => state.setHasRecordedVoice);

  const handleOnboardingComplete = async () => {
    setHasRecordedVoice(true);
    try {
      await refreshProfile();
      router.replace('/(main)/discover');
    } catch {
      Alert.alert(COPY.common.appName, COPY.record.profileRefreshError);
    }
  };

  return (
    <ProfileScreen
      isOnboarding
      onOnboardingComplete={() => { void handleOnboardingComplete(); }}
    />
  );
}
