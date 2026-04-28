/* Auth stack layout — headerless stack for onboarding and login screens. */

import { Stack } from 'expo-router';

export default function AuthLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
