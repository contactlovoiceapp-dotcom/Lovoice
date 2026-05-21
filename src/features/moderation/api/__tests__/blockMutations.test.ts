/* Tests for useBlockUser: correct insert shape, 23505 idempotency, error rejection, and query invalidation. */

import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { useBlockUser } from '../blockMutations';
import { feedQueryKeys } from '@/features/feed/api/feedQueries';
import { likeQueryKeys } from '@/features/likes/api/likeQueries';

jest.mock('@/lib/supabase');

const MOCK_UID = 'blocker-user';
const BLOCKED_UID = 'blocked-user';

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

describe('useBlockUser', () => {
  it('calls insert with the correct blocker_id and blocked_id', async () => {
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
    const { result } = renderHook(() => useBlockUser(), { wrapper: makeWrapper(queryClient) });

    await act(async () => {
      result.current.mutate({ blockedUserId: BLOCKED_UID });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(supabaseMock.from).toHaveBeenCalledWith('blocks');
    expect(insertMock).toHaveBeenCalledWith({ blocker_id: MOCK_UID, blocked_id: BLOCKED_UID });
  });

  it('treats a 23505 unique violation as success (idempotent already-blocked)', async () => {
    const insertMock = jest.fn().mockResolvedValue({ error: { code: '23505', message: 'duplicate key' } });
    const supabaseMock = {
      ...buildAuthMock(),
      from: jest.fn().mockReturnValue({ insert: insertMock }),
    };

    const { getSupabaseClient } = jest.requireMock('@/lib/supabase') as {
      getSupabaseClient: jest.Mock;
    };
    getSupabaseClient.mockReturnValue(supabaseMock);

    const queryClient = makeQueryClient();
    const { result } = renderHook(() => useBlockUser(), { wrapper: makeWrapper(queryClient) });

    await act(async () => {
      result.current.mutate({ blockedUserId: BLOCKED_UID });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it('rejects on other supabase errors', async () => {
    const insertMock = jest.fn().mockResolvedValue({ error: { code: '42501', message: 'permission denied' } });
    const supabaseMock = {
      ...buildAuthMock(),
      from: jest.fn().mockReturnValue({ insert: insertMock }),
    };

    const { getSupabaseClient } = jest.requireMock('@/lib/supabase') as {
      getSupabaseClient: jest.Mock;
    };
    getSupabaseClient.mockReturnValue(supabaseMock);

    const queryClient = makeQueryClient();
    const { result } = renderHook(() => useBlockUser(), { wrapper: makeWrapper(queryClient) });

    await act(async () => {
      result.current.mutate({ blockedUserId: BLOCKED_UID });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('permission denied');
  });

  it('invalidates feedQueryKeys.all and likeQueryKeys.all on success', async () => {
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
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useBlockUser(), { wrapper: makeWrapper(queryClient) });

    await act(async () => {
      result.current.mutate({ blockedUserId: BLOCKED_UID });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: feedQueryKeys.all });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: likeQueryKeys.all });
  });
});
