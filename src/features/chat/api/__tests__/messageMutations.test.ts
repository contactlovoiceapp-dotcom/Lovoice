/* Tests for messageMutations: optimistic insert/rollback and inbox invalidation. */

import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider, type InfiniteData } from '@tanstack/react-query';

import {
  useSendTextMessage,
  useStartConversation,
} from '../messageMutations';
import { chatQueryKeys } from '../conversationQueries';
import type { ChatMessage } from '../../types';

jest.mock('@/lib/supabase');

const MOCK_UID = 'user-me';
const MOCK_CONV_ID = 'conv-abc';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function buildAuthMock(uid: string = MOCK_UID) {
  return {
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user: { id: uid } } }),
      getSession: jest.fn().mockResolvedValue({
        data: { session: { user: { id: uid } } },
      }),
    },
  };
}

function emptyMessagesCache(): InfiniteData<ChatMessage[]> {
  return { pages: [], pageParams: [] };
}

// ---------------------------------------------------------------------------
// useSendTextMessage
// ---------------------------------------------------------------------------

describe('useSendTextMessage', () => {
  it('inserts an optimistic message with status "sending" before the server responds', async () => {
    const serverRow = {
      id: 'msg-server-1',
      conversation_id: MOCK_CONV_ID,
      sender_id: MOCK_UID,
      kind: 'text',
      body_text: 'Hello',
      voice_path: null,
      voice_duration_ms: null,
      status: 'sent',
      read_at: null,
      created_at: '2026-05-24T10:00:00Z',
    };

    let resolveInsert!: (value: { data: typeof serverRow; error: null }) => void;
    const insertPromise = new Promise<{ data: typeof serverRow; error: null }>((resolve) => {
      resolveInsert = resolve;
    });

    const singleMock = jest.fn().mockReturnValue(insertPromise);
    const selectMock = jest.fn().mockReturnValue({ single: singleMock });
    const insertMock = jest.fn().mockReturnValue({ select: selectMock });
    const invalidateMock = jest.fn().mockResolvedValue(undefined);

    const supabaseMock = {
      ...buildAuthMock(),
      from: jest.fn().mockReturnValue({ insert: insertMock }),
    };

    const { getSupabaseClient } = jest.requireMock('@/lib/supabase') as {
      getSupabaseClient: jest.Mock;
    };
    getSupabaseClient.mockReturnValue(supabaseMock);

    const queryClient = makeQueryClient();
    queryClient.setQueryData(chatQueryKeys.messages(MOCK_CONV_ID), emptyMessagesCache());
    jest.spyOn(queryClient, 'invalidateQueries').mockImplementation(invalidateMock);

    const { result } = renderHook(() => useSendTextMessage(), {
      wrapper: makeWrapper(queryClient),
    });

    act(() => {
      result.current.mutate({ conversationId: MOCK_CONV_ID, bodyText: 'Hello' });
    });

    // Before server responds, optimistic message should be in cache with status 'sending'.
    let optimisticClientId: string | undefined;
    await waitFor(() => {
      const cache = queryClient.getQueryData<InfiniteData<ChatMessage[]>>(
        chatQueryKeys.messages(MOCK_CONV_ID),
      );
      expect(cache?.pages[0]?.[0]?.status).toBe('sending');
      expect(cache?.pages[0]?.[0]?.bodyText).toBe('Hello');
      optimisticClientId = cache?.pages[0]?.[0]?.clientId;
    });
    expect(optimisticClientId).toMatch(/^optimistic-/);

    // Resolve the server response.
    resolveInsert({ data: serverRow, error: null });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // Optimistic message should be replaced by the confirmed server row.
    const confirmed = queryClient.getQueryData<InfiniteData<ChatMessage[]>>(
      chatQueryKeys.messages(MOCK_CONV_ID),
    );
    expect(confirmed?.pages[0]?.[0]?.id).toBe('msg-server-1');
    expect(confirmed?.pages[0]?.[0]?.status).toBe('sent');
    // clientId must survive the optimistic→confirmed swap so the FlatList key
    // stays stable and the voice bubble does not remount mid-playback.
    expect(confirmed?.pages[0]?.[0]?.clientId).toBe(optimisticClientId);
  });

  it('marks the optimistic message as "failed" when the server returns an error', async () => {
    const singleMock = jest.fn().mockResolvedValue({
      data: null,
      error: { message: 'messages.text_locked_24h' },
    });
    const selectMock = jest.fn().mockReturnValue({ single: singleMock });
    const insertMock = jest.fn().mockReturnValue({ select: selectMock });

    const supabaseMock = {
      ...buildAuthMock(),
      from: jest.fn().mockReturnValue({ insert: insertMock }),
    };

    const { getSupabaseClient } = jest.requireMock('@/lib/supabase') as {
      getSupabaseClient: jest.Mock;
    };
    getSupabaseClient.mockReturnValue(supabaseMock);

    const queryClient = makeQueryClient();
    queryClient.setQueryData(chatQueryKeys.messages(MOCK_CONV_ID), emptyMessagesCache());
    jest.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);

    const { result } = renderHook(() => useSendTextMessage(), {
      wrapper: makeWrapper(queryClient),
    });

    await act(async () => {
      result.current.mutate({ conversationId: MOCK_CONV_ID, bodyText: 'Hi' });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    const cache = queryClient.getQueryData<InfiniteData<ChatMessage[]>>(
      chatQueryKeys.messages(MOCK_CONV_ID),
    );
    expect(cache?.pages[0]?.[0]?.status).toBe('failed');
    expect(cache?.pages[0]?.[0]?.failureReason).toBe('text_locked_24h');
  });

  it('rejects empty body before touching the server', async () => {
    const fromMock = jest.fn();
    const supabaseMock = { ...buildAuthMock(), from: fromMock };

    const { getSupabaseClient } = jest.requireMock('@/lib/supabase') as {
      getSupabaseClient: jest.Mock;
    };
    getSupabaseClient.mockReturnValue(supabaseMock);

    const queryClient = makeQueryClient();
    jest.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);

    const { result } = renderHook(() => useSendTextMessage(), {
      wrapper: makeWrapper(queryClient),
    });

    await act(async () => {
      result.current.mutate({ conversationId: MOCK_CONV_ID, bodyText: '   ' });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    // Supabase should never have been called.
    expect(fromMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// useStartConversation
// ---------------------------------------------------------------------------

describe('useStartConversation', () => {
  it('calls start_conversation RPC and invalidates the inbox key on success', async () => {
    const convRow = {
      id: 'conv-new',
      user_a: MOCK_UID,
      user_b: 'user-other',
      initiator_id: MOCK_UID,
      first_reply_at: null,
      last_message_at: null,
      created_at: '2026-05-24T10:00:00Z',
    };

    const rpcMock = jest.fn().mockResolvedValue({ data: [convRow], error: null });
    const supabaseMock = { ...buildAuthMock(), rpc: rpcMock };

    const { getSupabaseClient } = jest.requireMock('@/lib/supabase') as {
      getSupabaseClient: jest.Mock;
    };
    getSupabaseClient.mockReturnValue(supabaseMock);

    const queryClient = makeQueryClient();
    const invalidateSpy = jest
      .spyOn(queryClient, 'invalidateQueries')
      .mockResolvedValue(undefined);

    const { result } = renderHook(() => useStartConversation(), {
      wrapper: makeWrapper(queryClient),
    });

    await act(async () => {
      result.current.mutate({ otherUserId: 'user-other' });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(rpcMock).toHaveBeenCalledWith('start_conversation', {
      p_other_user_id: 'user-other',
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: chatQueryKeys.inbox });
    expect(result.current.data?.id).toBe('conv-new');
  });

  it('surfaces the RPC error message when start_conversation fails', async () => {
    const rpcMock = jest.fn().mockResolvedValue({
      data: null,
      error: { message: 'messages.blocked' },
    });
    const supabaseMock = { ...buildAuthMock(), rpc: rpcMock };

    const { getSupabaseClient } = jest.requireMock('@/lib/supabase') as {
      getSupabaseClient: jest.Mock;
    };
    getSupabaseClient.mockReturnValue(supabaseMock);

    const queryClient = makeQueryClient();
    jest.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);

    const { result } = renderHook(() => useStartConversation(), {
      wrapper: makeWrapper(queryClient),
    });

    await act(async () => {
      result.current.mutate({ otherUserId: 'user-other' });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('messages.blocked');
  });
});
