/* Unit tests for pure helpers in chat/types.ts */

import {
  deriveLifecycle,
  formatLastMessagePreview,
  mapMessageError,
  VOICE_ONLY_WINDOW_MS,
  type ConversationRow,
} from '../types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeConv(overrides: Partial<ConversationRow> = {}): ConversationRow {
  return {
    id: 'conv-1',
    user_a: 'user-a',
    user_b: 'user-b',
    initiator_id: 'user-a',
    first_reply_at: null,
    last_message_at: null,
    created_at: '2026-05-01T10:00:00Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// deriveLifecycle
// ---------------------------------------------------------------------------

describe('deriveLifecycle', () => {
  it("returns 'empty' when there are no messages", () => {
    const result = deriveLifecycle(makeConv(), false);
    expect(result).toEqual({ state: 'empty' });
  });

  it("returns 'awaiting_reply' when there are messages but first_reply_at is null", () => {
    const result = deriveLifecycle(makeConv({ initiator_id: 'user-a' }), true);
    expect(result).toEqual({ state: 'awaiting_reply', initiatorId: 'user-a' });
  });

  it("returns 'voice_only' when first_reply_at is set and within 24h", () => {
    const now = Date.now();
    // Reply happened 1 hour ago — 23h remain in the window.
    const firstReplyAt = new Date(now - 60 * 60 * 1000).toISOString();
    const voiceOnlyUntil = new Date(now - 60 * 60 * 1000 + VOICE_ONLY_WINDOW_MS).toISOString();

    jest.useFakeTimers({ now });

    const result = deriveLifecycle(makeConv({ first_reply_at: firstReplyAt }), true);

    expect(result).toEqual({
      state: 'voice_only',
      firstReplyAt,
      voiceOnlyUntil,
    });

    jest.useRealTimers();
  });

  it("returns 'open' when first_reply_at is set and 24h window has passed", () => {
    const now = Date.now();
    // Reply happened 25 hours ago — window has expired.
    const firstReplyAt = new Date(now - 25 * 60 * 60 * 1000).toISOString();

    jest.useFakeTimers({ now });

    const result = deriveLifecycle(makeConv({ first_reply_at: firstReplyAt }), true);

    expect(result).toEqual({ state: 'open' });

    jest.useRealTimers();
  });
});

// ---------------------------------------------------------------------------
// formatLastMessagePreview
// ---------------------------------------------------------------------------

describe('formatLastMessagePreview', () => {
  it('formats a voice message with duration', () => {
    const result = formatLastMessagePreview({
      kind: 'voice',
      body_text: null,
      voice_duration_ms: 72000, // 1:12
    });
    expect(result).toBe('🎤 Vocal · 1:12');
  });

  it('formats a voice message with zero duration', () => {
    const result = formatLastMessagePreview({
      kind: 'voice',
      body_text: null,
      voice_duration_ms: null,
    });
    expect(result).toBe('🎤 Vocal · 0:00');
  });

  it('formats a short text message as-is', () => {
    const result = formatLastMessagePreview({
      kind: 'text',
      body_text: 'Hello!',
      voice_duration_ms: null,
    });
    expect(result).toBe('Hello!');
  });

  it('truncates a text message longer than 80 chars with an ellipsis', () => {
    const longText = 'a'.repeat(90);
    const result = formatLastMessagePreview({
      kind: 'text',
      body_text: longText,
      voice_duration_ms: null,
    });
    expect(result).toBe(`${'a'.repeat(80)}…`);
  });

  it('trims whitespace from text messages', () => {
    const result = formatLastMessagePreview({
      kind: 'text',
      body_text: '   Hello!   ',
      voice_duration_ms: null,
    });
    expect(result).toBe('Hello!');
  });

  it('handles null body_text for text kind', () => {
    const result = formatLastMessagePreview({
      kind: 'text',
      body_text: null,
      voice_duration_ms: null,
    });
    expect(result).toBe('');
  });
});

// ---------------------------------------------------------------------------
// mapMessageError
// ---------------------------------------------------------------------------

describe('mapMessageError', () => {
  const knownCodes: [string, string][] = [
    ['messages.conversation_not_found',    'conversation_not_found'],
    ['messages.not_a_participant',         'not_a_participant'],
    ['messages.blocked',                   'blocked'],
    ['messages.not_initiator',             'not_initiator'],
    ['messages.first_message_must_be_voice', 'first_message_must_be_voice'],
    ['messages.awaiting_reply',            'awaiting_reply'],
    ['messages.reply_must_be_voice',       'reply_must_be_voice'],
    ['messages.text_locked_24h',           'text_locked_24h'],
    ['messages.update_forbidden',          'update_forbidden'],
    ['messages.empty_body',                'empty_body'],
  ];

  it.each(knownCodes)('maps %s → %s', (input, expected) => {
    expect(mapMessageError(input)).toBe(expected);
  });

  it('returns the raw code for unknown error codes', () => {
    expect(mapMessageError('messages.some_future_code')).toBe('messages.some_future_code');
  });

  it("returns 'unknown' for null input", () => {
    expect(mapMessageError(null)).toBe('unknown');
  });
});
