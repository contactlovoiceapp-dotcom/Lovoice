/* Mutation: block a user. Invalidates feed and likes on success. */

import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';

import { getSupabaseClient } from '@/lib/supabase';
import { feedQueryKeys } from '@/features/feed/api/feedQueries';
import { likeQueryKeys } from '@/features/likes/api/likeQueries';
import type { BlockInput } from '../types';

export function useBlockUser(): UseMutationResult<void, Error, BlockInput> {
  const queryClient = useQueryClient();

  return useMutation<void, Error, BlockInput>({
    mutationFn: async ({ blockedUserId }) => {
      const supabase = getSupabaseClient();
      if (!supabase) {
        throw new Error('moderation.supabase_unavailable');
      }

      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user?.id) {
        throw new Error('moderation.session_missing');
      }

      const uid = userData.user.id;

      const { error } = await supabase
        .from('blocks')
        .insert({ blocker_id: uid, blocked_id: blockedUserId });

      if (error) {
        // UNIQUE(blocker_id, blocked_id) violation — already blocked, treat as success.
        if (error.code === '23505') return;
        throw new Error(error.message);
      }
    },

    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: feedQueryKeys.all }),
        queryClient.invalidateQueries({ queryKey: likeQueryKeys.all }),
      ]);
    },
  });
}
