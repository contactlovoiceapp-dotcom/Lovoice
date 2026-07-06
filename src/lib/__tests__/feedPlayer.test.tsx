/* Tests for the single-instance feed player: source loading, URL prefetch, controls and lifecycle. */

import { act, renderHook, waitFor } from '@testing-library/react-native';

import { getSupabaseClient } from '@/lib/supabase';
import type { FeedItem } from '@/features/feed/types';

import { __resetSignedUrlCacheForTests, useFeedPlayer } from '../feedPlayer';

jest.mock('@/lib/supabase', () => ({
  getSupabaseClient: jest.fn(),
}));

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

describe('useFeedPlayer — autoplayNext', () => {
  it('does not auto-play when autoplayNext is false', async () => {
    mockSupabaseSignedUrls();
    const items = [makeItem({ voiceId: 'v0', storagePath: 'p0' })];

    renderHook(() => useFeedPlayer({ items, currentIndex: 0, autoplayNext: false }));

    await waitFor(() => {
      expect(expoAudioMocks.player.replace).toHaveBeenCalledWith('https://signed.example/p0');
    });

    expect(expoAudioMocks.player.play).not.toHaveBeenCalled();
  });

  it('auto-plays the current voice as soon as its source finishes loading when autoplayNext is true', async () => {
    mockSupabaseSignedUrls();
    const item = makeItem({ voiceId: 'v0', storagePath: 'p0' });

    renderHook(() => useFeedPlayer({ items: [item], currentIndex: 0, autoplayNext: true }));

    // Replace fires when the URL resolves; play() must follow once the load
    // effect commits setIsLoadingSource(false).
    await waitFor(() => {
      expect(expoAudioMocks.player.replace).toHaveBeenCalledWith('https://signed.example/p0');
    });
    await waitFor(() => {
      expect(expoAudioMocks.player.play).toHaveBeenCalled();
    });
  });

  it('auto-plays the current voice when autoplayNext is toggled on while the source is already loaded', async () => {
    mockSupabaseSignedUrls();
    const item = makeItem({ voiceId: 'v0', storagePath: 'p0' });

    const { rerender } = renderHook(
      ({ autoplayNext }: { autoplayNext: boolean }) =>
        useFeedPlayer({ items: [item], currentIndex: 0, autoplayNext }),
      { initialProps: { autoplayNext: false } },
    );

    await waitFor(() => {
      expect(expoAudioMocks.player.replace).toHaveBeenCalled();
    });
    expect(expoAudioMocks.player.play).not.toHaveBeenCalled();

    // Flipping autoplayNext to true with a loaded source must start playback.
    act(() => {
      rerender({ autoplayNext: true });
    });

    expect(expoAudioMocks.player.play).toHaveBeenCalledTimes(1);
  });

  it('auto-plays the next voice after a natural end + scroll advance', async () => {
    mockSupabaseSignedUrls();
    const items = [
      makeItem({ voiceId: 'v0', storagePath: 'p0' }),
      makeItem({ voiceId: 'v1', storagePath: 'p1' }),
    ];

    const { rerender } = renderHook(
      ({ index, tick: _tick }: { index: number; tick: number }) =>
        useFeedPlayer({ items, currentIndex: index, autoplayNext: true }),
      { initialProps: { index: 0, tick: 0 } },
    );

    // v0 source loads → autoplay starts v0.
    await waitFor(() => {
      expect(expoAudioMocks.player.play).toHaveBeenCalledTimes(1);
    });

    expoAudioMocks.player.play.mockClear();

    // v0 ends naturally — handleEnded (consumer) would scroll. Simulate that
    // by setting didJustFinish=true then advancing the index while it stays true.
    // expo-audio doesn't reset didJustFinish until the native player commits the
    // new source — this stale window is exactly the race the autoplay guard
    // (`if (currentDidJustFinish) return`) is designed to catch.
    act(() => {
      expoAudioMocks.playerStatus.didJustFinish = true;
      rerender({ index: 0, tick: 1 });
    });
    act(() => {
      rerender({ index: 1, tick: 2 });
    });

    // The signed URL fetch resolves and the source-loading effect calls replace().
    await waitFor(() => {
      expect(expoAudioMocks.player.replace).toHaveBeenCalledWith('https://signed.example/p1');
    });

    // While didJustFinish is still stale-true, autoplay must NOT have fired —
    // calling play() during this window is a silent no-op on real expo-audio.
    expect(expoAudioMocks.player.play).not.toHaveBeenCalled();

    // Simulate the native side committing the replace: didJustFinish clears.
    // This is the trigger the autoplay effect waits for to fire play() reliably.
    act(() => {
      expoAudioMocks.playerStatus.didJustFinish = false;
      rerender({ index: 1, tick: 3 });
    });

    await waitFor(() => {
      expect(expoAudioMocks.player.play).toHaveBeenCalledTimes(1);
    });
  });

  it('does not auto-play on the last item when there is no scroll', async () => {
    mockSupabaseSignedUrls();
    const items = [makeItem({ voiceId: 'v0', storagePath: 'p0' })];

    const { rerender } = renderHook(
      ({ tick: _tick }: { tick: number }) =>
        useFeedPlayer({ items, currentIndex: 0, autoplayNext: true }),
      { initialProps: { tick: 0 } },
    );

    await waitFor(() => {
      expect(expoAudioMocks.player.play).toHaveBeenCalledTimes(1);
    });

    expoAudioMocks.player.play.mockClear();

    // v0 ends but it's the last item — the consumer does not scroll, so neither
    // currentIndex nor any autoplay dep changes. play() must not be called again.
    act(() => {
      expoAudioMocks.playerStatus.didJustFinish = true;
      rerender({ tick: 1 });
    });

    expect(expoAudioMocks.player.play).not.toHaveBeenCalled();
  });

  it('does not call play() on a stale source between swipe and load completion', async () => {
    // Hold the v1 URL resolution to inspect the in-flight state.
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
    ];

    const { rerender } = renderHook(
      ({ index }: { index: number }) =>
        useFeedPlayer({ items, currentIndex: index, autoplayNext: true }),
      { initialProps: { index: 0 } },
    );

    await waitFor(() => expect(resolvers.p0).toBeDefined());
    await act(async () => {
      resolvers.p0('https://signed.example/p0');
    });

    // v0 plays via autoplay.
    expect(expoAudioMocks.player.play).toHaveBeenCalledTimes(1);
    expoAudioMocks.player.play.mockClear();

    // Swipe to v1 — the source-loading effect will refire, but v1's URL is held.
    act(() => {
      rerender({ index: 1 });
    });

    // While the v1 load is in flight, autoplay must not call play() on the
    // stale v0 source still held by the player.
    expect(expoAudioMocks.player.play).not.toHaveBeenCalled();

    // Once v1's URL resolves, play() is allowed.
    await act(async () => {
      resolvers.p1('https://signed.example/p1');
    });

    await waitFor(() => {
      expect(expoAudioMocks.player.play).toHaveBeenCalledTimes(1);
    });
  });

  it('does not replay a voice that already ended when autoplayNext is toggled on', async () => {
    mockSupabaseSignedUrls();
    const item = makeItem({ voiceId: 'v0', storagePath: 'p0' });
    const onCurrentEnded = jest.fn();

    const { rerender } = renderHook(
      ({ autoplayNext, tick: _tick }: { autoplayNext: boolean; tick: number }) =>
        useFeedPlayer({ items: [item], currentIndex: 0, autoplayNext, onCurrentEnded }),
      { initialProps: { autoplayNext: false, tick: 0 } },
    );

    await waitFor(() => {
      expect(expoAudioMocks.player.replace).toHaveBeenCalled();
    });

    // v0 ends naturally — onCurrentEnded fires and finishedHandledRef becomes true.
    act(() => {
      expoAudioMocks.playerStatus.didJustFinish = true;
      expoAudioMocks.playerStatus.currentTime = 30;
      expoAudioMocks.playerStatus.duration = 30;
      rerender({ autoplayNext: false, tick: 1 });
    });

    expect(onCurrentEnded).toHaveBeenCalledTimes(1);

    // didJustFinish clears (expo-audio resets after one cycle).
    act(() => {
      expoAudioMocks.playerStatus.didJustFinish = false;
      rerender({ autoplayNext: false, tick: 2 });
    });

    // User enables autoplay. The voice is at the end (currentTime ≈ duration)
    // and finishedHandledRef=true — autoplay must NOT replay it.
    act(() => {
      rerender({ autoplayNext: true, tick: 3 });
    });

    expect(expoAudioMocks.player.play).not.toHaveBeenCalled();
  });


  it('does not auto-play when autoplayNext flips off before the source finishes loading', async () => {
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

    const item = makeItem({ voiceId: 'v0', storagePath: 'p0' });

    const { rerender } = renderHook(
      ({ autoplayNext }: { autoplayNext: boolean }) =>
        useFeedPlayer({ items: [item], currentIndex: 0, autoplayNext }),
      { initialProps: { autoplayNext: true } },
    );

    await waitFor(() => expect(resolvers.p0).toBeDefined());

    // Flip autoplay off before the source resolves.
    act(() => {
      rerender({ autoplayNext: false });
    });

    await act(async () => {
      resolvers.p0('https://signed.example/p0');
    });

    expect(expoAudioMocks.player.play).not.toHaveBeenCalled();
  });
});

