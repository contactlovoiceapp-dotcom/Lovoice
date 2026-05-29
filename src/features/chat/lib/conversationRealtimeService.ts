/* Session-scoped owner of the single active conversation Realtime channel.

   Previously the conv:<id> channel lived inside the conversation route's effect, so
   every notification tap that unmounted/remounted the screen tore down and rebuilt
   the channel — the repeated "[RealtimeConv] conv:X subscribed" churn that feeds the
   off-JS-thread Hermes race (see docs/REALTIME_STABILITY.md §5 Step 2).

   This service moves the channel lifecycle out of React's render tree. The screen
   only declares which conversation is active via setActiveConversationId, which is
   idempotent: re-selecting the conversation that is already active is a no-op, so a
   screen remount during a navigation transition does NOT re-subscribe. The INSERT/
   UPDATE handlers, the typing/recording broadcasts, the debouncers, and the
   resume-guard defer all live here; the screen reads typing/recording state from the
   Zustand store and calls emitTyping/emitRecording. No navigation logic lives here. */

import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import type { QueryClient } from '@tanstack/react-query';
import { create } from 'zustand';

import type { Database } from '@/types/database';
import { chatQueryKeys } from '../api/conversationQueries';
import { createDebouncer, createThrottle, type Debouncer } from './throttle';
import { removeChannelsByName } from './realtimeChannels';
import { handleConversationInsert } from './conversationInvalidations';

// How long (ms) with no typing event before the indicator auto-clears.
const TYPING_CLEAR_DELAY_MS = 5_000;
// Safety-net auto-clear for the recording indicator (the sender always emits false).
const RECORDING_CLEAR_DELAY_MS = 10_000;
// Throttle window for typing=true broadcasts.
const TYPING_THROTTLE_MS = 3_000;
// Collapse bursts of UPDATE events (read receipts, etc.) into one refetch.
const MESSAGES_UPDATE_DEBOUNCE_MS = 500;
// Collapse multiple incoming messages into a single markRead call.
const MARK_READ_DEBOUNCE_MS = 400;

interface BroadcastPayload {
  userId: string;
  value: boolean;
  ts: number;
}

/** React-visible state for the currently active conversation channel. */
interface ConversationRealtimeState {
  activeConversationId: string | null;
  otherIsTyping: boolean;
  otherIsRecording: boolean;
}

export const useConversationRealtimeStore = create<ConversationRealtimeState>(() => ({
  activeConversationId: null,
  otherIsTyping: false,
  otherIsRecording: false,
}));

/** Session-scoped dependencies wired in by useConversationRealtimeHost. */
export interface ConversationRealtimeDeps {
  supabase: SupabaseClient<Database> | null;
  queryClient: QueryClient;
  currentUserId: string;
  runAfterResume: (fn: () => void) => void;
  markConversationRead: (conversationId: string) => void;
}

// ---------------------------------------------------------------------------
// Module-scoped singleton state (survives screen unmount/remount).
// ---------------------------------------------------------------------------

let deps: ConversationRealtimeDeps | null = null;
let activeConversationId: string | null = null;
let channel: RealtimeChannel | null = null;
let channelClient: SupabaseClient<Database> | null = null;
let channelReady = false;
let updateDebouncer: Debouncer | null = null;
let markReadDebouncer: Debouncer | null = null;
let typingTimer: ReturnType<typeof setTimeout> | null = null;
let recordingTimer: ReturnType<typeof setTimeout> | null = null;

// Created once: the typing throttle is conversation-independent (per-user cadence).
const typingThrottle = createThrottle(TYPING_THROTTLE_MS);

function clearTypingTimer(): void {
  if (typingTimer !== null) {
    clearTimeout(typingTimer);
    typingTimer = null;
  }
}

function clearRecordingTimer(): void {
  if (recordingTimer !== null) {
    clearTimeout(recordingTimer);
    recordingTimer = null;
  }
}

function handleTypingBroadcast(payload: BroadcastPayload): void {
  if (!deps || payload.userId === deps.currentUserId) return;
  if (payload.value) {
    useConversationRealtimeStore.setState({ otherIsTyping: true });
    clearTypingTimer();
    typingTimer = setTimeout(
      () => useConversationRealtimeStore.setState({ otherIsTyping: false }),
      TYPING_CLEAR_DELAY_MS,
    );
  } else {
    clearTypingTimer();
    useConversationRealtimeStore.setState({ otherIsTyping: false });
  }
}

function handleRecordingBroadcast(payload: BroadcastPayload): void {
  if (!deps || payload.userId === deps.currentUserId) return;
  if (payload.value) {
    useConversationRealtimeStore.setState({ otherIsRecording: true });
    clearRecordingTimer();
    recordingTimer = setTimeout(
      () => useConversationRealtimeStore.setState({ otherIsRecording: false }),
      RECORDING_CLEAR_DELAY_MS,
    );
  } else {
    clearRecordingTimer();
    useConversationRealtimeStore.setState({ otherIsRecording: false });
  }
}

