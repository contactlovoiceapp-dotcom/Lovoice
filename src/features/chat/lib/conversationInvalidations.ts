/* Pure fan-out policy for an INSERT received on the conv:<id> Realtime channel.
   Extracted so the invalidation rules are unit-testable without rendering the
   conversation route, and reused by the session-scoped Realtime service. The
   rules deliberately minimise the React Query refetch burst that fuels the
   off-JS-thread Hermes race (see docs/REALTIME_STABILITY.md §5 Step 1b). */

export interface ConversationInsertActions {
  invalidateMessages: () => void;
  invalidateConversation: () => void;
  scheduleMarkRead: () => void;
}

/**
 * Applies the conv:<id> INSERT fan-out rules.
 *
 * - Our own confirmed INSERT is a no-op here: the optimistic row already renders
 *   it with a stable clientId, and the sending mutation's onSettled refreshes the
 *   conversation details + inbox. Re-invalidating would stack into the ~4x burst.
 * - An incoming message refreshes this conversation's messages + lifecycle. Mark-read
 *   runs only while the conversation screen is focused — otherwise unread badges
 *   would clear as soon as the user leaves the thread. The inbox is intentionally
 *   NOT invalidated here: useRealtimeInbox owns that.
 */
export function handleConversationInsert(
  isOwnMessage: boolean,
  isScreenFocused: boolean,
  actions: ConversationInsertActions,
): void {
  if (isOwnMessage) return;
  actions.invalidateMessages();
  if (isScreenFocused) {
    actions.scheduleMarkRead();
  }
  actions.invalidateConversation();
}
