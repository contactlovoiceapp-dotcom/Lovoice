/* Mutations for uploading a new voice (3-step pipeline) and editing the active voice's title/theme. */

import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';

import { getSupabaseClient } from '@/lib/supabase';
import { useAuth } from '@/features/auth/hooks/useAuth';
import type {
  RequestUploadResult,
  UpdateVoiceInput,
  UploadVoiceInput,
  VoiceRow,
} from '../types';
import { voiceQueryKeys } from './voiceQueries';
import { extractFunctionErrorCode, putAudioWithRetry, safeDelete } from './uploadHelpers';

export { extractFunctionErrorCode, putAudioWithRetry, safeDelete };

export function useUploadVoice(): UseMutationResult<VoiceRow, Error, UploadVoiceInput> {
  const queryClient = useQueryClient();
  const { session } = useAuth();

  return useMutation({
    mutationFn: async (input: UploadVoiceInput): Promise<VoiceRow> => {
      if (!session) {
        throw new Error('voice.session_missing');
      }

      const supabase = getSupabaseClient();

      if (!supabase) {
        throw new Error('voice.supabase_unavailable');
      }

      const { data: requestData, error: requestError } = await supabase.functions.invoke<RequestUploadResult>(
        'request_upload',
        {
          body: {
            kind: 'voice',
            durationMs: input.durationMs,
          },
        },
      );

      if (requestError || !requestData) {
        const code = await extractFunctionErrorCode(requestError);
        throw new Error(`voice.request_upload_failed:${code}`);
      }

      await putAudioWithRetry(input.uri, requestData.signedUrl);

      const { data: commitData, error: commitError } = await supabase.functions.invoke<{ voice: VoiceRow }>(
        'commit_upload',
        {
          body: {
            kind: 'voice',
            objectPath: requestData.objectPath,
            durationMs: input.durationMs,
            promptId: input.promptId ?? null,
            title: input.title ?? null,
            theme: input.theme ?? null,
          },
        },
      );

      if (commitError || !commitData?.voice) {
        const code = await extractFunctionErrorCode(commitError);
        throw new Error(`voice.commit_upload_failed:${code}`);
      }

      safeDelete(input.uri);

      return commitData.voice;
    },
    onSuccess: async (voice) => {
      await queryClient.invalidateQueries({ queryKey: voiceQueryKeys.active(voice.user_id) });
    },
  });
}

export function useDeleteVoice(): UseMutationResult<void, Error, { voiceId: string; userId: string }> {
  const queryClient = useQueryClient();
  const { session } = useAuth();

  return useMutation({
    mutationFn: async ({ voiceId }) => {
      if (!session) {
        throw new Error('voice.session_missing');
      }

      const supabase = getSupabaseClient();

      if (!supabase) {
        throw new Error('voice.supabase_unavailable');
      }

      const { data, error } = await supabase.rpc('delete_own_voice', {
        p_voice_id: voiceId,
      });

      if (error) {
        throw new Error(error.message);
      }

      if (!data) {
        throw new Error('voice.not_found');
      }
    },
    onSuccess: async (_result, { userId }) => {
      await queryClient.invalidateQueries({ queryKey: voiceQueryKeys.active(userId) });
    },
  });
}

export function useUpdateVoice(): UseMutationResult<VoiceRow, Error, UpdateVoiceInput> {
  const queryClient = useQueryClient();
  const { session } = useAuth();

  return useMutation({
    mutationFn: async (input: UpdateVoiceInput): Promise<VoiceRow> => {
      if (!session) {
        throw new Error('voice.session_missing');
      }

      const supabase = getSupabaseClient();

      if (!supabase) {
        throw new Error('voice.supabase_unavailable');
      }

      const { data, error } = await supabase.rpc('update_own_voice', {
        p_voice_id: input.voiceId,
        // Supabase type generator omits DEFAULT NULL — cast to satisfy the strict signature.
        p_title: (input.title ?? null) as string,
        p_theme: (input.theme ?? null) as string,
      });

      if (error) {
        throw new Error(error.message);
      }

      const updated = Array.isArray(data) ? data[0] : data;

      if (!updated) {
        throw new Error('voice.not_found');
      }

      return updated as VoiceRow;
    },
    onSuccess: async (voice) => {
      await queryClient.invalidateQueries({ queryKey: voiceQueryKeys.active(voice.user_id) });
    },
  });
}
