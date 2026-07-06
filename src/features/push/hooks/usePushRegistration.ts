/* Registers the device for push notifications when an authenticated profile becomes
   available, and writes the resulting Expo Push Token to profiles.push_token. */

import { useEffect, useRef } from 'react';

import { useAuth } from '@/features/auth/hooks/useAuth';
import { getSupabaseClient } from '@/lib/supabase';
import { registerForPushNotificationsAsync } from '@/lib/push';

export function usePushRegistration(): void {
  const { session, profile } = useAuth();
  const userId = session?.user?.id;
  const profileId = profile?.id;
  const pushToken = profile?.push_token ?? null;
  // Tracks whether we already ran for the current (session, profile) pair so we
  // don't fire on every re-render. Resets when the user or push_token changes.
  const hasRunRef = useRef(false);

  useEffect(() => {
    if (!userId || !profileId) {
      hasRunRef.current = false;
      return;
    }

    if (hasRunRef.current) return;

    hasRunRef.current = true;

    void (async () => {
      const token = await registerForPushNotificationsAsync();

      if (!token) return;

      // Skip the update when the token already matches what's stored — avoids
      // a write on every app launch once the token is stable.
      if (token === pushToken) return;

      const supabase = getSupabaseClient();

      if (!supabase) return;

      const { error } = await supabase
        .from('profiles')
        .update({ push_token: token })
        .eq('id', userId);

      if (error) {
        console.warn('[push] Failed to store push token:', error.message);
      }
    })();
  }, [userId, profileId, pushToken]);
}
