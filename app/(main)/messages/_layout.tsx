/* Messages tab stack — nests the inbox and the individual conversation screen. */

import { Stack } from 'expo-router';

// Ensures messages/index is always the root of the stack, even when navigating
// directly to a conversation from another tab (e.g. Discover). Without this,
// the stack starts with only [id] and router.back() escapes to the caller tab.
export const unstable_settings = {
  initialRouteName: 'index',
};

export default function MessagesLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
