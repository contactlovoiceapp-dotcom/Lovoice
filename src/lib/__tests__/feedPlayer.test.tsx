/* Tests for the single-instance feed player: source loading, URL prefetch, controls and lifecycle. */

import { act, renderHook, waitFor } from '@testing-library/react-native';

import { getSupabaseClient } from '@/lib/supabase';
import type { FeedItem } from '@/features/feed/types';

import { __resetSignedUrlCacheForTests, useFeedPlayer } from '../feedPlayer';

jest.mock('@/lib/supabase', () => ({
  getSupabaseClient: jest.fn(),
}));

const expoAudioMock = jest.requireMock('expo-audio') as {
  useAudioPlayer: jest.Mock;
  useAudioPlayerStatus: jest.Mock;
};

const expoAudioMocks = (global as Record<string, unknown>).__expoAudioMocks as {
  player: {
    play: jest.Mock;
    pause: jest.Mock;
    seekTo: jest.Mock;
    replace: jest.Mock;
  };
  playerStatus: {
    playing: boolean;
    currentTime: number;
    duration: number;
    isBuffering: boolean;
    didJustFinish: boolean;
  };
};

function makeItem(overrides: Partial<FeedItem> & Pick<FeedItem, 'voiceId'>): FeedItem {
  return {
    storagePath: `user/${overrides.voiceId}.m4a`,
    durationMs: 30_000,
    theme: 'sunset',
    title: null,
    promptBody: null,
    createdAt: '2026-05-12T12:00:00.000Z',
    userId: 'user-1',
    displayName: 'Alex',
    birthdate: '1996-03-15',
    city: 'Paris',
    bioEmojis: [],
    ...overrides,
  };
}

function mockSupabaseSignedUrls(
  perPath: (path: string) => string = (path) => `https://signed.example/${path}`,
): { createSignedUrl: jest.Mock } {
  const createSignedUrl = jest.fn((path: string) =>
    Promise.resolve({ data: { signedUrl: perPath(path) }, error: null }),
  );
  jest.mocked(getSupabaseClient).mockReturnValue({
    storage: { from: () => ({ createSignedUrl }) },
  } as unknown as ReturnType<typeof getSupabaseClient>);
  return { createSignedUrl };
}

beforeEach(() => {
  jest.clearAllMocks();
  __resetSignedUrlCacheForTests();
  expoAudioMocks.player.play.mockClear();
  expoAudioMocks.player.pause.mockClear();
  expoAudioMocks.player.seekTo.mockClear();
  expoAudioMocks.player.replace.mockClear();
  expoAudioMocks.playerStatus.playing = false;
  expoAudioMocks.playerStatus.currentTime = 0;
  expoAudioMocks.playerStatus.duration = 0;
  expoAudioMocks.playerStatus.isBuffering = false;
  expoAudioMocks.playerStatus.didJustFinish = false;
});

describe('useFeedPlayer — empty list', () => {
  it('returns a zeroed snapshot when items is empty', () => {
    const { result } = renderHook(() => useFeedPlayer({ items: [], currentIndex: 0 }));
    expect(result.current.snapshot).toEqual({
      isPlaying: false,
      positionMs: 0,
      durationMs: 0,
      isLoading: false,
      error: null,
    });
  });

  it('does not call replace() when the list is empty', () => {
    renderHook(() => useFeedPlayer({ items: [], currentIndex: 0 }));
    expect(expoAudioMocks.player.replace).not.toHaveBeenCalled();
  });
});

describe('useFeedPlayer — initial load', () => {
  it('fetches the signed URL and replaces the player source with it', async () => {
    mockSupabaseSignedUrls(() => 'https://signed.example/voice-1.m4a');
    const item = makeItem({ voiceId: 'voice-1', storagePath: 'user/voice-1.m4a' });

    renderHook(() => useFeedPlayer({ items: [item], currentIndex: 0 }));

    await waitFor(() => {
      expect(expoAudioMocks.player.replace).toHaveBeenCalledWith(
        'https://signed.example/voice-1.m4a',
      );
    });
  });

  it('pauses immediately so any previous audio stops the moment the swipe lands', async () => {
    mockSupabaseSignedUrls();
    const item = makeItem({ voiceId: 'voice-1', storagePath: 'user/voice-1.m4a' });

    renderHook(() => useFeedPlayer({ items: [item], currentIndex: 0 }));

    // The pause() in the load effect runs synchronously, before the await for the URL.
    expect(expoAudioMocks.player.pause).toHaveBeenCalled();
  });
});

