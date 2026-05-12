/* Mutations for uploading a new voice (3-step pipeline) and editing the active voice's title/theme. */

import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import { File } from 'expo-file-system';

import { getSupabaseClient } from '@/lib/supabase';
import { useAuth } from '@/features/auth/hooks/useAuth';
import type {
  RequestUploadResult,
  UpdateVoiceInput,
  UploadVoiceInput,
  VoiceRow,
} from '../types';
import { voiceQueryKeys } from './voiceQueries';

const PUT_RETRY_COUNT = 3;
const PUT_RETRY_BACKOFF_MS = [0, 1000, 3000] as const;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Reads the recorded m4a file into memory and PUTs it to Storage with bounded retries.
// The signed URL is short-lived and cannot be reused after success, so retries reuse the same URL.
async function putAudioWithRetry(localUri: string, signedUrl: string): Promise<void> {
  const file = new File(localUri);
  const bytes = await file.bytes();

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < PUT_RETRY_COUNT; attempt += 1) {
    if (PUT_RETRY_BACKOFF_MS[attempt] > 0) {
      await delay(PUT_RETRY_BACKOFF_MS[attempt]);
    }

    try {
      const response = await fetch(signedUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': 'audio/mp4',
        },
        body: bytes,
      });

      if (response.ok) {
        return;
      }

      lastError = new Error(`voice.put_failed:${response.status}`);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error('voice.put_failed:network');
    }
  }

  throw lastError ?? new Error('voice.put_failed:unknown');
}

// Best-effort cleanup of the temp recording so the device doesn't accumulate orphan files.
// Failure is non-fatal: the OS evicts cache eventually anyway.
function safeDelete(localUri: string): void {
  try {
    new File(localUri).delete();
  } catch {
    // Intentionally swallowed — see comment above.
  }
}

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
        throw new Error(`voice.request_upload_failed:${requestError?.message ?? 'unknown'}`);
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
        throw new Error(`voice.commit_upload_failed:${commitError?.message ?? 'unknown'}`);
      }

      safeDelete(input.uri);

      return commitData.voice;
    },
    onSuccess: async (voice) => {
      await queryClient.invalidateQueries({ queryKey: voiceQueryKeys.active(voice.user_id) });
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
        p_title: input.title ?? null,
        p_theme: input.theme ?? null,
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