describe('useFeedPlayer — stale snapshot gating', () => {
  it('snapshot reports zero position/duration while the player holds a stale source during voice transition', async () => {
    mockSupabaseSignedUrls();
    const items = [
      makeItem({ voiceId: 'v0', storagePath: 'p0' }),
      makeItem({ voiceId: 'v1', storagePath: 'p1' }),
    ];

    const { result, rerender } = renderHook(
      ({ index, tick: _tick }: { index: number; tick: number }) =>
        useFeedPlayer({ items, currentIndex: index, autoplayNext: true }),
      { initialProps: { index: 0, tick: 0 } },
    );

    // v0 loads and autoplay starts.
    await waitFor(() => {
      expect(expoAudioMocks.player.play).toHaveBeenCalled();
    });

    // Simulate v0 reaching its natural end.
    act(() => {
      expoAudioMocks.playerStatus.playing = false;
      expoAudioMocks.playerStatus.currentTime = 30;
      expoAudioMocks.playerStatus.duration = 30;
      expoAudioMocks.playerStatus.didJustFinish = true;
      rerender({ index: 0, tick: 1 });
    });

    expoAudioMocks.player.replace.mockClear();

    // Scroll to v1 — the source-loading effect reloads.
    // expo-audio status still reports v0's terminal state (stale window).
    act(() => {
      rerender({ index: 1, tick: 2 });
    });

    // Snapshot must be zeroed: the player hasn't committed v1's source yet.
    expect(result.current.snapshot).toMatchObject({
      isPlaying: false,
      positionMs: 0,
      durationMs: 0,
    });

    // v1's URL resolves and replace() is called.
    await waitFor(() => {
      expect(expoAudioMocks.player.replace).toHaveBeenCalledWith('https://signed.example/p1');
    });

    // Snapshot must STILL be zeroed — native hasn't committed the new source yet
    // (didJustFinish is still stale-true from v0).
    expect(result.current.snapshot).toMatchObject({
      isPlaying: false,
      positionMs: 0,
      durationMs: 0,
    });

    // Native commits the replace: didJustFinish clears, fresh status for v1.
    act(() => {
      expoAudioMocks.playerStatus.didJustFinish = false;
      expoAudioMocks.playerStatus.currentTime = 0;
      expoAudioMocks.playerStatus.duration = 25;
      rerender({ index: 1, tick: 3 });
    });

    // Now the snapshot should reflect the real v1 values.
    await waitFor(() => {
      expect(result.current.snapshot.durationMs).toBe(25_000);
    });
    expect(result.current.snapshot.positionMs).toBe(0);
  });

  it('does not zero the snapshot when the current voice legitimately finishes', async () => {
    mockSupabaseSignedUrls();
    const item = makeItem({ voiceId: 'v0', storagePath: 'p0' });

    const { result, rerender } = renderHook(
      ({ tick: _tick }: { tick: number }) =>
        useFeedPlayer({ items: [item], currentIndex: 0 }),
      { initialProps: { tick: 0 } },
    );

    // Wait for the source to load.
    await waitFor(() => {
      expect(expoAudioMocks.player.replace).toHaveBeenCalled();
    });

    // Simulate the voice playing to the end.
    act(() => {
      expoAudioMocks.playerStatus.playing = false;
      expoAudioMocks.playerStatus.currentTime = 30;
      expoAudioMocks.playerStatus.duration = 30;
      expoAudioMocks.playerStatus.didJustFinish = true;
      rerender({ tick: 1 });
    });

    // The snapshot must expose the real terminal values — hasListened relies on
    // positionMs ≈ durationMs to show the replay icon on a legitimately finished voice.
    expect(result.current.snapshot.positionMs).toBe(30_000);
    expect(result.current.snapshot.durationMs).toBe(30_000);
    expect(result.current.snapshot.isPlaying).toBe(false);
  });

  it('snapshot stays zeroed during the URL fetch phase of a new voice', async () => {
    // Hold the v0 URL resolution to inspect the in-flight state.
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

    const item = makeItem({ voiceId: 'v0', storagePath: 'p0' });

    const { result } = renderHook(() =>
      useFeedPlayer({ items: [item], currentIndex: 0 }),
    );

    // Before the URL resolves, snapshot must be zeroed.
    expect(result.current.snapshot).toMatchObject({
      isPlaying: false,
      positionMs: 0,
      durationMs: 0,
      isLoading: true,
    });
  });
});

