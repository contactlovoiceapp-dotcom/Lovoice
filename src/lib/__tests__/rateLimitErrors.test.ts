/* Unit tests for rate-limit error normalization and user-facing copy resolution. */

import { COPY } from '@/copy';
import {
  RATE_LIMIT_ERROR,
  getRateLimitUserMessage,
  isMappedRateLimitError,
  isRateLimitError,
  mapUploadFunctionErrorCode,
  toRateLimitAwareError,
} from '../rateLimitErrors';

describe('isRateLimitError', () => {
  it('detects the stable Postgres/Edge code inside a message', () => {
    expect(isRateLimitError(RATE_LIMIT_ERROR)).toBe(true);
    expect(isRateLimitError('voice.request_upload_failed:rate_limit_exceeded')).toBe(true);
    expect(isRateLimitError('constraint violation')).toBe(false);
  });
});

describe('toRateLimitAwareError', () => {
  it('maps Postgres trigger text to a domain-specific client code', () => {
    const err = toRateLimitAwareError(RATE_LIMIT_ERROR, 'like');
    expect(err.message).toBe('likes.rate_limit_exceeded');
    expect(isMappedRateLimitError(err)).toBe(true);
  });

  it('preserves unrelated errors unchanged', () => {
    const err = toRateLimitAwareError('DB error', 'report');
    expect(err.message).toBe('DB error');
    expect(isMappedRateLimitError(err)).toBe(false);
  });
});

describe('mapUploadFunctionErrorCode', () => {
  it('maps 429 upload errors to stable voice/chat codes', () => {
    expect(mapUploadFunctionErrorCode(RATE_LIMIT_ERROR, 'uploadVoice')).toBe('voice.rate_limit_exceeded');
    expect(mapUploadFunctionErrorCode(RATE_LIMIT_ERROR, 'uploadMessage')).toBe('chat.rate_limit_exceeded');
  });

  it('keeps other Edge Function codes prefixed', () => {
    expect(mapUploadFunctionErrorCode('banned', 'uploadVoice')).toBe('voice.request_upload_failed:banned');
    expect(mapUploadFunctionErrorCode('storage_error', 'uploadMessage')).toBe(
      'chat.request_upload_failed:storage_error',
    );
  });
});

describe('getRateLimitUserMessage', () => {
  it('returns French copy for mapped rate-limit errors', () => {
    const err = new Error('moderation.rate_limit_exceeded');
    expect(getRateLimitUserMessage(err, 'report', COPY.reportSheet.error)).toBe(COPY.rateLimit.report);
  });

  it('falls back when the error is unrelated', () => {
    const err = new Error('constraint violation');
    expect(getRateLimitUserMessage(err, 'report', COPY.reportSheet.error)).toBe(COPY.reportSheet.error);
  });
});
