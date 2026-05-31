/* Main tab navigator — renders the 4 primary tabs with a custom floating pill nav bar.
   Mounts global side-effect hooks shared across all tabs:
   - useRealtimeInbox: keeps the message badge live via Supabase Realtime
   - useRealtimeLikes: keeps the likes badge live via Supabase Realtime
   - useConversationRealtimeHost: owns the active conv:<id> channel at session scope
     so it survives screen mount/unmount (no re-subscribe churn on notification taps)
   - usePushRegistration: stores the device Expo Push Token on login
   - usePushDeepLink: navigates to the right screen when the user taps a notification
   - useAppIconBadge: syncs the OS app icon badge with unread/unseen counts */

import React from 'react';
import { Tabs } from 'expo-router';
import { useSegments } from 'expo-router';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';

import BottomNav from '../../src/components/BottomNav';
import { shouldHideMainTabBar } from '../../src/navigation/shouldHideMainTabBar';
import { useRealtimeInbox } from '../../src/features/chat/hooks/useRealtimeInbox';
import { useRealtimeLikes } from '../../src/features/likes/hooks/useRealtimeLikes';
import { useConversationRealtimeHost } from '../../src/features/chat/hooks/useConversationRealtimeHost';
import { usePushRegistration } from '../../src/features/push/hooks/usePushRegistration';
import { usePushDeepLink } from '../../src/features/push/hooks/usePushDeepLink';
import { useAppIconBadge } from '../../src/features/push/hooks/useAppIconBadge';

function MainTabBar(props: BottomTabBarProps) {
  const segments = useSegments();

  if (shouldHideMainTabBar(segments)) {
    return null;
  }

  return <BottomNav {...props} />;
}

export default function MainLayout() {
  useRealtimeInbox();
  useRealtimeLikes();
  useConversationRealtimeHost();
  usePushRegistration();
  usePushDeepLink();
  useAppIconBadge();

  return (
    <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <MainTabBar {...props} />}>
      <Tabs.Screen name="discover" />
      <Tabs.Screen name="likes" />
      <Tabs.Screen name="messages" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}
