/* Mutation: submit a report for a voice / message / profile target. */

import { useMutation, type UseMutationResult } from '@tanstack/react-query';

import { getSupabaseClient } from '@/lib/supabase';
import type { Database } from '@/types/database';
import type { ReportInput } from '../types';

type ReportInsertRow = Database['public']['Tables']['reports']['Insert'];

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

      // Build the row per targetKind: the reports table CHECK requires at least
      // one of target_user_id / target_voice_id / target_message_id to be non-null.
      const baseRow: ReportInsertRow = {
        reporter_id: uid,
        reason,
        free_text: trimmedText,
      };

      let row: ReportInsertRow;
      if (targetKind === 'voice') {
        row = { ...baseRow, target_voice_id: targetId, target_user_id: targetUserId };
      } else if (targetKind === 'message') {
        row = { ...baseRow, target_message_id: targetId };
      } else {
        row = { ...baseRow, target_user_id: targetId };
      }

      const { error } = await supabase.from('reports').insert(row);

      if (error) {
        throw new Error(error.message);
      }
    },
  });
}
