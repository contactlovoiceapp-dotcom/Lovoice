/* Mutation: submit a report for a voice / message / profile target, then block the reported user. */

import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';

import { feedQueryKeys } from '@/features/feed/api/feedQueries';
import { likeQueryKeys } from '@/features/likes/api/likeQueries';
import { getSupabaseClient } from '@/lib/supabase';
import type { Database } from '@/types/database';
import type { ReportInput } from '../types';

type ReportInsertRow = Database['public']['Tables']['reports']['Insert'];

async function resolveReportedUserId(input: ReportInput): Promise<string | null> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error('moderation.supabase_unavailable');
  }

  const { targetKind, targetId, targetUserId } = input;

  if (targetKind === 'voice') {
    if (!targetUserId) {
      throw new Error('moderation.report_voice_missing_author');
    }
    return targetUserId;
  }

  if (targetKind === 'profile') {
    return targetId;
  }

  if (targetUserId) {
    return targetUserId;
  }

  const { data, error } = await supabase
    .from('messages')
    .select('sender_id')
    .eq('id', targetId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  const senderId = data?.sender_id;
  if (!senderId || typeof senderId !== 'string') {
    throw new Error('moderation.report_message_sender_missing');
  }

  return senderId;
}

export function useReportContent(): UseMutationResult<void, Error, ReportInput> {
  const queryClient = useQueryClient();

  return useMutation<void, Error, ReportInput>({
    mutationFn: async (input) => {
      const supabase = getSupabaseClient();
      if (!supabase) {
        throw new Error('moderation.supabase_unavailable');
      }

      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user?.id) {
        throw new Error('moderation.session_missing');
      }

      const uid = userData.user.id;
      const { targetKind, targetId, targetUserId, reason, freeText } = input;
      const trimmedText = freeText.trim() || null;

      const blockedUserId = await resolveReportedUserId(input);

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

      const { error: reportError } = await supabase.from('reports').insert(row);

      if (reportError) {
        throw new Error(reportError.message);
      }

      if (blockedUserId && blockedUserId !== uid) {
        const { error: blockError } = await supabase
          .from('blocks')
          .insert({ blocker_id: uid, blocked_id: blockedUserId });

        if (blockError && blockError.code !== '23505') {
          throw new Error(blockError.message);
        }
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
