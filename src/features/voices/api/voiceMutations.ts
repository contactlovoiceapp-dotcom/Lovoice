/* Mutations for uploading a new voice (3-step pipeline) and editing the active voice's title/theme. */

import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { File } from 'expo-file-system';
import * as LegacyFileSystem from 'expo-file-system/legacy';

import { getSupabaseClient } from '@/lib/supabase';
import { useAuth } from '@/features/auth/hooks/useAuth';
import type {
  RequestUploadResult,
  UpdateVoiceInput,
  UploadVoiceInput,
  VoiceRow,
} from '../types';
import { voiceQueryKeys } from './voiceQueries';

// Edge Functions return { error: '<code>' } JSON bodies. supabase-js wraps them in a generic
// FunctionsHttpError, so we read the body to surface the precise code instead of "non-2xx".
async function extractFunctionErrorCode(err: unknown): Promise<string> {
  if (err instanceof FunctionsHttpError) {
    try {
      const body = (await err.context.json()) as { error?: string } | null;
      if (body?.error) return body.error;
    } catch {
      // Body wasn't JSON or already consumed — fall through.
    }
  }
  if (err instanceof Error) return err.message;
  return 'unknown';
}

const PUT_RETRY_COUNT = 3;
const PUT_RETRY_BACKOFF_MS = [0, 1000, 3000] as const;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Streams the recorded m4a file directly to the signed Storage URL with bounded retries.
// We deliberately use FileSystem.uploadAsync instead of fetch() with Uint8Array: React Native's
// fetch on Hermes mis-serialises binary bodies, which makes Storage accept the PUT (200) but
// store empty bytes — commit_upload then fails with `object_not_found`. uploadAsync delegates
// to native NSURLSession / OkHttp, which streams the file as raw binary correctly.
// The signed URL is short-lived and cannot be reused after success, so retries reuse the same URL.
async function putAudioWithRetry(localUri: string, signedUrl: string): Promise<void> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < PUT_RETRY_COUNT; attempt += 1) {
    if (PUT_RETRY_BACKOFF_MS[attempt] > 0) {
      await delay(PUT_RETRY_BACKOFF_MS[attempt]);
    }

    try {
      const result = await LegacyFileSystem.uploadAsync(signedUrl, localUri, {
        httpMethod: 'PUT',
        uploadType: LegacyFileSystem.FileSystemUploadType.BINARY_CONTENT,
        headers: { 'Content-Type': 'audio/mp4' },
      });

      if (result.status >= 200 && result.status < 300) {
        return;
      }

      lastError = new Error(`voice.put_failed:${result.status}`);
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