describe('useFeedPlayer — URL prefetch', () => {
  it('prefetches signed URLs for the next two upcoming items', async () => {
    const { createSignedUrl } = mockSupabaseSignedUrls();
    const items = [
      makeItem({ voiceId: 'v0', storagePath: 'p0' }),
      makeItem({ voiceId: 'v1', storagePath: 'p1' }),
      makeItem({ voiceId: 'v2', storagePath: 'p2' }),
      makeItem({ voiceId: 'v3', storagePath: 'p3' }),
    ];

    renderHook(() => useFeedPlayer({ items, currentIndex: 0 }));

    await waitFor(() => {
      // Current item + two prefetches = three signed URL calls.
      expect(createSignedUrl).toHaveBeenCalledWith('p0', expect.any(Number));
      expect(createSignedUrl).toHaveBeenCalledWith('p1', expect.any(Number));
      expect(createSignedUrl).toHaveBeenCalledWith('p2', expect.any(Number));
    });
    // p3 is too far ahead to prefetch.
    expect(createSignedUrl).not.toHaveBeenCalledWith('p3', expect.any(Number));
  });

  it('does not prefetch beyond the end of the list', async () => {
    const { createSignedUrl } = mockSupabaseSignedUrls();
    const items = [makeItem({ voiceId: 'v0', storagePath: 'p0' })];

    renderHook(() => useFeedPlayer({ items, currentIndex: 0 }));

    await waitFor(() => {
      expect(createSignedUrl).toHaveBeenCalledWith('p0', expect.any(Number));
    });
    // Only one item → only one URL fetch (no next, no nextNext).
    expect(createSignedUrl).toHaveBeenCalledTimes(1);
  });
});

describe('useFeedPlayer — currentIndex advance', () => {
  it('pauses and replaces the player source when the active item changes', async () => {
    mockSupabaseSignedUrls();
    const items = [
      makeItem({ voiceId: 'v0', storagePath: 'p0' }),
      makeItem({ voiceId: 'v1', storagePath: 'p1' }),
    ];

    const { rerender } = renderHook(
      ({ index }: { index: number }) => useFeedPlayer({ items, currentIndex: index }),
      { initialProps: { index: 0 } },
    );

    await waitFor(() => {
      expect(expoAudioMocks.player.replace).toHaveBeenCalledWith('https://signed.example/p0');
    });

    expoAudioMocks.player.replace.mockClear();
    expoAudioMocks.player.pause.mockClear();

    rerender({ index: 1 });

    // Synchronous pause before the async URL fetch — instant audio cutoff on swipe.
    expect(expoAudioMocks.player.pause).toHaveBeenCalled();

    await waitFor(() => {
      expect(expoAudioMocks.player.replace).toHaveBeenCalledWith('https://signed.example/p1');
    });
  });

  it('discards a stale in-flight load when the user swipes again before it resolves', async () => {
    // Construct a controllable URL fetcher so we can resolve loads out of order.
    const resolvers: Record<string, (url: string) => void> = {};
    const createSignedUrl = jest.fn(
      (path: string) =>
        new Promise<{ data: { signedUrl: string }; error: null }>((resolve) => {
          resolvers[path] = (url) => resolve({ data: { signedUrl: url }, error: null });
        }),
    );
    jest.mocked(getSupabaseClient).mockReturnValue({
      storage: { from: () => ({ createSignedUrl }) },
    } as unknown as ReturnType<typeof getSupabaseClient>);

    const items = [
      makeItem({ voiceId: 'v0', storagePath: 'p0' }),
      makeItem({ voiceId: 'v1', storagePath: 'p1' }),
      makeItem({ voiceId: 'v2', storagePath: 'p2' }),
    ];

    const { rerender } = renderHook(
      ({ index }: { index: number }) => useFeedPlayer({ items, currentIndex: index }),
      { initialProps: { index: 0 } },
    );

    // p0 (current), p1 + p2 (prefetch) all start fetching.
    await waitFor(() => {
      expect(resolvers.p0).toBeDefined();
      expect(resolvers.p1).toBeDefined();
      expect(resolvers.p2).toBeDefined();
    });

    // User swipes to index 1 before p0's URL resolves → token bumps, p1 becomes current.
    rerender({ index: 1 });
    // User swipes again to index 2 before p1's URL resolves → token bumps again.
    rerender({ index: 2 });

    // Now resolve p1's URL (stale: token was bumped past it). Should NOT call replace.
    await act(async () => {
      resolvers.p1('https://signed.example/p1');
    });

    expect(expoAudioMocks.player.replace).not.toHaveBeenCalledWith('https://signed.example/p1');

    // Resolve p2's URL (latest token). MUST call replace.
    await act(async () => {
      resolvers.p2('https://signed.example/p2');
    });

    await waitFor(() => {
      expect(expoAudioMocks.player.replace).toHaveBeenCalledWith('https://signed.example/p2');
    });
  });
});

