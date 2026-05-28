/* Deep-links the user to the right screen when they tap a push notification.
   Handles both background/foreground taps and the app-killed cold-start case.

   Navigation is deferred via InteractionManager so the actual `router.push` runs
   after the current JS frame finishes — letting iOS settle its foreground
   transition (AVAudioSession reactivation, Realtime channel reconnection,
   pending UI animations) before the React tree starts mounting the
   conversation screen and allocating native audio resources. This mitigates
   a race window where concurrent native-module work can throw NSExceptions
   that get converted to JS errors on background threads, corrupting the
   Hermes runtime (see docs/CHAT_AUDIO.md and the EXC_BAD_ACCESS crashes
   observed in TestFlight builds ≤ 0.8.1). */

import { useEffect, useRef } from 'react';
import { InteractionManager } from 'react-native';
import { router } from 'expo-router';
import * as Notifications from 'expo-notifications';
import type { Href } from 'expo-router';

import { openConversation } from '@/navigation/messagesNavigation';

// Only accept internal routes we explicitly dispatch — defence against a
// compromised notification payload containing an external URL.
const ALLOWED_DEEP_LINK = /^\/likes$|^\/messages\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function extractValidDeepLink(data: Record<string, unknown>): string | null {
  const raw = data['deep_link'];
  if (typeof raw !== 'string') return null;
  if (!ALLOWED_DEEP_LINK.test(raw)) {
    console.warn('[push] Blocked unexpected deep_link value:', raw);
    return null;
  }
  return raw;
}

function extractNotificationId(data: Record<string, unknown>, fallback: string): string {
  const id = data['notification_id'];
  return typeof id === 'string' && id.length > 0 ? id : fallback;
}

export function usePushDeepLink(): void {
  // Prevents navigating twice for the same notification (covers the race
  // between getLastNotificationResponseAsync and the live listener).
  const lastHandledIdRef = useRef<string | null>(null);

  useEffect(() => {
    function handleResponse(response: Notifications.NotificationResponse): void {
      const { data } = response.notification.request.content;
      const notificationId = extractNotificationId(
        data,
        response.notification.request.identifier,
      );

      if (lastHandledIdRef.current === notificationId) return;
      lastHandledIdRef.current = notificationId;

      const deepLink = extractValidDeepLink(data);
      if (!deepLink) return;

      InteractionManager.runAfterInteractions(() => {
        if (deepLink.startsWith('/messages/')) {
          openConversation(deepLink.slice('/messages/'.length));
          return;
        }
        router.push(deepLink as Href);
      });
    }

    // Cold-start: the app was killed when the user tapped the notification.
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) handleResponse(response);
    });

    // Background: the app was already running (foreground or background) when
    // the user tapped.
    const subscription = Notifications.addNotificationResponseReceivedListener(handleResponse);

    return () => subscription.remove();
  }, []);
}
