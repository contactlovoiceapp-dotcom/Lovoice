// Shared upload rate-limit bucket configuration for request_upload (kept in one place for tests).

export const RATE_LIMIT_ERROR = 'rate_limit_exceeded';

export interface RateLimitConfig {
  bucket: string;
  limit: number;
  windowSeconds: number;
}

export function getUploadRateLimit(kind: 'voice' | 'message'): RateLimitConfig {
  if (kind === 'voice') {
    return { bucket: 'upload:voice', limit: 30, windowSeconds: 86_400 };
  }
  return { bucket: 'upload:message', limit: 120, windowSeconds: 3_600 };
}
