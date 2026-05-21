/* Tests for useReportContent: correct row shape per targetKind, freeText trimming, and error rejection. */

import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { useReportContent } from '../reportMutations';

jest.mock('@/lib/supabase');

const MOCK_UID = 'reporter-user';
const VOICE_ID = 'voice-123';
const USER_ID = 'author-456';
const MESSAGE_ID = 'msg-789';

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
    },
  };
}

describe('useReportContent', () => {
  it('builds the correct row for targetKind "voice" (includes both target_voice_id and target_user_id)', async () => {
    const insertMock = jest.fn().mockResolvedValue({ error: null });
    const supabaseMock = {
      ...buildAuthMock(),
      from: jest.fn().mockReturnValue({ insert: insertMock }),
    };

    const { getSupabaseClient } = jest.requireMock('@/lib/supabase') as {
      getSupabaseClient: jest.Mock;
    };
    getSupabaseClient.mockReturnValue(supabaseMock);

    const queryClient = makeQueryClient();
    const { result } = renderHook(() => useReportContent(), { wrapper: makeWrapper(queryClient) });

    await act(async () => {
      result.current.mutate({
        targetKind: 'voice',
        targetId: VOICE_ID,
        targetUserId: USER_ID,
        reason: 'spam',
        freeText: 'some context',
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(supabaseMock.from).toHaveBeenCalledWith('reports');
    expect(insertMock).toHaveBeenCalledWith({
      reporter_id: MOCK_UID,
      target_voice_id: VOICE_ID,
      target_user_id: USER_ID,
      reason: 'spam',
      free_text: 'some context',
    });
  });

  it('builds the correct row for targetKind "message"', async () => {
    const insertMock = jest.fn().mockResolvedValue({ error: null });
    const supabaseMock = {
      ...buildAuthMock(),
      from: jest.fn().mockReturnValue({ insert: insertMock }),
    };

    const { getSupabaseClient } = jest.requireMock('@/lib/supabase') as {
      getSupabaseClient: jest.Mock;
    };
    getSupabaseClient.mockReturnValue(supabaseMock);

    const queryClient = makeQueryClient();
    const { result } = renderHook(() => useReportContent(), { wrapper: makeWrapper(queryClient) });

    await act(async () => {
      result.current.mutate({
        targetKind: 'message',
        targetId: MESSAGE_ID,
        targetUserId: null,
        reason: 'harassment',
        freeText: '',
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(insertMock).toHaveBeenCalledWith({
      reporter_id: MOCK_UID,
      target_message_id: MESSAGE_ID,
      reason: 'harassment',
      free_text: null,
    });
  });

  it('builds the correct row for targetKind "profile"', async () => {
    const insertMock = jest.fn().mockResolvedValue({ error: null });
    const supabaseMock = {
      ...buildAuthMock(),
      from: jest.fn().mockReturnValue({ insert: insertMock }),
    };

    const { getSupabaseClient } = jest.requireMock('@/lib/supabase') as {
      getSupabaseClient: jest.Mock;
    };
    getSupabaseClient.mockReturnValue(supabaseMock);

    const queryClient = makeQueryClient();
    const { result } = renderHook(() => useReportContent(), { wrapper: makeWrapper(queryClient) });

    await act(async () => {
      result.current.mutate({
        targetKind: 'profile',
        targetId: USER_ID,
        targetUserId: null,
        reason: 'hate',
        freeText: '  ',
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(insertMock).toHaveBeenCalledWith({
      reporter_id: MOCK_UID,
      target_user_id: USER_ID,
      reason: 'hate',
      // Whitespace-only freeText is trimmed to null.
      free_text: null,
    });
  });

  it('converts whitespace-only freeText to null', async () => {
    const insertMock = jest.fn().mockResolvedValue({ error: null });
    const supabaseMock = {
      ...buildAuthMock(),
      from: jest.fn().mockReturnValue({ insert: insertMock }),
    };

    const { getSupabaseClient } = jest.requireMock('@/lib/supabase') as {
      getSupabaseClient: jest.Mock;
    };
    getSupabaseClient.mockReturnValue(supabaseMock);

    const queryClient = makeQueryClient();
    const { result } = renderHook(() => useReportContent(), { wrapper: makeWrapper(queryClient) });

    await act(async () => {
      result.current.mutate({
        targetKind: 'voice',
        targetId: VOICE_ID,
        targetUserId: USER_ID,
        reason: 'other',
        freeText: '   ',
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const callArg = insertMock.mock.calls[0][0] as Record<string, unknown>;
    expect(callArg.free_text).toBeNull();
  });

  it('rejects on a supabase error', async () => {
    const insertMock = jest.fn().mockResolvedValue({ error: { message: 'constraint violation' } });
    const supabaseMock = {
      ...buildAuthMock(),
      from: jest.fn().mockReturnValue({ insert: insertMock }),
    };

    const { getSupabaseClient } = jest.requireMock('@/lib/supabase') as {
      getSupabaseClient: jest.Mock;
    };
    getSupabaseClient.mockReturnValue(supabaseMock);

    const queryClient = makeQueryClient();
    const { result } = renderHook(() => useReportContent(), { wrapper: makeWrapper(queryClient) });

    await act(async () => {
      result.current.mutate({
        targetKind: 'voice',
        targetId: VOICE_ID,
        targetUserId: USER_ID,
        reason: 'inappropriate',
        freeText: '',
      });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('constraint violation');
  });
});
