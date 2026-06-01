/* Mutations for RGPD data-export requests (queued for manual fulfillment by the operations team). */

import { useMutation, type UseMutationResult } from '@tanstack/react-query';

import { getSupabaseClient } from '@/lib/supabase';

type PostgrestErrorLike = { code?: string; message?: string } | null;

/** Maps a Supabase insert error to a stable client error code. */
export function mapDataExportError(error: PostgrestErrorLike): string {
  if (error?.code === '23505') {
    return 'export.already_pending';
  }
  return 'export.request_failed';
}

export function useRequestDataExport(): UseMutationResult<void, Error, void> {
  return useMutation({
    mutationFn: async (): Promise<void> => {
      const supabase = getSupabaseClient();

      if (!supabase) {
        throw new Error('export.request_failed');
      }

      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        throw new Error('export.request_failed');
      }

      const { error } = await supabase.from('data_export_requests').insert({
        user_id: user.id,
      });

      if (error) {
        throw new Error(mapDataExportError(error));
      }
    },
  });
}
