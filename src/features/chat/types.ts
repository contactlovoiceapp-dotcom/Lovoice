/* Types, view models, and pure helpers for the chat feature. */

import type { Database } from '@/types/database';

export type ConversationRow = Database['public']['Tables']['conversations']['Row'];
export type MessageRow      = Database['public']['Tables']['messages']['Row'];
export type MessageKind     = 'text' | 'voice';

// 24-hour window during which only voice messages are allowed after the first reply.
export const VOICE_ONLY_WINDOW_MS = 24 * 60 * 60 * 1000;

// 4-state lifecycle derived from a conversation row and whether any message exists.
export type ConversationLifecycle =
  | { state: 'empty' }
  | { state: 'awaiting_reply'; initiatorId: string }
  | { state: 'voice_only'; firstReplyAt: string; voiceOnlyUntil: string }
  | { state: 'open' };

// View model used by the inbox list.
export interface InboxConversation {
  conversationId: string;
  otherUserId: string;
  displayName: string;
  avatarEmojis: string[];
  lastMessageAt: string;
  lastMessagePreview: string;
  lastMessageKind: MessageKind;
  lastMessageSenderIsMe: boolean;
  unreadCount: number;
  lifecycle: ConversationLifecycle;
}

// View model used by ConversationScreen.
export interface ConversationDetails {
  conversationId: string;
  otherUserId: string;
  otherDisplayName: string;
  otherCity: string;
  otherEmojis: string[];
  otherBirthdate: string;
  // The voice that originated the conversation — shown for context in the header.
  otherActiveVoiceId: string | null;
  lifecycle: ConversationLifecycle;
  initiatorId: string;
  iAmInitiator: boolean;
}

// Domain object exposed to the UI for a single message.
// Optimistic messages use a synthetic clientId until confirmed by the server.
export interface ChatMessage {
  id: string;
  clientId: string;
  conversationId: string;
  senderId: string;
  kind: MessageKind;
  bodyText: string | null;
  voicePath: string | null;
  voiceDurationMs: number | null;
  status: 'sending' | 'sent' | 'failed';
  // Maps to a COPY.chat.conversation.sendError key, or raw error token for unknown codes.
  failureReason: string | null;
  createdAt: string;
  readAt: string | null;
}

export interface SendTextMessageInput {
  conversationId: string;
  bodyText: string;
}

export interface SendVoiceMessageInput {
  conversationId: string;
  uri: string;
  durationMs: number;
}

/**
 * Derives the four-state conversation lifecycle from a row and a message-existence flag.
 * Called on the client to decide which composer mode and badges to show.
 */
export function deriveLifecycle(conv: ConversationRow, hasAnyMessage: boolean): ConversationLifecycle {
  if (!hasAnyMessage) {
    return { state: 'empty' };
  }

  if (conv.first_reply_at === null) {
    return { state: 'awaiting_reply', initiatorId: conv.initiator_id };
  }

  const voiceOnlyUntil = new Date(
    new Date(conv.first_reply_at).getTime() + VOICE_ONLY_WINDOW_MS,
  ).toISOString();

  if (voiceOnlyUntil > new Date().toISOString()) {
    return { state: 'voice_only', firstReplyAt: conv.first_reply_at, voiceOnlyUntil };
  }

  return { state: 'open' };
}

function formatMmSs(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** Formats a message row into a one-line inbox preview string. */
export function formatLastMessagePreview(
  message: Pick<MessageRow, 'kind' | 'body_text' | 'voice_duration_ms'>,
): string {
  if (message.kind === 'voice') {
    return `🎤 Vocal · ${formatMmSs(message.voice_duration_ms ?? 0)}`;
  }
  const text = (message.body_text ?? '').trim();
  return text.length > 80 ? `${text.slice(0, 80)}…` : text;
}

// ---------------------------------------------------------------------------
// Grouping helper — combines consecutive same-sender messages into "bursts"
// so only the last message in a burst shows its timestamp.
// ---------------------------------------------------------------------------

export interface BurstMessage {
  message: ChatMessage;
  showTimestamp: boolean;
}

const BURST_THRESHOLD_MS = 60_000;

export function groupMessagesIntoBursts(messages: ChatMessage[]): BurstMessage[] {
  if (messages.length === 0) return [];

  const result: BurstMessage[] = messages.map((msg) => ({ message: msg, showTimestamp: true }));

  for (let i = 0; i < result.length - 1; i++) {
    const current = result[i].message;
    const next = result[i + 1].message;
    const sameAuthor = current.senderId === next.senderId;
    const timeDelta = Math.abs(
      new Date(next.createdAt).getTime() - new Date(current.createdAt).getTime(),
    );
    if (sameAuthor && timeDelta <= BURST_THRESHOLD_MS) {
      result[i].showTimestamp = false;
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Voice-only countdown helper — deterministic, tested standalone.
// ---------------------------------------------------------------------------

export interface VoiceOnlyCountdownResult {
  hours: number;
  minutes: number;
  expired: boolean;
}

export function formatVoiceOnlyCountdown(
  voiceOnlyUntil: string,
  now: Date,
): VoiceOnlyCountdownResult {
  const target = new Date(voiceOnlyUntil).getTime();
  const diff = target - now.getTime();

  if (diff <= 0) return { hours: 0, minutes: 0, expired: true };

  const totalMinutes = Math.floor(diff / 60_000);
  return {
    hours: Math.floor(totalMinutes / 60),
    minutes: totalMinutes % 60,
    expired: false,
  };
}

// Maps frozen trigger SQLSTATE 23514 error codes to COPY.chat.conversation.sendError keys.
const MESSAGE_ERROR_MAP: Record<string, string> = {
  'messages.conversation_not_found':    'conversation_not_found',
  'messages.not_a_participant':         'not_a_participant',
  'messages.blocked':                   'blocked',
  'messages.not_initiator':             'not_initiator',
  'messages.first_message_must_be_voice': 'first_message_must_be_voice',
  'messages.awaiting_reply':            'awaiting_reply',
  'messages.reply_must_be_voice':       'reply_must_be_voice',
  'messages.text_locked_24h':           'text_locked_24h',
  'messages.update_forbidden':          'update_forbidden',
  // Client-side guards
  'messages.empty_body':                'empty_body',
};

/**
 * Maps a raw error code (from a DB trigger or client guard) to a COPY key.
 * Returns the raw code when unknown so server-side errors surface in logs.
 */
export function mapMessageError(code: string | null): string {
  if (!code) return 'unknown';
  return MESSAGE_ERROR_MAP[code] ?? code;
}
