/* Profile onboarding stack — groups the multi-step wizard without headers. */

import { Stack } from 'expo-router';

export default function ProfileOnboardingLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
