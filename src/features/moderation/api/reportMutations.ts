/* Mutation: submit a report for a voice / message / profile target. */

import { useMutation, type UseMutationResult } from '@tanstack/react-query';

import { getSupabaseClient } from '@/lib/supabase';
import type { ReportInput } from '../types';

export function useReportContent(): UseMutationResult<void, Error, ReportInput> {
  return useMutation<void, Error, ReportInput>({
    mutationFn: async ({ targetKind, targetId, targetUserId, reason, freeText }) => {
      const supabase = getSupabaseClient();
      if (!supabase) {
        throw new Error('moderation.supabase_unavailable');
      }

      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user?.id) {
        throw new Error('moderation.session_missing');
      }

      const uid = userData.user.id;
      const trimmedText = freeText.trim() || null;

      let row: Record<string, string | null>;

      if (targetKind === 'voice') {
        row = {
          reporter_id: uid,
          target_voice_id: targetId,
          target_user_id: targetUserId,
          reason,
          free_text: trimmedText,
        };
      } else if (targetKind === 'message') {
        row = {
          reporter_id: uid,
          target_message_id: targetId,
          reason,
          free_text: trimmedText,
        };
      } else {
        row = {
          reporter_id: uid,
          target_user_id: targetId,
          reason,
          free_text: trimmedText,
        };
      }

      const { error } = await supabase.from('reports').insert(row);

      if (error) {
        throw new Error(error.message);
      }
    },
  });
}
