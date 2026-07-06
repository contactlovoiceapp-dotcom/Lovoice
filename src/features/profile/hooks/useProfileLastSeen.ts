/* Best-effort heartbeat that mirrors the user's app activity to profiles.last_seen_at. */

import { useEffect, useRef } from 'react';
import { AppState, InteractionManager } from 'react-native';

import { getSupabaseClient } from '@/lib/supabase';

const PING_INTERVAL_MS = 5 * 60 * 1000;

async function persistLastSeenAt(iso: string): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) return;

  const { data } = await supabase.auth.getSession();
  const uid = data.session?.user.id;
  if (!uid) return;

  await supabase.from('profiles').update({ last_seen_at: iso }).eq('id', uid);
}

export function useProfileLastSeen(): void {
  const lastPingAtRef = useRef(0);

  useEffect(() => {
    const ping = () => {
      const now = Date.now();
      if (now - lastPingAtRef.current < PING_INTERVAL_MS) return;
      lastPingAtRef.current = now;

      const iso = new Date().toISOString();
      persistLastSeenAt(iso).catch(() => {
        // Best-effort presence marker; retried on the next foreground transition.
      });
    };

    InteractionManager.runAfterInteractions(() => {
      ping();
    });

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active') return;
      InteractionManager.runAfterInteractions(() => {
        ping();
      });
    });

    return () => subscription.remove();
  }, []);
}
