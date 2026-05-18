/* Tests for feed mutations: useMarkFeedSeen batch insert and useResetFeedSeen. */

import React, { type ReactNode } from 'react';
import { renderHook, waitFor, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { getSupabaseClient } from '@/lib/supabase';
import { useMarkFeedSeen, useResetFeedSeen } from '../feedMutations';

jest.mock('@/lib/supabase', () => ({
  getSupabaseClient: jest.fn(),
}));

function createWrapper(): React.ComponentType<{ children: ReactNode }> {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false, gcTime: 0 },
    },
  });

  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

describe('useMarkFeedSeen', () => {
  const MOCK_UID = 'user-abc';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('builds a row per voiceId with the caller uid on happy path', async () => {
    const upsert = jest.fn().mockResolvedValue({ error: null });

    jest.mocked(getSupabaseClient).mockReturnValue({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: MOCK_UID } } }) },
      from: jest.fn().mockReturnValue({ upsert }),
    } as unknown as ReturnType<typeof getSupabaseClient>);

    const { result } = renderHook(() => useMarkFeedSeen(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate({ voiceIds: ['v-1', 'v-2', 'v-3'] });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(upsert).toHaveBeenCalledWith(
      [
        { user_id: MOCK_UID, voice_id: 'v-1' },
        { user_id: MOCK_UID, voice_id: 'v-2' },
        { user_id: MOCK_UID, voice_id: 'v-3' },
      ],
      { onConflict: 'user_id,voice_id', ignoreDuplicates: true },
    );
  });

  it('resolves immediately without touching Supabase when voiceIds is empty', async () => {
    const fromSpy = jest.fn();

    jest.mocked(getSupabaseClient).mockReturnValue({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: MOCK_UID } } }) },
      from: fromSpy,
    } as unknown as ReturnType<typeof getSupabaseClient>);

    const { result } = renderHook(() => useMarkFeedSeen(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate({ voiceIds: [] });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fromSpy).not.toHaveBeenCalled();
  });

  it('rejects with feed.session_missing when no session exists', async () => {
    jest.mocked(getSupabaseClient).mockReturnValue({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: null } }) },
      from: jest.fn(),
    } as unknown as ReturnType<typeof getSupabaseClient>);

    const { result } = renderHook(() => useMarkFeedSeen(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate({ voiceIds: ['v-1'] });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error?.message).toBe('feed.session_missing');
  });
});

describe('useResetFeedSeen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('calls reset_feed_seen RPC and resolves on success', async () => {
    const rpc = jest.fn().mockResolvedValue({ error: null });

    jest.mocked(getSupabaseClient).mockReturnValue({
      rpc,
    } as unknown as ReturnType<typeof getSupabaseClient>);

    const { result } = renderHook(() => useResetFeedSeen(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate();
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(rpc).toHaveBeenCalledWith('reset_feed_seen');
  });

  it('surfaces an RPC error as the mutation error', async () => {
    const rpc = jest.fn().mockResolvedValue({ error: { message: 'feed.reset_failed' } });

    jest.mocked(getSupabaseClient).mockReturnValue({
      rpc,
    } as unknown as ReturnType<typeof getSupabaseClient>);

    const { result } = renderHook(() => useResetFeedSeen(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate();
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error?.message).toBe('feed.reset_failed');
  });
});
