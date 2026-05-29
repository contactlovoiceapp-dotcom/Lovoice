/* Tests for conversationRealtimeService: the session-scoped owner of the conv:<id>
   channel. Covers the idempotent setActiveConversationId churn guard (re-selecting
   the active conversation must NOT re-subscribe), switch/teardown, the INSERT fan-out
   (own message no-op, incoming refreshes messages + conversation but never inbox),
   broadcast → store wiring, and the emit helpers. The Supabase client is mocked. */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { QueryClient } from '@tanstack/react-query';

import { chatQueryKeys } from '../../api/conversationQueries';
import {
  configureConversationRealtime,
  setActiveConversationId,
  emitTyping,
  emitRecording,
  useConversationRealtimeStore,
  __resetConversationRealtimeForTests,
  type ConversationRealtimeDeps,
} from '../conversationRealtimeService';

type PgHandler = (payload: { new?: { sender_id?: string } }) => void;
type BroadcastHandler = (msg: { payload: { userId: string; value: boolean; ts: number } }) => void;

interface CapturedHandlers {
  insert?: PgHandler;
  update?: () => void;
  typing?: BroadcastHandler;
  recording?: BroadcastHandler;
}

interface MockChannel {
  topic: string;
  handlers: CapturedHandlers;
  send: jest.Mock;
  on: jest.Mock;
  subscribe: jest.Mock;
}

function makeChannel(topic: string): MockChannel {
  const handlers: CapturedHandlers = {};
  const channel: MockChannel = {
    topic,
    handlers,
    send: jest.fn().mockResolvedValue(undefined),
    on: jest.fn(),
    subscribe: jest.fn(),
  };

  channel.on.mockImplementation(
    (type: string, config: { event: string }, handler: PgHandler & BroadcastHandler) => {
      if (type === 'postgres_changes') {
        if (config.event === 'INSERT') handlers.insert = handler;
        else if (config.event === 'UPDATE') handlers.update = handler;
      } else if (type === 'broadcast') {
        if (config.event === 'typing') handlers.typing = handler;
        else if (config.event === 'recording') handlers.recording = handler;
      }
      return channel;
    },
  );

  // Simulate an immediate successful subscription so channelReady becomes true.
  channel.subscribe.mockImplementation((cb?: (status: string, err?: Error) => void) => {
    cb?.('SUBSCRIBED');
    return channel;
  });

  return channel;
}

function makeSupabaseMock() {
  const created: MockChannel[] = [];
  const channelFactory = jest.fn((name: string) => {
    const ch = makeChannel(`realtime:${name}`);
    created.push(ch);
    return ch;
  });
  const removeChannel = jest.fn();
  const client = {
    channel: channelFactory,
    removeChannel,
    getChannels: () => [],
  };
  return {
    client: client as unknown as SupabaseClient,
    channelFactory,
    removeChannel,
    created,
    last: () => created[created.length - 1],
  };
}

function makeQueryClientMock() {
  const invalidateQueries = jest.fn().mockResolvedValue(undefined);
  return {
    queryClient: { invalidateQueries } as unknown as QueryClient,
    invalidateQueries,
  };
}

function makeDeps(
  supabase: SupabaseClient,
  overrides: Partial<ConversationRealtimeDeps> = {},
): { deps: ConversationRealtimeDeps; invalidateQueries: jest.Mock; markConversationRead: jest.Mock } {
  const { queryClient, invalidateQueries } = makeQueryClientMock();
  const markConversationRead = jest.fn();
  const deps: ConversationRealtimeDeps = {
    supabase,
    queryClient,
    currentUserId: 'me',
    // Run immediately — the resume guard is exercised in its own test suite.
    runAfterResume: (fn) => fn(),
    markConversationRead,
    ...overrides,
  };
  return { deps, invalidateQueries, markConversationRead };
}

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  __resetConversationRealtimeForTests();
  jest.useRealTimers();
  jest.clearAllMocks();
});

