/* Tests for the feed query hooks: useFeedItems pagination and row mapping. */

import React, { type ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { getSupabaseClient } from '@/lib/supabase';
import type { FeedItemRow } from '../../types';
import { useFeedItems, feedQueryKeys } from '../feedQueries';
import type { FeedFilters } from '../../hooks/useFeedState';
import { DEFAULT_FILTERS } from '../../hooks/useFeedState';

jest.mock('@/lib/supabase', () => ({
  getSupabaseClient: jest.fn(),
}));

function makeRow(overrides: Partial<FeedItemRow> = {}): FeedItemRow {
  return {
    voice_id: 'voice-1',
    storage_path: 'user-1/voice-1.m4a',
    duration_ms: 30_000,
    theme: 'sunset',
    title: 'Mon histoire',
    prompt_body: 'Raconte-moi...',
    created_at: '2026-05-12T12:00:00.000Z',
    user_id: 'user-1',
    display_name: 'Alex',
    birthdate: '1996-03-15',
    city: 'Paris',
    bio_emojis: ['😂', '🌯'],
    ...overrides,
  };
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

describe('feedQueryKeys', () => {
  it('namespaces all keys under "feed"', () => {
    expect(feedQueryKeys.all).toEqual(['feed']);
    expect(feedQueryKeys.list(DEFAULT_FILTERS)).toEqual(['feed', 'list', DEFAULT_FILTERS]);
  });
});

describe('useFeedItems', () => {
  const filters: FeedFilters = DEFAULT_FILTERS;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('calls supabase.rpc with the right args', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: [], error: null });

    jest.mocked(getSupabaseClient).mockReturnValue({
      rpc,
    } as unknown as ReturnType<typeof getSupabaseClient>);

    const { result } = renderHook(() => useFeedItems(filters), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(rpc).toHaveBeenCalledWith('get_feed', {
      p_distance_m: undefined,
      p_limit: 20,
      p_cursor_created_at: undefined,
    });
  });

  it('maps a row to FeedItem shape correctly', async () => {
    const row = makeRow();
    const rpc = jest.fn().mockResolvedValue({ data: [row], error: null });

    jest.mocked(getSupabaseClient).mockReturnValue({
      rpc,
    } as unknown as ReturnType<typeof getSupabaseClient>);

    const { result } = renderHook(() => useFeedItems(filters), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const item = result.current.data?.pages[0].items[0];
    expect(item).toMatchObject({
      voiceId: 'voice-1',
      storagePath: 'user-1/voice-1.m4a',
      durationMs: 30_000,
      theme: 'sunset',
      title: 'Mon histoire',
      promptBody: 'Raconte-moi...',
      createdAt: '2026-05-12T12:00:00.000Z',
      userId: 'user-1',
      displayName: 'Alex',
      birthdate: '1996-03-15',
      city: 'Paris',
      bioEmojis: ['😂', '🌯'],
    });
  });

  it('normalises an unknown theme to "sunset"', async () => {
    const row = makeRow({ theme: 'unknown-theme' });
    const rpc = jest.fn().mockResolvedValue({ data: [row], error: null });

    jest.mocked(getSupabaseClient).mockReturnValue({
      rpc,
    } as unknown as ReturnType<typeof getSupabaseClient>);

    const { result } = renderHook(() => useFeedItems(filters), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.pages[0].items[0].theme).toBe('sunset');
  });

  it('surfaces an RPC error as the hook error', async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: null,
      error: { message: 'feed.rpc_error' },
    });

    jest.mocked(getSupabaseClient).mockReturnValue({
      rpc,
    } as unknown as ReturnType<typeof getSupabaseClient>);

    const { result } = renderHook(() => useFeedItems(filters), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error?.message).toBe('feed.rpc_error');
  });

  it('sets nextCursor to last row created_at when page is full (20 rows)', async () => {
    const rows = Array.from({ length: 20 }, (_, i) =>
      makeRow({ voice_id: `v-${i}`, created_at: `2026-05-${String(i + 1).padStart(2, '0')}T12:00:00.000Z` }),
    );
    const rpc = jest.fn().mockResolvedValue({ data: rows, error: null });

    jest.mocked(getSupabaseClient).mockReturnValue({
      rpc,
    } as unknown as ReturnType<typeof getSupabaseClient>);

    const { result } = renderHook(() => useFeedItems(filters), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.pages[0].nextCursor).toBe('2026-05-20T12:00:00.000Z');
  });

  it('sets nextCursor to null when the page is empty', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: [], error: null });

    jest.mocked(getSupabaseClient).mockReturnValue({
      rpc,
    } as unknown as ReturnType<typeof getSupabaseClient>);

    const { result } = renderHook(() => useFeedItems(filters), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.pages[0].nextCursor).toBeNull();
  });
});
