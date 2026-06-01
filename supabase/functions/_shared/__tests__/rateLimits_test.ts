// Unit tests for upload rate-limit bucket configuration shared with request_upload.

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';

import { RATE_LIMIT_ERROR, getUploadRateLimit } from '../rateLimits.ts';

Deno.test('getUploadRateLimit — voice allows 30 uploads per 24h UTC window', () => {
  assertEquals(getUploadRateLimit('voice'), {
    bucket: 'upload:voice',
    limit: 30,
    windowSeconds: 86_400,
  });
});

Deno.test('getUploadRateLimit — message allows 120 uploads per 1h UTC window', () => {
  assertEquals(getUploadRateLimit('message'), {
    bucket: 'upload:message',
    limit: 120,
    windowSeconds: 3_600,
  });
});

Deno.test('RATE_LIMIT_ERROR — stable JSON error code for 429 responses', () => {
  assertEquals(RATE_LIMIT_ERROR, 'rate_limit_exceeded');
});
