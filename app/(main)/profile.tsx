/* Profile tab — view and edit the user's profile and voice. */

import React from 'react';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { useFeedState } from '../../src/features/feed/hooks/useFeedState';
import MyVoiceScreen from '../../src/components/onboarding/MyVoiceScreen';

export default function ProfileRoute() {
  const router = useRouter();
  const { hasRecordedVoice, setHasRecordedVoice } = useFeedState();

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
        onDeleteProfile={() => {
          setHasRecordedVoice(false);
          router.replace('/(auth)/home');
        }}
        hasRecordedVoice={hasRecordedVoice}
      />
    </>
  );
}
