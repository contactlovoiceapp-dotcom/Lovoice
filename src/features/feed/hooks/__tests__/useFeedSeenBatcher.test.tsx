/* Unit tests for useFeedSeenBatcher: batching semantics, timer flush, and unmount cleanup. */

import React, { type ReactNode } from 'react';
import { renderHook, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { getSupabaseClient } from '@/lib/supabase';
import { useFeedSeenBatcher } from '../useFeedSeenBatcher';

jest.mock('@/lib/supabase', () => ({
  getSupabaseClient: jest.fn(),
}));

function buildSupabaseMock(uid = 'user-test') {
  const upsert = jest.fn().mockResolvedValue({ error: null });
  jest.mocked(getSupabaseClient).mockReturnValue({
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: uid } } }) },
    from: jest.fn().mockReturnValue({ upsert }),
  } as unknown as ReturnType<typeof getSupabaseClient>);
  return { upsert };
}

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

describe('useFeedSeenBatcher', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('triggers an immediate flush when 5 unique IDs are enqueued', async () => {
    const { upsert } = buildSupabaseMock();
    const { result } = renderHook(() => useFeedSeenBatcher(), { wrapper: createWrapper() });

    act(() => {
      result.current.enqueue('v-1');
      result.current.enqueue('v-2');
      result.current.enqueue('v-3');
      result.current.enqueue('v-4');
      result.current.enqueue('v-5');
    });

    // Allow async mutation to settle
    await act(async () => {
      await Promise.resolve();
    });

    expect(upsert).toHaveBeenCalledTimes(1);
    const rows = upsert.mock.calls[0][0] as { user_id: string; voice_id: string }[];
    expect(rows).toHaveLength(5);
    expect(rows.map((r) => r.voice_id)).toEqual(['v-1', 'v-2', 'v-3', 'v-4', 'v-5']);
  });

  it('flushes a pending batch after the 30s timer fires', async () => {
    const { upsert } = buildSupabaseMock();
    const { result } = renderHook(() => useFeedSeenBatcher(), { wrapper: createWrapper() });

    act(() => {
      result.current.enqueue('v-a');
      result.current.enqueue('v-b');
    });

    // Advance timer to trigger the 30s interval
    act(() => {
      jest.advanceTimersByTime(30_000);
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(upsert).toHaveBeenCalledTimes(1);
    const rows = upsert.mock.calls[0][0] as { user_id: string; voice_id: string }[];
    expect(rows).toHaveLength(2);
  });

  it('ignores duplicate enqueues within the same pending batch', async () => {
    const { upsert } = buildSupabaseMock();
    const { result } = renderHook(() => useFeedSeenBatcher(), { wrapper: createWrapper() });

    act(() => {
      result.current.enqueue('v-dup');
      result.current.enqueue('v-dup');
      result.current.enqueue('v-dup');
    });

    act(() => {
      jest.advanceTimersByTime(30_000);
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(upsert).toHaveBeenCalledTimes(1);
    const rows = upsert.mock.calls[0][0] as { user_id: string; voice_id: string }[];
    expect(rows).toHaveLength(1);
    expect(rows[0].voice_id).toBe('v-dup');
  });

  it('flushes the pending batch on unmount', async () => {
    const { upsert } = buildSupabaseMock();
    const { result, unmount } = renderHook(() => useFeedSeenBatcher(), {
      wrapper: createWrapper(),
    });

    act(() => {
      result.current.enqueue('v-unmount');
    });

    unmount();

    await act(async () => {
      await Promise.resolve();
    });

    expect(upsert).toHaveBeenCalledTimes(1);
    const rows = upsert.mock.calls[0][0] as { user_id: string; voice_id: string }[];
    expect(rows[0].voice_id).toBe('v-unmount');
  });
});
