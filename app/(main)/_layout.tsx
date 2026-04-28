/* Main tab navigator — renders the 4 primary tabs with a custom floating pill nav bar. */

import { Tabs } from 'expo-router';

import BottomNav from '../../src/components/BottomNav';

export default function MainLayout() {
  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <BottomNav {...props} />}
    >
      <Tabs.Screen name="discover" />
      <Tabs.Screen name="likes" />
      <Tabs.Screen name="messages" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}
