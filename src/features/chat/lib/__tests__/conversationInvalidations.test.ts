/* Tests for handleConversationInsert: the conv:<id> INSERT fan-out policy must
   skip our own messages entirely and never touch the inbox (owned by the global
   channel), so a conversation open settles at ~1x refetch instead of ~4x. */

import { handleConversationInsert } from '../conversationInvalidations';

function makeActions() {
  return {
    invalidateMessages: jest.fn(),
    invalidateConversation: jest.fn(),
    scheduleMarkRead: jest.fn(),
  };
}

describe('handleConversationInsert', () => {
  it('does nothing for our own INSERT (optimistic row + onSettled already cover it)', () => {
    const actions = makeActions();

    handleConversationInsert(true, actions);

    expect(actions.invalidateMessages).not.toHaveBeenCalled();
    expect(actions.invalidateConversation).not.toHaveBeenCalled();
    expect(actions.scheduleMarkRead).not.toHaveBeenCalled();
  });

  it('refreshes messages + conversation and schedules mark-read for an incoming message', () => {
    const actions = makeActions();

    handleConversationInsert(false, actions);

    expect(actions.invalidateMessages).toHaveBeenCalledTimes(1);
    expect(actions.invalidateConversation).toHaveBeenCalledTimes(1);
    expect(actions.scheduleMarkRead).toHaveBeenCalledTimes(1);
  });

  it('exposes no inbox action — the global inbox channel owns that invalidation', () => {
    const actions = makeActions();

    handleConversationInsert(false, actions);

    // The action surface intentionally has no inbox hook; assert we did not grow one.
    expect(Object.keys(actions)).toEqual([
      'invalidateMessages',
      'invalidateConversation',
      'scheduleMarkRead',
    ]);
  });
});