describe('setActiveConversationId — subscription lifecycle', () => {
  it('subscribes to conv:<id> when a conversation becomes active', () => {
    const sb = makeSupabaseMock();
    const { deps } = makeDeps(sb.client);
    configureConversationRealtime(deps);

    setActiveConversationId('A');

    expect(sb.channelFactory).toHaveBeenCalledTimes(1);
    expect(sb.channelFactory).toHaveBeenCalledWith('conv:A');
    expect(sb.last().subscribe).toHaveBeenCalledTimes(1);
    expect(useConversationRealtimeStore.getState().activeConversationId).toBe('A');
  });

  it('is a no-op when re-selecting the already-active conversation (churn guard)', () => {
    const sb = makeSupabaseMock();
    const { deps } = makeDeps(sb.client);
    configureConversationRealtime(deps);

    setActiveConversationId('A');
    setActiveConversationId('A');
    setActiveConversationId('A');

    // Only the first selection subscribes; the notif-tap churn is gone.
    expect(sb.channelFactory).toHaveBeenCalledTimes(1);
    expect(sb.removeChannel).not.toHaveBeenCalled();
  });

  it('tears down the old channel and subscribes the new one when switching', () => {
    const sb = makeSupabaseMock();
    const { deps } = makeDeps(sb.client);
    configureConversationRealtime(deps);

    setActiveConversationId('A');
    const firstChannel = sb.last();
    setActiveConversationId('B');

    expect(sb.removeChannel).toHaveBeenCalledWith(firstChannel);
    expect(sb.channelFactory).toHaveBeenCalledTimes(2);
    expect(sb.channelFactory).toHaveBeenLastCalledWith('conv:B');
    expect(useConversationRealtimeStore.getState().activeConversationId).toBe('B');
  });

  it('tears down the channel when set to null', () => {
    const sb = makeSupabaseMock();
    const { deps } = makeDeps(sb.client);
    configureConversationRealtime(deps);

    setActiveConversationId('A');
    const ch = sb.last();
    setActiveConversationId(null);

    expect(sb.removeChannel).toHaveBeenCalledWith(ch);
    expect(useConversationRealtimeStore.getState().activeConversationId).toBeNull();
  });

  it('reconciles a pending active conversation once deps are configured (order-independent)', () => {
    const sb = makeSupabaseMock();
    const { deps } = makeDeps(sb.client);

    // Screen focus runs before the host configures deps.
    setActiveConversationId('A');
    expect(sb.channelFactory).not.toHaveBeenCalled();

    configureConversationRealtime(deps);
    expect(sb.channelFactory).toHaveBeenCalledWith('conv:A');
  });
});

describe('INSERT fan-out', () => {
  it('does nothing for our own confirmed INSERT', () => {
    const sb = makeSupabaseMock();
    const { deps, invalidateQueries, markConversationRead } = makeDeps(sb.client);
    configureConversationRealtime(deps);
    setActiveConversationId('A');

    sb.last().handlers.insert?.({ new: { sender_id: 'me' } });

    expect(invalidateQueries).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1000);
    expect(markConversationRead).not.toHaveBeenCalled();
  });

  it('refreshes messages + conversation and schedules mark-read for an incoming message, never the inbox', () => {
    const sb = makeSupabaseMock();
    const { deps, invalidateQueries, markConversationRead } = makeDeps(sb.client);
    configureConversationRealtime(deps);
    setActiveConversationId('A');

    sb.last().handlers.insert?.({ new: { sender_id: 'other' } });

    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: chatQueryKeys.messages('A') });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: chatQueryKeys.conversation('A') });
    // The global inbox channel owns the inbox invalidation — never from here.
    expect(invalidateQueries).not.toHaveBeenCalledWith({ queryKey: chatQueryKeys.inbox });

    // mark-read is debounced (400 ms).
    expect(markConversationRead).not.toHaveBeenCalled();
    jest.advanceTimersByTime(400);
    expect(markConversationRead).toHaveBeenCalledWith('A');
  });

  it('debounces UPDATE bursts into a single messages invalidation', () => {
    const sb = makeSupabaseMock();
    const { deps, invalidateQueries } = makeDeps(sb.client);
    configureConversationRealtime(deps);
    setActiveConversationId('A');

    sb.last().handlers.update?.();
    sb.last().handlers.update?.();
    sb.last().handlers.update?.();
    expect(invalidateQueries).not.toHaveBeenCalled();

    jest.advanceTimersByTime(500);
    expect(invalidateQueries).toHaveBeenCalledTimes(1);
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: chatQueryKeys.messages('A') });
  });
});

describe('broadcast → store', () => {
  it('reflects the other participant typing into the store and auto-clears', () => {
    const sb = makeSupabaseMock();
    const { deps } = makeDeps(sb.client);
    configureConversationRealtime(deps);
    setActiveConversationId('A');

    sb.last().handlers.typing?.({ payload: { userId: 'other', value: true, ts: Date.now() } });
    expect(useConversationRealtimeStore.getState().otherIsTyping).toBe(true);

    jest.advanceTimersByTime(5000);
    expect(useConversationRealtimeStore.getState().otherIsTyping).toBe(false);
  });

  it('ignores our own broadcast echoes', () => {
    const sb = makeSupabaseMock();
    const { deps } = makeDeps(sb.client);
    configureConversationRealtime(deps);
    setActiveConversationId('A');

    sb.last().handlers.recording?.({ payload: { userId: 'me', value: true, ts: Date.now() } });
    expect(useConversationRealtimeStore.getState().otherIsRecording).toBe(false);
  });
});

describe('emit helpers', () => {
  it('does nothing when there is no active channel', () => {
    const sb = makeSupabaseMock();
    const { deps } = makeDeps(sb.client);
    configureConversationRealtime(deps);

    emitTyping(false);
    emitRecording(true);

    expect(sb.created).toHaveLength(0);
  });

  it('sends a recording broadcast on the active channel', () => {
    const sb = makeSupabaseMock();
    const { deps } = makeDeps(sb.client);
    configureConversationRealtime(deps);
    setActiveConversationId('A');

    emitRecording(true);

    expect(sb.last().send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'broadcast',
        event: 'recording',
        payload: expect.objectContaining({ userId: 'me', value: true }),
      }),
    );
  });
});