describe('useFeedPlayer — controls.play()', () => {
  it('calls player.play() once the source has finished loading', async () => {
    mockSupabaseSignedUrls();
    const item = makeItem({ voiceId: 'v0', storagePath: 'p0' });

    const { result } = renderHook(() => useFeedPlayer({ items: [item], currentIndex: 0 }));

    await waitFor(() => {
      expect(expoAudioMocks.player.replace).toHaveBeenCalled();
    });

    act(() => {
      result.current.controls.play();
    });

    expect(expoAudioMocks.player.play).toHaveBeenCalledTimes(1);
  });

  it('is a no-op while the source is still loading', () => {
    // Hold the URL fetch unresolved.
    const createSignedUrl = jest.fn(() => new Promise(() => undefined));
    jest.mocked(getSupabaseClient).mockReturnValue({
      storage: { from: () => ({ createSignedUrl }) },
    } as unknown as ReturnType<typeof getSupabaseClient>);

    const item = makeItem({ voiceId: 'v0', storagePath: 'p0' });
    const { result } = renderHook(() => useFeedPlayer({ items: [item], currentIndex: 0 }));

    // While loading, snapshot.isLoading is true.
    expect(result.current.snapshot.isLoading).toBe(true);

    act(() => {
      result.current.controls.play();
    });

    expect(expoAudioMocks.player.play).not.toHaveBeenCalled();
  });

  it('seeks to 0 before playing when the track ended naturally', async () => {
    mockSupabaseSignedUrls();
    const item = makeItem({ voiceId: 'v0', storagePath: 'p0' });

    const { result, rerender } = renderHook(
      ({ tick: _tick }: { tick: number }) =>
        useFeedPlayer({ items: [item], currentIndex: 0 }),
      { initialProps: { tick: 0 } },
    );

    await waitFor(() => {
      expect(expoAudioMocks.player.replace).toHaveBeenCalled();
    });

    act(() => {
      expoAudioMocks.playerStatus.didJustFinish = true;
      expoAudioMocks.playerStatus.duration = 30;
      expoAudioMocks.playerStatus.currentTime = 30;
      rerender({ tick: 1 });
    });

    act(() => {
      result.current.controls.play();
    });

    expect(expoAudioMocks.player.seekTo).toHaveBeenCalledWith(0);
    expect(expoAudioMocks.player.play).toHaveBeenCalled();
  });
});

describe('useFeedPlayer — controls.pause()', () => {
  it('calls player.pause()', async () => {
    mockSupabaseSignedUrls();
    const item = makeItem({ voiceId: 'v0', storagePath: 'p0' });

    const { result } = renderHook(() => useFeedPlayer({ items: [item], currentIndex: 0 }));

    await waitFor(() => {
      expect(expoAudioMocks.player.replace).toHaveBeenCalled();
    });

    expoAudioMocks.player.pause.mockClear();

    act(() => {
      result.current.controls.pause();
    });

    expect(expoAudioMocks.player.pause).toHaveBeenCalledTimes(1);
  });
});

describe('useFeedPlayer — controls.stop()', () => {
  it('pauses and seeks back to 0', async () => {
    mockSupabaseSignedUrls();
    const item = makeItem({ voiceId: 'v0', storagePath: 'p0' });

    const { result } = renderHook(() => useFeedPlayer({ items: [item], currentIndex: 0 }));

    await waitFor(() => {
      expect(expoAudioMocks.player.replace).toHaveBeenCalled();
    });

    expoAudioMocks.player.pause.mockClear();
    expoAudioMocks.player.seekTo.mockClear();

    act(() => {
      result.current.controls.stop();
    });

    expect(expoAudioMocks.player.pause).toHaveBeenCalledTimes(1);
    expect(expoAudioMocks.player.seekTo).toHaveBeenCalledWith(0);
  });
});

describe('useFeedPlayer — onCurrentEnded', () => {
  it('fires exactly once on the false→true edge and re-arms only on play()', async () => {
    mockSupabaseSignedUrls();
    const onCurrentEnded = jest.fn();
    const item = makeItem({ voiceId: 'voice-end', storagePath: 'voice-end.m4a' });

    const { result, rerender } = renderHook(
      ({ tick: _tick }: { tick: number }) =>
        useFeedPlayer({ items: [item], currentIndex: 0, onCurrentEnded }),
      { initialProps: { tick: 0 } },
    );

    await waitFor(() => {
      expect(expoAudioMocks.player.replace).toHaveBeenCalled();
    });

    act(() => {
      expoAudioMocks.playerStatus.didJustFinish = true;
      rerender({ tick: 1 });
    });

    expect(onCurrentEnded).toHaveBeenCalledTimes(1);
    expect(onCurrentEnded).toHaveBeenCalledWith('voice-end');

    // A second render with didJustFinish still true must NOT re-fire.
    act(() => {
      rerender({ tick: 2 });
    });
    expect(onCurrentEnded).toHaveBeenCalledTimes(1);

    // Re-arming: a play() call must allow a subsequent end to fire again.
    act(() => {
      expoAudioMocks.playerStatus.didJustFinish = false;
      rerender({ tick: 3 });
    });
    act(() => {
      result.current.controls.play();
    });
    act(() => {
      expoAudioMocks.playerStatus.didJustFinish = true;
      rerender({ tick: 4 });
    });

    expect(onCurrentEnded).toHaveBeenCalledTimes(2);
  });
});
