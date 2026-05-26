/* Main tab navigator — renders the 4 primary tabs with a custom floating pill nav bar.
   Also mounts the global Realtime inbox listener so push badge updates work on all tabs,
   and the push registration hook so the device token is stored on login. */

import React from 'react';
import { Tabs } from 'expo-router';
import { useSegments } from 'expo-router';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';

import BottomNav from '../../src/components/BottomNav';
import { shouldHideMainTabBar } from '../../src/navigation/shouldHideMainTabBar';
import { useRealtimeInbox } from '../../src/features/chat/hooks/useRealtimeInbox';
import { usePushRegistration } from '../../src/features/push/hooks/usePushRegistration';

function MainTabBar(props: BottomTabBarProps) {
  const segments = useSegments();

  if (shouldHideMainTabBar(segments)) {
    return null;
  }

  return <BottomNav {...props} />;
}

export default function MainLayout() {
  useRealtimeInbox();
  usePushRegistration();

  return (
    <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <MainTabBar {...props} />}>
      <Tabs.Screen name="discover" />
      <Tabs.Screen name="likes" />
      <Tabs.Screen name="messages" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}
