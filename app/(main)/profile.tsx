/* Profile tab — view and edit the user's profile and voice. */

import React from 'react';
import { Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { useFeedState } from '../../src/features/feed/hooks/useFeedState';
import MyVoiceScreen from '../../src/components/onboarding/MyVoiceScreen';
import { COPY } from '../../src/copy';
import { useAuth } from '../../src/features/auth/hooks/useAuth';

export default function ProfileRoute() {
  const router = useRouter();
  const { signOut } = useAuth();
  const { hasRecordedVoice, setHasRecordedVoice } = useFeedState();

  const handleSignOut = async () => {
    try {
      await signOut();
      setHasRecordedVoice(false);
      router.replace('/(auth)/home');
    } catch {
      Alert.alert(COPY.profile.signOutTitle, COPY.profile.signOutError);
    }
  };

  return (
    <>
      <StatusBar style="dark" />
      <MyVoiceScreen
        onBack={() => router.navigate('/(main)/discover')}
        onSend={() => router.navigate('/(main)/discover')}
        onDeleteVoice={() => {
          setHasRecordedVoice(false);
          router.push('/(auth)/record');
        }}
        onSignOut={() => {
          void handleSignOut();
        }}
        hasRecordedVoice={hasRecordedVoice}
      />
    </>
  );
}
