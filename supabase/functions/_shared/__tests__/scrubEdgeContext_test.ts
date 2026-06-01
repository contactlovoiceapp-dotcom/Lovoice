// Unit tests for scrubEdgeContext — pure PII/UUID redaction for Edge Function Sentry extras.

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { scrubEdgeContext } from '../scrubContext.ts';

Deno.test('scrubEdgeContext — redacts sensitive keys and UUIDs in strings', () => {
  const userId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  const input = {
    userId,
    email: 'user@example.com',
    display_name: 'Marie',
    push_token: 'ExponentPushToken[abc]',
    phone: '+33600000000',
    body_text: 'hello',
    free_text: 'note',
    bucket: 'voices',
    error: `lookup failed for ${userId}`,
  };

  const out = scrubEdgeContext(input) as Record<string, unknown>;

  assertEquals(out.email, '[redacted]');
  assertEquals(out.display_name, '[redacted]');
  assertEquals(out.push_token, '[redacted]');
  assertEquals(out.phone, '[redacted]');
  assertEquals(out.body_text, '[redacted]');
  assertEquals(out.free_text, '[redacted]');
  assertEquals(out.userId, '[uuid]');
  assertEquals(out.error, 'lookup failed for [uuid]');
  assertEquals(out.bucket, 'voices');
});

Deno.test('scrubEdgeContext — nested objects and arrays', () => {
  const nested = scrubEdgeContext({
    items: [{ id: '11111111-1111-1111-1111-111111111111' }],
    meta: { note: 'ok' },
  }) as { items: Array<{ id: string }>; meta: { note: string } };

  assertEquals(nested.items[0].id, '[uuid]');
  assertEquals(nested.meta.note, 'ok');
});
