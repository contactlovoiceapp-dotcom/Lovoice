/* Mutations for RGPD data-export requests (queued for manual fulfillment by the operations team). */

import { useMutation, type UseMutationResult } from '@tanstack/react-query';

import { getSupabaseClient } from '@/lib/supabase';
import {
  isValidContactEmail,
  normalizeContactEmail,
} from '@/features/profile/helpers/contactEmail';

export type RequestDataExportInput = {
  contactEmail: string;
};

type PostgrestErrorLike = { code?: string; message?: string } | null;

/** Maps a Supabase insert error to a stable client error code. */
export function mapDataExportError(error: PostgrestErrorLike): string {
  if (error?.code === '23505') {
    return 'export.already_pending';
  }
  return 'export.request_failed';
}

export function useRequestDataExport(): UseMutationResult<void, Error, RequestDataExportInput> {
  return useMutation({
    mutationFn: async ({ contactEmail }: RequestDataExportInput): Promise<void> => {
      if (!isValidContactEmail(contactEmail)) {
        throw new Error('export.email_invalid');
      }

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
        contact_email: normalizeContactEmail(contactEmail),
      });

      if (error) {
        throw new Error(mapDataExportError(error));
      }
    },
  });
}
