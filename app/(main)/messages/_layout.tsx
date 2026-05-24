/* Messages tab stack — nests the inbox and the individual conversation screen. */

import { Stack } from 'expo-router';

export default function MessagesLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