describe('useFeedPlayer — feed reset after autoplay', () => {
  it('snapshot.isPlaying reflects status.playing after explicit play() when didJustFinish is stuck from a prior track ending', async () => {
    mockSupabaseSignedUrls();
    const itemA = makeItem({ voiceId: 'v0', storagePath: 'p0' });
    const itemB = makeItem({ voiceId: 'v1', storagePath: 'p1' });

    const { result, rerender } = renderHook(
      ({ items, index, tick: _tick }: { items: FeedItem[]; index: number; tick: number }) =>
        useFeedPlayer({ items, currentIndex: index }),
      { initialProps: { items: [itemA], index: 0, tick: 0 } },
    );

    // Wait for v0 to load.
    await waitFor(() => {
      expect(expoAudioMocks.player.replace).toHaveBeenCalledWith('https://signed.example/p0');
    });

    // v0 ends naturally — expo-audio emits didJustFinish=true.
    act(() => {
      expoAudioMocks.playerStatus.didJustFinish = true;
      expoAudioMocks.playerStatus.currentTime = 30;
      expoAudioMocks.playerStatus.duration = 30;
      rerender({ items: [itemA], index: 0, tick: 1 });
    });

    expoAudioMocks.player.replace.mockClear();
    expoAudioMocks.player.play.mockClear();

    // End-of-feed: index points past the list — null currentVoiceId.
    // Source-load null branch pauses and clears loadedVoiceIdRef but does NOT
    // change isPlayerStale, so it remains at its current value.
    act(() => {
      rerender({ items: [itemA], index: 1, tick: 2 });
    });

    // Feed reset: new items arrive, index back to 0 with a new voice ID.
    // didJustFinish is still stuck-true (expo-audio never emits while paused).
    act(() => {
      rerender({ items: [itemB], index: 0, tick: 3 });
    });

    // Source-load fires for v1 — replace() is called.
    await waitFor(() => {
      expect(expoAudioMocks.player.replace).toHaveBeenCalledWith('https://signed.example/p1');
    });

    // At this point isPlayerStale=true and didJustFinish=true (stuck).
    // The stale-window clearing path is blocked — this reproduces the bug.
    expect(result.current.snapshot.isPlaying).toBe(false);

    // User taps play. The fix clears isPlayerStale eagerly so snapshot
    // can reflect status.playing as soon as expo-audio confirms playback.
    act(() => {
      result.current.controls.play();
    });

    expect(expoAudioMocks.player.play).toHaveBeenCalledTimes(1);

    // Simulate expo-audio confirming playback started (the status update that
    // the stale-window path was waiting for, which may never arrive while paused).
    act(() => {
      expoAudioMocks.playerStatus.playing = true;
      expoAudioMocks.playerStatus.didJustFinish = false;
      expoAudioMocks.playerStatus.currentTime = 0;
      expoAudioMocks.playerStatus.duration = 30;
      rerender({ items: [itemB], index: 0, tick: 4 });
    });

    // Snapshot must now reflect the real playing state — button shows pause.
    expect(result.current.snapshot.isPlaying).toBe(true);
  });

  it('snapshot.isPlaying reflects status.playing when autoplay starts after a feed reset (no manual play tap)', async () => {
    mockSupabaseSignedUrls();
    const itemA = makeItem({ voiceId: 'v0', storagePath: 'p0' });
    const itemB = makeItem({ voiceId: 'v1', storagePath: 'p1' });

    const { result, rerender } = renderHook(
      ({ items, index, autoplayNext, tick: _tick }: { items: FeedItem[]; index: number; autoplayNext: boolean; tick: number }) =>
        useFeedPlayer({ items, currentIndex: index, autoplayNext }),
      { initialProps: { items: [itemA], index: 0, autoplayNext: true, tick: 0 } },
    );

    // v0 loads and autoplay fires.
    await waitFor(() => {
      expect(expoAudioMocks.player.play).toHaveBeenCalled();
    });

    // v0 ends naturally.
    act(() => {
      expoAudioMocks.playerStatus.didJustFinish = true;
      expoAudioMocks.playerStatus.currentTime = 30;
      expoAudioMocks.playerStatus.duration = 30;
      expoAudioMocks.playerStatus.playing = false;
      rerender({ items: [itemA], index: 0, autoplayNext: true, tick: 1 });
    });

    expoAudioMocks.player.replace.mockClear();
    expoAudioMocks.player.play.mockClear();

    // End-of-feed: index past list.
    act(() => {
      rerender({ items: [itemA], index: 1, autoplayNext: true, tick: 2 });
    });

    // Feed reset: new voice at index 0, autoplay still on.
    act(() => {
      rerender({ items: [itemB], index: 0, autoplayNext: true, tick: 3 });
    });

    // v1 source loads.
    await waitFor(() => {
      expect(expoAudioMocks.player.replace).toHaveBeenCalledWith('https://signed.example/p1');
    });

    // Simulate native committing the new source (didJustFinish clears).
    act(() => {
      expoAudioMocks.playerStatus.didJustFinish = false;
      expoAudioMocks.playerStatus.currentTime = 0;
      expoAudioMocks.playerStatus.duration = 25;
      rerender({ items: [itemB], index: 0, autoplayNext: true, tick: 4 });
    });

    // Autoplay should have fired play().
    await waitFor(() => {
      expect(expoAudioMocks.player.play).toHaveBeenCalled();
    });

    // Simulate expo-audio confirming playback.
    act(() => {
      expoAudioMocks.playerStatus.playing = true;
      rerender({ items: [itemB], index: 0, autoplayNext: true, tick: 5 });
    });

    // The snapshot MUST reflect playing — the button shows pause icon.
    expect(result.current.snapshot.isPlaying).toBe(true);
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