function subscribeChannel(supabase: SupabaseClient<Database>, conversationId: string): void {
  // Defensive: Supabase caches channels by topic, so remove any orphaned instance
  // for this topic before subscribing, otherwise channel() returns an already-
  // subscribed channel and .on(...) throws (see docs/REALTIME_STABILITY.md §4.1).
  removeChannelsByName(supabase, `conv:${conversationId}`);

  // Debounce UPDATE invalidations (read receipt bursts) into a single refetch.
  // INSERTs are not debounced — new messages must surface immediately.
  updateDebouncer = createDebouncer(() => {
    void deps?.queryClient.invalidateQueries({
      queryKey: chatQueryKeys.messages(conversationId),
    });
  }, MESSAGES_UPDATE_DEBOUNCE_MS);

  markReadDebouncer = createDebouncer(() => {
    deps?.markConversationRead(conversationId);
  }, MARK_READ_DEBOUNCE_MS);

  const newChannel = supabase
    .channel(`conv:${conversationId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${conversationId}`,
      },
      (payload) => {
        const d = deps;
        if (!d) return;
        const newRow = payload?.new as { sender_id?: string } | undefined;
        const isOwnMessage = newRow?.sender_id === d.currentUserId;

        // Defer all invalidations during the foreground-resume window so the
        // Realtime reconnection burst does not overlap with iOS keyboard/nav
        // transitions. Outside the window this runs synchronously (no latency).
        // The fan-out policy (skip own messages, never invalidate the inbox here)
        // lives in handleConversationInsert — see docs/REALTIME_STABILITY.md §5.
        d.runAfterResume(() => {
          handleConversationInsert(isOwnMessage, {
            invalidateMessages: () =>
              void d.queryClient.invalidateQueries({
                queryKey: chatQueryKeys.messages(conversationId),
              }),
            invalidateConversation: () =>
              void d.queryClient.invalidateQueries({
                queryKey: chatQueryKeys.conversation(conversationId),
              }),
            scheduleMarkRead: () => markReadDebouncer?.schedule(),
          });
        });
      },
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${conversationId}`,
      },
      () => {
        updateDebouncer?.schedule();
      },
    )
    .on('broadcast', { event: 'typing' }, ({ payload }: { payload: BroadcastPayload }) => {
      handleTypingBroadcast(payload);
    })
    .on('broadcast', { event: 'recording' }, ({ payload }: { payload: BroadcastPayload }) => {
      handleRecordingBroadcast(payload);
    })
    .subscribe((status, err) => {
      channelReady = status === 'SUBSCRIBED';
      if (__DEV__) {
        if (status === 'SUBSCRIBED') {
          console.log(`[RealtimeConv] conv:${conversationId} subscribed`);
        } else if (status === 'CHANNEL_ERROR') {
          console.warn(`[RealtimeConv] conv:${conversationId} error`, err?.message);
        } else if (status === 'TIMED_OUT') {
          console.warn(`[RealtimeConv] conv:${conversationId} timed out`);
        }
      }
    });

  channel = newChannel;
  channelClient = supabase;
}

function teardownChannel(): void {
  const current = channel;
  if (current && channelClient) {
    if (channelReady && deps) {
      // Best-effort: clear our typing/recording state on the other side before leaving.
      void current.send({
        type: 'broadcast',
        event: 'typing',
        payload: { userId: deps.currentUserId, value: false, ts: Date.now() },
      });
      void current.send({
        type: 'broadcast',
        event: 'recording',
        payload: { userId: deps.currentUserId, value: false, ts: Date.now() },
      });
    }
    void channelClient.removeChannel(current);
  }
  channel = null;
  channelClient = null;
  channelReady = false;
  updateDebouncer?.cancel();
  updateDebouncer = null;
  markReadDebouncer?.cancel();
  markReadDebouncer = null;
  clearTypingTimer();
  clearRecordingTimer();
}

// Subscribe if a conversation is active, no channel exists yet, and deps are ready.
// Called from both setActiveConversationId and configure to be order-independent
// (child focus effects can run before the parent host effect on first mount).
function ensureSubscribed(): void {
  if (activeConversationId === null || channel !== null) return;
  const d = deps;
  if (!d || !d.supabase) return;
  subscribeChannel(d.supabase, activeConversationId);
}

/** Wires session-scoped React deps into the service. Idempotent; safe to call on
    every dependency change. Reconciles a pending subscription if one is awaited. */
export function configureConversationRealtime(next: ConversationRealtimeDeps): void {
  deps = next;
  ensureSubscribed();
}

/** Declares which conversation owns the Realtime channel. Idempotent: selecting the
    already-active conversation is a no-op (the churn guard). Pass null to tear down. */
export function setActiveConversationId(conversationId: string | null): void {
  if (conversationId === activeConversationId) return;
  teardownChannel();
  activeConversationId = conversationId;
  useConversationRealtimeStore.setState({
    activeConversationId: conversationId,
    otherIsTyping: false,
    otherIsRecording: false,
  });
  ensureSubscribed();
}

export function emitTyping(value: boolean): void {
  if (!channel || !channelReady || !deps) return;
  // Throttle value=true; always send value=false immediately.
  if (value && !typingThrottle.ping()) return;
  if (!value) typingThrottle.flush();
  void channel.send({
    type: 'broadcast',
    event: 'typing',
    payload: { userId: deps.currentUserId, value, ts: Date.now() },
  });
}

export function emitRecording(value: boolean): void {
  if (!channel || !channelReady || !deps) return;
  void channel.send({
    type: 'broadcast',
    event: 'recording',
    payload: { userId: deps.currentUserId, value, ts: Date.now() },
  });
}

// Test-only reset of the module-scoped singleton between cases.
export function __resetConversationRealtimeForTests(): void {
  teardownChannel();
  deps = null;
  activeConversationId = null;
  useConversationRealtimeStore.setState({
    activeConversationId: null,
    otherIsTyping: false,
    otherIsRecording: false,
  });
}
