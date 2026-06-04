// Unit tests for the pure helpers exported by the dispatch_push Edge Function.
// Run with: deno test --allow-env --allow-net supabase/functions/

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';

import {
  buildExpoPushMessage,
  parseExpoPushResponse,
  type BuildExpoPushMessageArgs,
  type ExpoPushMessage,
} from '../index.ts';

// ---------------------------------------------------------------------------
// buildExpoPushMessage
// ---------------------------------------------------------------------------

Deno.test('buildExpoPushMessage — like with actor name', () => {
  const args: BuildExpoPushMessageArgs = {
    kind: 'like',
    pushToken: 'ExponentPushToken[abc123]',
    actorDisplayName: 'Marie',
    notificationId: '00000000-0000-0000-0000-000000000001',
  };

  const msg: ExpoPushMessage = buildExpoPushMessage(args);

  assertEquals(msg.to, 'ExponentPushToken[abc123]');
  assertEquals(msg.sound, 'default');
  assertEquals(msg.title, 'Nouveau like 💜');
  assertEquals(msg.body, 'Marie a liké ta voix');
  assertEquals(msg.data.deep_link, '/likes');
  assertEquals(msg.data.notification_id, '00000000-0000-0000-0000-000000000001');
  assertEquals(msg.data.kind, 'like');
  assertEquals(msg.priority, 'high');
  assertEquals(msg.channelId, 'default');
});

Deno.test('buildExpoPushMessage — like with null actor falls back to Quelqu\'un', () => {
  const args: BuildExpoPushMessageArgs = {
    kind: 'like',
    pushToken: 'ExponentPushToken[abc123]',
    actorDisplayName: null,
    notificationId: '00000000-0000-0000-0000-000000000002',
  };

  const msg = buildExpoPushMessage(args);

  assertEquals(msg.body, "Quelqu'un a liké ta voix");
});

Deno.test('buildExpoPushMessage — voice message shows "Message vocal"', () => {
  const args: BuildExpoPushMessageArgs = {
    kind: 'message',
    pushToken: 'ExponentPushToken[xyz789]',
    actorDisplayName: 'Léa',
    notificationId: '00000000-0000-0000-0000-000000000003',
    conversationId: '11111111-1111-1111-1111-111111111111',
    messageKind: 'voice',
    messageBodyText: null,
  };

  const msg = buildExpoPushMessage(args);

  assertEquals(msg.title, 'Léa');
  assertEquals(msg.body, 'Message vocal');
  assertEquals(msg.data.deep_link, '/messages/11111111-1111-1111-1111-111111111111');
  assertEquals(msg.data.kind, 'message');
});

Deno.test('buildExpoPushMessage — short text message uses full body_text', () => {
  const shortText = 'Salut, ça va ?';
  const args: BuildExpoPushMessageArgs = {
    kind: 'message',
    pushToken: 'ExponentPushToken[xyz789]',
    actorDisplayName: 'Hugo',
    notificationId: '00000000-0000-0000-0000-000000000004',
    conversationId: '22222222-2222-2222-2222-222222222222',
    messageKind: 'text',
    messageBodyText: shortText,
  };

  const msg = buildExpoPushMessage(args);

  assertEquals(msg.title, 'Hugo');
  assertEquals(msg.body, shortText);
});

Deno.test('buildExpoPushMessage — text message > 60 chars is truncated with ellipsis', () => {
  const longText = 'A'.repeat(80);
  const args: BuildExpoPushMessageArgs = {
    kind: 'message',
    pushToken: 'ExponentPushToken[xyz789]',
    actorDisplayName: 'Sophie',
    notificationId: '00000000-0000-0000-0000-000000000005',
    conversationId: '33333333-3333-3333-3333-333333333333',
    messageKind: 'text',
    messageBodyText: longText,
  };

  const msg = buildExpoPushMessage(args);

  assertEquals(msg.body, 'A'.repeat(60) + '…');
  assertEquals(msg.body.length, 61); // 60 chars + 1 ellipsis char
});

Deno.test('buildExpoPushMessage — message with null actor falls back to "Nouveau message"', () => {
  const args: BuildExpoPushMessageArgs = {
    kind: 'message',
    pushToken: 'ExponentPushToken[xyz789]',
    actorDisplayName: null,
    notificationId: '00000000-0000-0000-0000-000000000006',
    conversationId: '44444444-4444-4444-4444-444444444444',
    messageKind: 'text',
    messageBodyText: 'Hey',
  };

  const msg = buildExpoPushMessage(args);

  assertEquals(msg.title, 'Nouveau message');
});

