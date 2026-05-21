/* Tests for likeMutations: useLikeVoice and useUnlikeVoice optimistic updates and invalidation. */

import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { useLikeVoice, useUnlikeVoice } from '../likeMutations';
import { likeQueryKeys } from '../likeQueries';

jest.mock('@/lib/supabase');

const MOCK_UID = 'user-me';

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

// ---------------------------------------------------------------------------
// useLikeVoice
// ---------------------------------------------------------------------------

describe('useLikeVoice', () => {
  it('calls upsert with the right shape and adds voiceId to likedIds cache optimistically', async () => {
    const upsertMock = jest.fn().mockResolvedValue({ error: null });
    const supabaseMock = {
      ...buildAuthMock(),
      from: jest.fn().mockReturnValue({ upsert: upsertMock }),
    };

    const { getSupabaseClient } = jest.requireMock('@/lib/supabase') as {
      getSupabaseClient: jest.Mock;
    };
    getSupabaseClient.mockReturnValue(supabaseMock);

    const queryClient = makeQueryClient();
    // Pre-seed the likedIds cache with an empty set.
    queryClient.setQueryData<Set<string>>(likeQueryKeys.likedIds(MOCK_UID), new Set());

    const { result } = renderHook(() => useLikeVoice(), { wrapper: makeWrapper(queryClient) });

    await act(async () => {
      result.current.mutate({ voiceId: 'voice-abc', ownerId: 'owner-xyz' });
    });

    // Optimistic update should have added the voiceId before the server responds.
    // Wait for mutation to settle.
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(supabaseMock.from).toHaveBeenCalledWith('likes');
    expect(upsertMock).toHaveBeenCalledWith(
      { liker_id: MOCK_UID, voice_id: 'voice-abc' },
      { onConflict: 'liker_id,voice_id', ignoreDuplicates: true },
    );

    const cached = queryClient.getQueryData<Set<string>>(likeQueryKeys.likedIds(MOCK_UID));
    expect(cached?.has('voice-abc')).toBe(true);
  });

  it('rolls back the optimistic add on error', async () => {
    const upsertMock = jest.fn().mockResolvedValue({ error: { message: 'DB error' } });
    const supabaseMock = {
      ...buildAuthMock(),
      from: jest.fn().mockReturnValue({ upsert: upsertMock }),
    };

    const { getSupabaseClient } = jest.requireMock('@/lib/supabase') as {
      getSupabaseClient: jest.Mock;
    };
    getSupabaseClient.mockReturnValue(supabaseMock);

    const queryClient = makeQueryClient();
    const initial = new Set<string>(['voice-existing']);
    queryClient.setQueryData<Set<string>>(likeQueryKeys.likedIds(MOCK_UID), initial);

    const { result } = renderHook(() => useLikeVoice(), { wrapper: makeWrapper(queryClient) });

    await act(async () => {
      result.current.mutate({ voiceId: 'voice-new', ownerId: 'owner-xyz' });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    const cached = queryClient.getQueryData<Set<string>>(likeQueryKeys.likedIds(MOCK_UID));
    expect(cached?.has('voice-new')).toBe(false);
    expect(cached?.has('voice-existing')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// useUnlikeVoice
// ---------------------------------------------------------------------------

describe('useUnlikeVoice', () => {
  it('calls delete with the right eq chain and removes voiceId from cache optimistically', async () => {
    const eqVoice = jest.fn().mockResolvedValue({ error: null });
    const eqLiker = jest.fn().mockReturnValue({ eq: eqVoice });
    const deleteMock = jest.fn().mockReturnValue({ eq: eqLiker });

    const supabaseMock = {
      ...buildAuthMock(),
      from: jest.fn().mockReturnValue({ delete: deleteMock }),
    };

    const { getSupabaseClient } = jest.requireMock('@/lib/supabase') as {
      getSupabaseClient: jest.Mock;
    };
    getSupabaseClient.mockReturnValue(supabaseMock);

    const queryClient = makeQueryClient();
    queryClient.setQueryData<Set<string>>(
      likeQueryKeys.likedIds(MOCK_UID),
      new Set(['voice-liked', 'voice-other']),
    );

    const { result } = renderHook(() => useUnlikeVoice(), { wrapper: makeWrapper(queryClient) });

    await act(async () => {
      result.current.mutate({ voiceId: 'voice-liked' });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(supabaseMock.from).toHaveBeenCalledWith('likes');
    expect(deleteMock).toHaveBeenCalled();
    expect(eqLiker).toHaveBeenCalledWith('liker_id', MOCK_UID);
    expect(eqVoice).toHaveBeenCalledWith('voice_id', 'voice-liked');

    const cached = queryClient.getQueryData<Set<string>>(likeQueryKeys.likedIds(MOCK_UID));
    expect(cached?.has('voice-liked')).toBe(false);
    expect(cached?.has('voice-other')).toBe(true);
  });

  it('rolls back the optimistic remove on error', async () => {
    const eqVoice = jest.fn().mockResolvedValue({ error: { message: 'DB error' } });
    const eqLiker = jest.fn().mockReturnValue({ eq: eqVoice });
    const deleteMock = jest.fn().mockReturnValue({ eq: eqLiker });

    const supabaseMock = {
      ...buildAuthMock(),
      from: jest.fn().mockReturnValue({ delete: deleteMock }),
    };

    const { getSupabaseClient } = jest.requireMock('@/lib/supabase') as {
      getSupabaseClient: jest.Mock;
    };
    getSupabaseClient.mockReturnValue(supabaseMock);

    const queryClient = makeQueryClient();
    const initial = new Set<string>(['voice-liked']);
    queryClient.setQueryData<Set<string>>(likeQueryKeys.likedIds(MOCK_UID), initial);

    const { result } = renderHook(() => useUnlikeVoice(), { wrapper: makeWrapper(queryClient) });

    await act(async () => {
      result.current.mutate({ voiceId: 'voice-liked' });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    const cached = queryClient.getQueryData<Set<string>>(likeQueryKeys.likedIds(MOCK_UID));
    expect(cached?.has('voice-liked')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// invalidation on success
// ---------------------------------------------------------------------------

describe('invalidation on success', () => {
  it('useLikeVoice invalidates received and given query keys on success', async () => {
    const upsertMock = jest.fn().mockResolvedValue({ error: null });
    const supabaseMock = {
      ...buildAuthMock(),
      from: jest.fn().mockReturnValue({ upsert: upsertMock }),
    };

    const { getSupabaseClient } = jest.requireMock('@/lib/supabase') as {
      getSupabaseClient: jest.Mock;
    };
    getSupabaseClient.mockReturnValue(supabaseMock);

    const queryClient = makeQueryClient();
    queryClient.setQueryData<Set<string>>(likeQueryKeys.likedIds(MOCK_UID), new Set());
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useLikeVoice(), { wrapper: makeWrapper(queryClient) });

    await act(async () => {
      result.current.mutate({ voiceId: 'voice-x', ownerId: 'owner-x' });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: likeQueryKeys.received });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: likeQueryKeys.given });
  });

  it('useUnlikeVoice invalidates the given query key on success', async () => {
    const eqVoice = jest.fn().mockResolvedValue({ error: null });
    const eqLiker = jest.fn().mockReturnValue({ eq: eqVoice });
    const deleteMock = jest.fn().mockReturnValue({ eq: eqLiker });

    const supabaseMock = {
      ...buildAuthMock(),
      from: jest.fn().mockReturnValue({ delete: deleteMock }),
    };

    const { getSupabaseClient } = jest.requireMock('@/lib/supabase') as {
      getSupabaseClient: jest.Mock;
    };
    getSupabaseClient.mockReturnValue(supabaseMock);

    const queryClient = makeQueryClient();
    queryClient.setQueryData<Set<string>>(likeQueryKeys.likedIds(MOCK_UID), new Set(['voice-y']));
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useUnlikeVoice(), { wrapper: makeWrapper(queryClient) });

    await act(async () => {
      result.current.mutate({ voiceId: 'voice-y' });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: likeQueryKeys.given });
  });
});
