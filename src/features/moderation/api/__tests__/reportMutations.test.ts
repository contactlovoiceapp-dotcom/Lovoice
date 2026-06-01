/* Tests for useReportContent: report row shape, automatic block insert, message sender lookup, and errors. */

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

interface ReportingMocksOpts {
  reportInsertError?: unknown | null;
  blockInsertError?: { message: string; code?: string } | null;
  messageSenderId?: string | null;
}

function attachReportingTableMocks(
  supabaseMock: { auth: ReturnType<typeof buildAuthMock>['auth']; from: jest.Mock },
  opts: ReportingMocksOpts = {},
) {
  const insertReports = jest.fn().mockResolvedValue({ error: opts.reportInsertError ?? null });
  const insertBlocks = jest.fn().mockResolvedValue({ error: opts.blockInsertError ?? null });

  supabaseMock.from = jest.fn((table: string) => {
    if (table === 'reports') {
      return { insert: insertReports };
    }
    if (table === 'blocks') {
      return { insert: insertBlocks };
    }
    if (table === 'messages') {
      return {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            maybeSingle: jest.fn().mockResolvedValue({
              data: opts.messageSenderId ? { sender_id: opts.messageSenderId } : null,
              error: null,
            }),
          }),
        }),
      };
    }
    return { insert: jest.fn().mockResolvedValue({ error: null }) };
  });

  return { insertReports, insertBlocks };
}

describe('useReportContent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('inserts report then blocks the voice author', async () => {
    const supabaseMock = {
      ...buildAuthMock(),
      from: jest.fn(),
    };
    const { insertReports, insertBlocks } = attachReportingTableMocks(supabaseMock);

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

    expect(insertReports).toHaveBeenCalledWith({
      reporter_id: MOCK_UID,
      target_voice_id: VOICE_ID,
      target_user_id: USER_ID,
      reason: 'spam',
      free_text: 'some context',
    });
    expect(insertBlocks).toHaveBeenCalledWith({ blocker_id: MOCK_UID, blocked_id: USER_ID });
  });

  it('builds the correct row for targetKind "message" and blocks the resolved sender', async () => {
    const supabaseMock = {
      ...buildAuthMock(),
      from: jest.fn(),
    };
    const { insertReports, insertBlocks } = attachReportingTableMocks(supabaseMock, {
      messageSenderId: 'sender-999',
    });

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

    expect(insertReports).toHaveBeenCalledWith({
      reporter_id: MOCK_UID,
      target_message_id: MESSAGE_ID,
      reason: 'harassment',
      free_text: null,
    });
    expect(insertBlocks).toHaveBeenCalledWith({ blocker_id: MOCK_UID, blocked_id: 'sender-999' });
  });

  it('blocks targetUserId directly for targetKind "profile"', async () => {
    const supabaseMock = {
      ...buildAuthMock(),
      from: jest.fn(),
    };
    const { insertReports, insertBlocks } = attachReportingTableMocks(supabaseMock);

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

    expect(insertReports).toHaveBeenCalledWith({
      reporter_id: MOCK_UID,
      target_user_id: USER_ID,
      reason: 'hate',
      free_text: null,
    });
    expect(insertBlocks).toHaveBeenCalledWith({ blocker_id: MOCK_UID, blocked_id: USER_ID });
  });

  it('does not block when the reported user is yourself', async () => {
    const supabaseMock = {
      ...buildAuthMock(MOCK_UID),
      from: jest.fn(),
    };
    const { insertReports, insertBlocks } = attachReportingTableMocks(supabaseMock);

    const { getSupabaseClient } = jest.requireMock('@/lib/supabase') as {
      getSupabaseClient: jest.Mock;
    };
    getSupabaseClient.mockReturnValue(supabaseMock);

    const queryClient = makeQueryClient();
    const { result } = renderHook(() => useReportContent(), { wrapper: makeWrapper(queryClient) });

    await act(async () => {
      result.current.mutate({
        targetKind: 'profile',
        targetId: MOCK_UID,
        targetUserId: null,
        reason: 'other',
        freeText: '',
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(insertReports).toHaveBeenCalled();
    expect(insertBlocks).not.toHaveBeenCalled();
  });

  it('converts whitespace-only freeText to null', async () => {
    const supabaseMock = {
      ...buildAuthMock(),
      from: jest.fn(),
    };
    const { insertReports } = attachReportingTableMocks(supabaseMock);

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

    const callArg = insertReports.mock.calls[0][0] as Record<string, unknown>;
    expect(callArg.free_text).toBeNull();
  });

  it('treats duplicate block (23505) as success', async () => {
    const supabaseMock = {
      ...buildAuthMock(),
      from: jest.fn(),
    };
    attachReportingTableMocks(supabaseMock, {
      blockInsertError: { message: 'duplicate', code: '23505' },
    });

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

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it('rejects on a supabase report error', async () => {
    const supabaseMock = {
      ...buildAuthMock(),
      from: jest.fn(),
    };
    attachReportingTableMocks(supabaseMock, {
      reportInsertError: { message: 'constraint violation' },
    });

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

  it('maps Postgres rate_limit_exceeded to moderation.rate_limit_exceeded', async () => {
    const supabaseMock = {
      ...buildAuthMock(),
      from: jest.fn(),
    };
    attachReportingTableMocks(supabaseMock, {
      reportInsertError: { message: 'rate_limit_exceeded' },
    });

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
        freeText: '',
      });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('moderation.rate_limit_exceeded');
  });

  it('rejects when targetKind voice is missing targetUserId', async () => {
    const supabaseMock = {
      ...buildAuthMock(),
      from: jest.fn(),
    };
    attachReportingTableMocks(supabaseMock);

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
        targetUserId: null,
        reason: 'spam',
        freeText: '',
      });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('moderation.report_voice_missing_author');
  });
});