Deno.test('buildExpoPushMessage — stamps badge when provided', () => {
  const likeMsg = buildExpoPushMessage({
    kind: 'like',
    pushToken: 'ExponentPushToken[abc123]',
    actorDisplayName: 'Marie',
    notificationId: '00000000-0000-0000-0000-000000000007',
    badge: 4,
  });
  assertEquals(likeMsg.badge, 4);

  const messageMsg = buildExpoPushMessage({
    kind: 'message',
    pushToken: 'ExponentPushToken[xyz789]',
    actorDisplayName: 'Léa',
    notificationId: '00000000-0000-0000-0000-000000000008',
    conversationId: '55555555-5555-5555-5555-555555555555',
    messageKind: 'text',
    messageBodyText: 'Coucou',
    badge: 1,
  });
  assertEquals(messageMsg.badge, 1);
});

Deno.test('buildExpoPushMessage — omits badge when not provided or negative', () => {
  const noBadge = buildExpoPushMessage({
    kind: 'like',
    pushToken: 'ExponentPushToken[abc123]',
    actorDisplayName: 'Marie',
    notificationId: '00000000-0000-0000-0000-000000000009',
  });
  assertEquals('badge' in noBadge, false);

  const negativeBadge = buildExpoPushMessage({
    kind: 'like',
    pushToken: 'ExponentPushToken[abc123]',
    actorDisplayName: 'Marie',
    notificationId: '00000000-0000-0000-0000-00000000000a',
    badge: -1,
  });
  assertEquals('badge' in negativeBadge, false);
});

Deno.test('buildExpoPushMessage — stamps a zero badge to clear the OS badge', () => {
  const msg = buildExpoPushMessage({
    kind: 'message',
    pushToken: 'ExponentPushToken[xyz789]',
    actorDisplayName: 'Léa',
    notificationId: '00000000-0000-0000-0000-00000000000b',
    conversationId: '66666666-6666-6666-6666-666666666666',
    messageKind: 'voice',
    badge: 0,
  });
  assertEquals(msg.badge, 0);
});

// ---------------------------------------------------------------------------
// parseExpoPushResponse
// ---------------------------------------------------------------------------

Deno.test('parseExpoPushResponse — detects success (status ok)', () => {
  const result = parseExpoPushResponse({
    data: [{ status: 'ok', id: 'receipt-id-123' }],
  });

  assertEquals(result.ok, true);
  assertEquals(result.deviceNotRegistered, false);
  assertEquals(result.errorCode, undefined);
});

Deno.test('parseExpoPushResponse — detects DeviceNotRegistered', () => {
  const result = parseExpoPushResponse({
    data: [{
      status: 'error',
      message: 'The device token is not registered',
      details: { error: 'DeviceNotRegistered' },
    }],
  });

  assertEquals(result.ok, false);
  assertEquals(result.deviceNotRegistered, true);
  assertEquals(result.errorCode, 'DeviceNotRegistered');
});

Deno.test('parseExpoPushResponse — detects generic error without DeviceNotRegistered', () => {
  const result = parseExpoPushResponse({
    data: [{
      status: 'error',
      message: 'Message too big',
      details: { error: 'MessageTooBig' },
    }],
  });

  assertEquals(result.ok, false);
  assertEquals(result.deviceNotRegistered, false);
  assertEquals(result.errorCode, 'MessageTooBig');
});

Deno.test('parseExpoPushResponse — handles null input', () => {
  const result = parseExpoPushResponse(null);

  assertEquals(result.ok, false);
  assertEquals(result.deviceNotRegistered, false);
  assertEquals(result.errorCode, 'invalid_response');
});

Deno.test('parseExpoPushResponse — handles empty data array', () => {
  const result = parseExpoPushResponse({ data: [] });

  assertEquals(result.ok, false);
  assertEquals(result.deviceNotRegistered, false);
  assertEquals(result.errorCode, 'empty_response');
});

Deno.test('parseExpoPushResponse — error without details defaults to "unknown"', () => {
  const result = parseExpoPushResponse({
    data: [{ status: 'error', message: 'Something went wrong' }],
  });

  assertEquals(result.ok, false);
  assertEquals(result.deviceNotRegistered, false);
  assertEquals(result.errorCode, 'unknown');
});
