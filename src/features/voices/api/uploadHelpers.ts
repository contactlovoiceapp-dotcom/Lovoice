/* Shared helpers for the 3-step audio upload pipeline (request → PUT → commit). */

import { FunctionsHttpError } from '@supabase/supabase-js';
import { File } from 'expo-file-system';
import * as LegacyFileSystem from 'expo-file-system/legacy';

// m4a files contain at least a header (ftyp box + moov box); anything below 100 bytes
// is almost certainly an empty or corrupt file. A 1-second recording at 32 kbps
// mono is ~4 KB so this is a generous lower bound.
const MIN_AUDIO_FILE_BYTES = 100;

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
  // Pre-flight: verify the local file exists and is large enough to be a valid audio
  // file. Without this guard an empty/corrupt recording would upload "successfully"
  // (Supabase Storage accepts any PUT body) and produce a message whose voice can
  // never be played back.
  try {
    const localFile = new File(localUri);
    if (!localFile.exists) {
      throw new Error('voice.put_failed:local_file_missing');
    }
    const info = localFile.size;
    if (info === undefined || info === null || info < MIN_AUDIO_FILE_BYTES) {
      console.warn('[upload] Local audio file too small, likely corrupt', {
        uri: localUri,
        size: info,
      });
      throw new Error(`voice.put_failed:file_too_small:${info ?? 0}`);
    }
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('voice.put_failed:')) throw err;
    console.warn('[upload] Pre-flight file check failed', err);
    throw new Error('voice.put_failed:preflight_check_error');
  }

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
