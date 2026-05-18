/* Mutations for the Discover feed: mark voices as seen (batch) and reset all seen history. */

import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';

import { getSupabaseClient } from '@/lib/supabase';
import { feedQueryKeys } from './feedQueries';

export interface MarkFeedSeenInput {
  voiceIds: string[];
}

export function useMarkFeedSeen(): UseMutationResult<void, Error, MarkFeedSeenInput> {
  return useMutation({
    mutationFn: async ({ voiceIds }) => {
      // Skip the round-trip entirely when the caller passes an empty batch.
      if (voiceIds.length === 0) return;

      const supabase = getSupabaseClient();
      if (!supabase) {
        throw new Error('feed.supabase_unavailable');
      }

      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user?.id) {
        throw new Error('feed.session_missing');
      }

      const uid = userData.user.id;
      const rows = voiceIds.map((voice_id) => ({ user_id: uid, voice_id }));

      // ignoreDuplicates keeps this idempotent: if a row already exists (e.g. duplicate batch),
      // the RLS policy still guards it while the server silently drops the conflict.
      const { error } = await supabase
        .from('feed_seen')
        .upsert(rows, { onConflict: 'user_id,voice_id', ignoreDuplicates: true });

      if (error) {
        throw new Error(error.message);
      }
    },
    // No feed invalidation on success — seen rows are excluded server-side on the next page
    // fetch only. Invalidating here would cause a mid-session feed re-shuffle on every flush.
  });
}

export function useResetFeedSeen(): UseMutationResult<void, Error, void> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const supabase = getSupabaseClient();
      if (!supabase) {
        throw new Error('feed.supabase_unavailable');
      }

      const { error } = await supabase.rpc('reset_feed_seen');
      if (error) {
        throw new Error(error.message);
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: feedQueryKeys.all });
    },
  });
}
