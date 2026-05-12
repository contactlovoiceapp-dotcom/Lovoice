/* Profile tab stack — nests the profile home screen and the voice re-record route. */

import { Stack } from 'expo-router';

export default function ProfileLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
