/* Best-effort sync of device and app metadata to profiles on session start. */

import { useEffect, useRef } from 'react';

import { useAuth } from '@/features/auth/hooks/useAuth';
import { clientInfoMatchesProfile, collectClientInfo } from '@/lib/clientInfo';
import { getSupabaseClient } from '@/lib/supabase';

export function useClientInfoSync(): void {
  const { session, profile } = useAuth();
  const userId = session?.user?.id;
  const profileId = profile?.id;
  const hasRunRef = useRef(false);

  useEffect(() => {
    if (!userId || !profileId || !profile) {
      hasRunRef.current = false;
      return;
    }

    if (hasRunRef.current) return;
    hasRunRef.current = true;

    void (async () => {
      const payload = collectClientInfo();

      if (clientInfoMatchesProfile(payload, profile)) return;

      const supabase = getSupabaseClient();
      if (!supabase) return;

      const { error } = await supabase
        .from('profiles')
        .update({
          ...payload,
          client_info_updated_at: new Date().toISOString(),
        })
        .eq('id', userId);

      if (error) {
        console.warn('[clientInfo] Failed to store device metadata:', error.message);
      }
    })();
  }, [userId, profileId, profile]);
}
