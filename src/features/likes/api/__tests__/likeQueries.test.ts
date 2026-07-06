/* Tests for likeQueries: useLikedVoiceIds, useReceivedLikes, useGivenLikes. */

import React from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { useLikedVoiceIds, useReceivedLikes, useGivenLikes } from '../likeQueries';

jest.mock('@/lib/supabase');

// ---------------------------------------------------------------------------
// Chainable mock builder — mirrors the pattern used across this codebase.
// Each select/eq/order/limit returns `this` so chains resolve to the terminal call.
// ---------------------------------------------------------------------------

type MockResult = { data: unknown; error: null | { message: string } };

function buildSupabaseMock(result: MockResult) {
  const chain: Record<string, jest.Mock> = {};

  const terminal = jest.fn().mockResolvedValue(result);

  chain.from = jest.fn().mockReturnValue(chain);
  chain.select = jest.fn().mockReturnValue(chain);
  chain.eq = jest.fn().mockReturnValue(chain);
  chain.order = jest.fn().mockReturnValue(chain);
  chain.limit = terminal;

  return chain;
}

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
    defaultOptions: { queries: { retry: false } },
  });
}

// ---------------------------------------------------------------------------
// useLikedVoiceIds
// ---------------------------------------------------------------------------

describe('useLikedVoiceIds', () => {
  it('returns a Set of voice_ids when supabase returns rows', async () => {
    const mockData = [
      { voice_id: 'voice-1' },
      { voice_id: 'voice-2' },
    ];

    const chain = buildSupabaseMock({ data: mockData, error: null });

    // Override limit to resolve immediately (terminal for this query)
    chain.limit = jest.fn().mockResolvedValue({ data: mockData, error: null });

    // For useLikedVoiceIds, the chain ends at eq (not limit).
    // select → eq (terminal for this query).
    chain.eq = jest.fn().mockResolvedValue({ data: mockData, error: null });

    const { getSupabaseClient } = jest.requireMock('@/lib/supabase') as {
      getSupabaseClient: jest.Mock;
    };
    getSupabaseClient.mockReturnValue(chain);

    const queryClient = makeQueryClient();

    const { result } = renderHook(
      () => useLikedVoiceIds('user-123'),
      { wrapper: makeWrapper(queryClient) },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toBeInstanceOf(Set);
    expect(result.current.data?.has('voice-1')).toBe(true);
    expect(result.current.data?.has('voice-2')).toBe(true);
    expect(result.current.data?.size).toBe(2);
  });

  it('stays disabled when userId is null', () => {
    const { getSupabaseClient } = jest.requireMock('@/lib/supabase') as {
      getSupabaseClient: jest.Mock;
    };
    getSupabaseClient.mockReturnValue({});

    const queryClient = makeQueryClient();

    const { result } = renderHook(
      () => useLikedVoiceIds(null),
      { wrapper: makeWrapper(queryClient) },
    );

    // Query is disabled — should stay in idle/pending without fetching.
    expect(result.current.isPending).toBe(true);
    expect(result.current.isFetching).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// useReceivedLikes
// ---------------------------------------------------------------------------

function buildReceivedLikesChain(mockData: unknown[]) {
  const chain: Record<string, jest.Mock> = {};
  chain.from = jest.fn().mockReturnValue(chain);
  chain.select = jest.fn().mockReturnValue(chain);
  chain.neq = jest.fn().mockReturnValue(chain);
  chain.order = jest.fn().mockReturnValue(chain);
  chain.limit = jest.fn().mockResolvedValue({ data: mockData, error: null });
  chain.auth = {
    getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'self-uid' } } }),
  } as unknown as jest.Mock;
  return chain;
}

describe('useReceivedLikes', () => {
  it('maps the nested liker join correctly and filters out own likes via neq', async () => {
    const mockData = [
      {
        id: 'like-1',
        voice_id: 'voice-abc',
        created_at: '2026-01-01T00:00:00Z',
        liker: {
          id: 'user-liker',
          display_name: 'Alice',
          birthdate: '1995-06-15',
          city: 'Paris',
          bio_emojis: ['🎸', '☕'],
        },
      },
    ];

    const chain = buildReceivedLikesChain(mockData);

    const { getSupabaseClient } = jest.requireMock('@/lib/supabase') as {
      getSupabaseClient: jest.Mock;
    };
    getSupabaseClient.mockReturnValue(chain);

    const queryClient = makeQueryClient();
    const { result } = renderHook(useReceivedLikes, { wrapper: makeWrapper(queryClient) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(chain.neq).toHaveBeenCalledWith('liker_id', 'self-uid');
    expect(result.current.data).toHaveLength(1);
    expect(result.current.data?.[0]).toEqual({
      likeId: 'like-1',
      voiceId: 'voice-abc',
      createdAt: '2026-01-01T00:00:00Z',
      liker: {
        id: 'user-liker',
        displayName: 'Alice',
        birthdate: '1995-06-15',
        city: 'Paris',
        bioEmojis: ['🎸', '☕'],
      },
    });
  });

  it('skips rows where liker is null', async () => {
    const mockData = [
      {
        id: 'like-2',
        voice_id: 'voice-xyz',
        created_at: '2026-01-02T00:00:00Z',
        liker: null,
      },
      {
        id: 'like-3',
        voice_id: 'voice-def',
        created_at: '2026-01-03T00:00:00Z',
        liker: {
          id: 'user-ok',
          display_name: 'Bob',
          birthdate: '1990-03-20',
          city: 'Lyon',
          bio_emojis: [],
        },
      },
    ];

    const chain = buildReceivedLikesChain(mockData);

    const { getSupabaseClient } = jest.requireMock('@/lib/supabase') as {
      getSupabaseClient: jest.Mock;
    };
    getSupabaseClient.mockReturnValue(chain);

    const queryClient = makeQueryClient();
    const { result } = renderHook(useReceivedLikes, { wrapper: makeWrapper(queryClient) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toHaveLength(1);
    expect(result.current.data?.[0].likeId).toBe('like-3');
  });
});

// ---------------------------------------------------------------------------
// useGivenLikes
// ---------------------------------------------------------------------------

const SELF_UID = 'self-uid';

function buildGivenLikesChain(mockData: unknown[]) {
  const chain: Record<string, jest.Mock> = {};
  chain.from = jest.fn().mockReturnValue(chain);
  chain.select = jest.fn().mockReturnValue(chain);
  chain.order = jest.fn().mockReturnValue(chain);
  chain.limit = jest.fn().mockResolvedValue({ data: mockData, error: null });
  chain.auth = {
    getUser: jest.fn().mockResolvedValue({ data: { user: { id: SELF_UID } } }),
  } as unknown as jest.Mock;
  return chain;
}

describe('useGivenLikes', () => {
  it('maps the doubly-nested voice.author join correctly', async () => {
    const mockData = [
      {
        id: 'like-g1',
        voice_id: 'voice-g1',
        created_at: '2026-02-01T00:00:00Z',
        voice: {
          user_id: 'user-author',
          author: {
            id: 'user-author',
            display_name: 'Charlie',
            birthdate: '1992-11-10',
            city: 'Bruxelles',
            bio_emojis: ['🌍'],
          },
        },
      },
    ];

    const chain = buildGivenLikesChain(mockData);

    const { getSupabaseClient } = jest.requireMock('@/lib/supabase') as {
      getSupabaseClient: jest.Mock;
    };
    getSupabaseClient.mockReturnValue(chain);

    const queryClient = makeQueryClient();
    const { result } = renderHook(useGivenLikes, { wrapper: makeWrapper(queryClient) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toHaveLength(1);
    expect(result.current.data?.[0]).toEqual({
      likeId: 'like-g1',
      voiceId: 'voice-g1',
      createdAt: '2026-02-01T00:00:00Z',
      author: {
        id: 'user-author',
        displayName: 'Charlie',
        birthdate: '1992-11-10',
        city: 'Bruxelles',
        bioEmojis: ['🌍'],
      },
    });
  });

  it('skips rows where voice or author is null', async () => {
    const mockData = [
      {
        id: 'like-g2',
        voice_id: 'voice-g2',
        created_at: '2026-02-02T00:00:00Z',
        voice: null,
      },
      {
        id: 'like-g3',
        voice_id: 'voice-g3',
        created_at: '2026-02-03T00:00:00Z',
        voice: {
          user_id: 'user-x',
          author: null,
        },
      },
      {
        id: 'like-g4',
        voice_id: 'voice-g4',
        created_at: '2026-02-04T00:00:00Z',
        voice: {
          user_id: 'user-y',
          author: {
            id: 'user-y',
            display_name: 'Dana',
            birthdate: '1988-07-05',
            city: 'Genève',
            bio_emojis: ['🍫'],
          },
        },
      },
    ];

    const chain = buildGivenLikesChain(mockData);

    const { getSupabaseClient } = jest.requireMock('@/lib/supabase') as {
      getSupabaseClient: jest.Mock;
    };
    getSupabaseClient.mockReturnValue(chain);

    const queryClient = makeQueryClient();
    const { result } = renderHook(useGivenLikes, { wrapper: makeWrapper(queryClient) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toHaveLength(1);
    expect(result.current.data?.[0].likeId).toBe('like-g4');
  });

  it('excludes self-likes (voice owned by current user)', async () => {
    const mockData = [
      {
        id: 'like-self',
        voice_id: 'voice-own',
        created_at: '2026-02-05T00:00:00Z',
        voice: {
          user_id: SELF_UID,
          author: {
            id: SELF_UID,
            display_name: 'Moi',
            birthdate: '1990-01-01',
            city: 'Paris',
            bio_emojis: [],
          },
        },
      },
      {
        id: 'like-other',
        voice_id: 'voice-other',
        created_at: '2026-02-06T00:00:00Z',
        voice: {
          user_id: 'user-other',
          author: {
            id: 'user-other',
            display_name: 'Eve',
            birthdate: '1995-05-20',
            city: 'Nice',
            bio_emojis: ['☀️'],
          },
        },
      },
    ];

    const chain = buildGivenLikesChain(mockData);

    const { getSupabaseClient } = jest.requireMock('@/lib/supabase') as {
      getSupabaseClient: jest.Mock;
    };
    getSupabaseClient.mockReturnValue(chain);

    const queryClient = makeQueryClient();
    const { result } = renderHook(useGivenLikes, { wrapper: makeWrapper(queryClient) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toHaveLength(1);
    expect(result.current.data?.[0].likeId).toBe('like-other');
  });
});
