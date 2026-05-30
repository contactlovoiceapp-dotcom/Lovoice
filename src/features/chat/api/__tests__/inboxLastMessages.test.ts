/* Unit tests for inbox last-message map building and the global-limit starvation case. */

import {
  buildLastMessageMap,
  type InboxLastMessageRow,
} from '../inboxLastMessages';

function row(
  conversationId: string,
  createdAtOrder: number,
): InboxLastMessageRow {
  return {
    conversation_id: conversationId,
    kind: 'text',
    body_text: `msg-${createdAtOrder}`,
    voice_duration_ms: null,
    sender_id: 'user-a',
  };
}

describe('buildLastMessageMap', () => {
  it('keeps the first (newest) row per conversation when sorted DESC', () => {
    const map = buildLastMessageMap([
      row('conv-a', 3),
      row('conv-b', 2),
      row('conv-a', 1),
    ]);
    expect(map.size).toBe(2);
    expect(map.get('conv-a')?.body_text).toBe('msg-3');
    expect(map.get('conv-b')?.body_text).toBe('msg-2');
  });

  it('documents global LIMIT starvation: quiet convos drop out of a capped batch', () => {
    // Simulates .in(convIds).order(created_at DESC).limit(convIds.length * 5) with 4 convos → limit 20.
    // Thomas + Camille flood the window; Cécile threads never appear in the batch.
    const batch: InboxLastMessageRow[] = [
      ...Array.from({ length: 12 }, (_, i) => row('thomas', 100 - i)),
      ...Array.from({ length: 8 }, (_, i) => row('camille', 50 - i)),
    ];
    expect(batch.length).toBe(20);

    const map = buildLastMessageMap(batch);
    expect(map.has('thomas')).toBe(true);
    expect(map.has('camille')).toBe(true);
    expect(map.has('cecile-iphone')).toBe(false);
    expect(map.has('cecile-android')).toBe(false);
  });
});
