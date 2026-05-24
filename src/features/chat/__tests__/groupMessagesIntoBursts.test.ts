/* Tests for groupMessagesIntoBursts — burst detection across sender and time boundaries. */

import { groupMessagesIntoBursts, type ChatMessage } from '../types';

function makeMsg(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'msg-1',
    clientId: 'msg-1',
    conversationId: 'conv-1',
    senderId: 'user-a',
    kind: 'text',
    bodyText: 'hello',
    voicePath: null,
    voiceDurationMs: null,
    status: 'sent',
    failureReason: null,
    createdAt: '2026-05-24T10:00:00Z',
    readAt: null,
    ...overrides,
  };
}

describe('groupMessagesIntoBursts', () => {
  it('returns an empty array for no messages', () => {
    expect(groupMessagesIntoBursts([])).toEqual([]);
  });

  it('groups consecutive same-sender messages within 60s into a burst', () => {
    const messages: ChatMessage[] = [
      makeMsg({ id: '1', clientId: '1', createdAt: '2026-05-24T10:00:00Z' }),
      makeMsg({ id: '2', clientId: '2', createdAt: '2026-05-24T10:00:30Z' }),
      makeMsg({ id: '3', clientId: '3', createdAt: '2026-05-24T10:00:55Z' }),
    ];

    const result = groupMessagesIntoBursts(messages);

    expect(result).toHaveLength(3);
    expect(result[0].showTimestamp).toBe(false);
    expect(result[1].showTimestamp).toBe(false);
    expect(result[2].showTimestamp).toBe(true);
  });

  it('shows timestamp for both when senders alternate', () => {
    const messages: ChatMessage[] = [
      makeMsg({ id: '1', clientId: '1', senderId: 'user-a', createdAt: '2026-05-24T10:00:00Z' }),
      makeMsg({ id: '2', clientId: '2', senderId: 'user-b', createdAt: '2026-05-24T10:00:10Z' }),
    ];

    const result = groupMessagesIntoBursts(messages);

    expect(result[0].showTimestamp).toBe(true);
    expect(result[1].showTimestamp).toBe(true);
  });

  it('splits a burst when the time gap exceeds 60 seconds', () => {
    const messages: ChatMessage[] = [
      makeMsg({ id: '1', clientId: '1', createdAt: '2026-05-24T10:00:00Z' }),
      makeMsg({ id: '2', clientId: '2', createdAt: '2026-05-24T10:02:00Z' }),
    ];

    const result = groupMessagesIntoBursts(messages);

    expect(result[0].showTimestamp).toBe(true);
    expect(result[1].showTimestamp).toBe(true);
  });
});
