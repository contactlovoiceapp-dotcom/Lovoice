/* Helpers for the messages tab stack — keep the inbox as the back target for conversations. */

import { router, type Href } from 'expo-router';

const MESSAGES_INBOX = '/(main)/messages' as Href;

/**
 * Opens the messages inbox. Use for the tab bar and when leaving a conversation.
 */
export function navigateToMessagesInbox(): void {
  router.navigate(MESSAGES_INBOX);
}

/**
 * Leaves the current conversation and always lands on the inbox list,
 * even when the conversation was opened from Discover or a push notification.
 */
export function closeConversation(): void {
  router.replace(MESSAGES_INBOX);
}

/**
 * Opens a conversation from outside the messages stack (Discover, profile modal,
 * push deep-link). Ensures the inbox route sits beneath [id] so back never
 * escapes to another tab.
 */
export function openConversation(conversationId: string): void {
  router.navigate(MESSAGES_INBOX);
  router.push(`/(main)/messages/${conversationId}` as Href);
}
