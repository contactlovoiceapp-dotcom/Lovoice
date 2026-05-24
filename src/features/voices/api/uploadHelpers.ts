/* Shared helpers for the 3-step audio upload pipeline (request → PUT → commit). */

import { FunctionsHttpError } from '@supabase/supabase-js';
import { File } from 'expo-file-system';
import * as LegacyFileSystem from 'expo-file-system/legacy';

const PUT_RETRY_COUNT = 3;
const PUT_RETRY_BACKOFF_MS = [0, 1000, 3000] as const;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Edge Functions return { error: '<code>' } JSON bodies. supabase-js wraps them in a generic
// FunctionsHttpError, so we read the body to surface the precise code instead of "non-2xx".
export async function extractFunctionErrorCode(err: unknown): Promise<string> {
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

// Streams the recorded m4a file directly to the signed Storage URL with bounded retries.
// We deliberately use FileSystem.uploadAsync instead of fetch() with Uint8Array: React Native's
// fetch on Hermes mis-serialises binary bodies, which makes Storage accept the PUT (200) but
// store empty bytes — commit_upload then fails with `object_not_found`. uploadAsync delegates
// to native NSURLSession / OkHttp, which streams the file as raw binary correctly.
// The signed URL is short-lived and cannot be reused after success, so retries reuse the same URL.
export async function putAudioWithRetry(localUri: string, signedUrl: string): Promise<void> {
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
export function safeDelete(localUri: string): void {
  try {
    new File(localUri).delete();
  } catch {
    // Intentionally swallowed — see comment above.
  }
}
