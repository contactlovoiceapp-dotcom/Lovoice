// Normalizes Postgres trigger and Edge Function rate-limit errors into stable client codes and COPY keys.

import { COPY } from '@/copy';

export const RATE_LIMIT_ERROR = 'rate_limit_exceeded';

export type RateLimitCopyKey = keyof typeof COPY.rateLimit;

const DOMAIN_ERROR_CODE = {
  like: 'likes.rate_limit_exceeded',
  report: 'moderation.rate_limit_exceeded',
  uploadVoice: 'voice.rate_limit_exceeded',
  uploadMessage: 'chat.rate_limit_exceeded',
} as const satisfies Record<RateLimitCopyKey, string>;

export type RateLimitDomain = keyof typeof DOMAIN_ERROR_CODE;

/** True when a Postgres or Edge Function payload signals a rate limit. */
export function isRateLimitError(message: string): boolean {
  return message.includes(RATE_LIMIT_ERROR);
}

/** Maps a raw Supabase/Edge error message to a stable Error code, or preserves the original text. */
export function toRateLimitAwareError(rawMessage: string, domain: RateLimitDomain): Error {
  if (isRateLimitError(rawMessage)) {
    return new Error(DOMAIN_ERROR_CODE[domain]);
  }
  return new Error(rawMessage);
}

/** True when an Error from our mutations carries a mapped rate-limit code. */
export function isMappedRateLimitError(err: Error): boolean {
  return (Object.values(DOMAIN_ERROR_CODE) as string[]).includes(err.message);
}

/** Resolves user-facing French copy from a mutation error, falling back when not rate-limited. */
export function getRateLimitUserMessage(
  err: Error | null | undefined,
  domain: RateLimitDomain,
  fallback: string,
): string {
  if (!err) return fallback;
  if (isMappedRateLimitError(err) || isRateLimitError(err.message)) {
    return COPY.rateLimit[domain];
  }
  return fallback;
}

/** Maps an Edge Function upload error code to a stable client error when rate-limited. */
export function mapUploadFunctionErrorCode(
  code: string,
  domain: Extract<RateLimitDomain, 'uploadVoice' | 'uploadMessage'>,
): string {
  if (code === RATE_LIMIT_ERROR) {
    return DOMAIN_ERROR_CODE[domain];
  }
  const prefix = domain === 'uploadVoice' ? 'voice' : 'chat';
  return `${prefix}.request_upload_failed:${code}`;
}
