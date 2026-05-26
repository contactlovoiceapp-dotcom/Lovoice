/* Main tab navigator — renders the 4 primary tabs with a custom floating pill nav bar. */

import React from 'react';
import { Tabs } from 'expo-router';
import { useSegments } from 'expo-router';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';

import BottomNav from '../../src/components/BottomNav';
import { shouldHideMainTabBar } from '../../src/navigation/shouldHideMainTabBar';

function MainTabBar(props: BottomTabBarProps) {
  const segments = useSegments();

  if (shouldHideMainTabBar(segments)) {
    return null;
  }

  return <BottomNav {...props} />;
}

export default function MainLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <MainTabBar {...props} />}>
      <Tabs.Screen name="discover" />
      <Tabs.Screen name="likes" />
      <Tabs.Screen name="messages" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}
