/* Tests for the ring-buffer feed player: pure slot mapping and hook smoke coverage with cycling players. */

import { act, renderHook, waitFor } from '@testing-library/react-native';

import { getSupabaseClient } from '@/lib/supabase';
import type { FeedItem } from '@/features/feed/types';

import { computeRingSlots, useFeedPlayer } from '../feedPlayer';

jest.mock('@/lib/supabase', () => ({
  getSupabaseClient: jest.fn(),
}));

const expoAudioMock = jest.requireMock('expo-audio') as {
  useAudioPlayer: jest.Mock;
  useAudioPlayerStatus: jest.Mock;
};

const expoAudioMocks = (global as Record<string, unknown>).__expoAudioMocks as {
  players: Array<{
    id: string;
    play: jest.Mock;
    pause: jest.Mock;
    replace: jest.Mock;
  }>;
  playerStatuses: Array<{
    playing: boolean;
    currentTime: number;
    duration: number;
    isBuffering: boolean;
    didJustFinish: boolean;
  }>;
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

function mockSupabaseSignedUrl(url = 'https://signed.example/voice.m4a'): {
  createSignedUrl: jest.Mock;
} {
  const createSignedUrl = jest.fn(() =>
    Promise.resolve({ data: { signedUrl: url }, error: null }),
  );
  jest.mocked(getSupabaseClient).mockReturnValue({
    storage: { from: () => ({ createSignedUrl }) },
  } as unknown as ReturnType<typeof getSupabaseClient>);
  return { createSignedUrl };
}

function installCyclingPlayers(): void {
  // Each render allocates exactly 3 players in deterministic order. We cycle modulo 3 so
  // subsequent re-renders re-map to the same player slot identities.
  let counter = 0;
  expoAudioMock.useAudioPlayer.mockImplementation(() => {
    const slot = counter % 3;
    counter += 1;
    return expoAudioMocks.players[slot];
  });
  expoAudioMock.useAudioPlayerStatus.mockImplementation((player: unknown) => {
    const idx = expoAudioMocks.players.findIndex((p) => p === player);
    return expoAudioMocks.playerStatuses[idx >= 0 ? idx : 0];
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  expoAudioMocks.players.forEach((p) => {
    p.play.mockClear();
    p.pause.mockClear();
    p.replace.mockClear();
  });
  expoAudioMocks.playerStatuses.forEach((s) => {
    s.playing = false;
    s.currentTime = 0;
    s.duration = 0;
    s.isBuffering = false;
    s.didJustFinish = false;
  });
  installCyclingPlayers();
});

describe('computeRingSlots', () => {
  it('returns all-null when the list is empty', () => {
    expect(computeRingSlots(0, 0)).toEqual({ current: null, next: null, nextNext: null });
  });

  it('returns only current when the list has one item', () => {
    expect(computeRingSlots(0, 1)).toEqual({
      current: { slot: 0, itemIndex: 0 },
      next: null,
      nextNext: null,
    });
  });

  it('maps the first three items to slots 0/1/2', () => {
    expect(computeRingSlots(0, 3)).toEqual({
      current: { slot: 0, itemIndex: 0 },
      next: { slot: 1, itemIndex: 1 },
      nextNext: { slot: 2, itemIndex: 2 },
    });
  });

  it('rotates slots forward when advancing past the buffer size', () => {
    expect(computeRingSlots(1, 10)).toEqual({
      current: { slot: 1, itemIndex: 1 },
      next: { slot: 2, itemIndex: 2 },
      nextNext: { slot: 0, itemIndex: 3 },
    });
  });

  it('returns nulls for unavailable next/nextNext at the tail', () => {
    expect(computeRingSlots(10, 11)).toEqual({
      current: { slot: 1, itemIndex: 10 },
      next: null,
      nextNext: null,
    });
  });

  it('returns all-null for out-of-bounds currentIndex', () => {
    expect(computeRingSlots(-1, 5)).toEqual({ current: null, next: null, nextNext: null });
    expect(computeRingSlots(5, 5)).toEqual({ current: null, next: null, nextNext: null });
  });
});

describe('useFeedPlayer — empty list', () => {
  it('returns a zeroed snapshot when items is empty', () => {
    const { result } = renderHook(() =>
      useFeedPlayer({ items: [], currentIndex: 0 }),
    );
    expect(result.current.snapshot).toEqual({
      isPlaying: false,
      positionMs: 0,
      durationMs: 0,
      isLoading: false,
      error: null,
    });
  });
});

describe('useFeedPlayer — initial load', () => {
  it('replaces slot 0 once the signed URL resolves for the first item', async () => {
    mockSupabaseSignedUrl('https://signed.example/voice-1.m4a');
    const item = makeItem({ voiceId: 'voice-1', storagePath: 'user/voice-1.m4a' });

    renderHook(() => useFeedPlayer({ items: [item], currentIndex: 0 }));

    await waitFor(() => {
      expect(expoAudioMocks.players[0].replace).toHaveBeenCalledWith(
        'https://signed.example/voice-1.m4a',
      );
    });
    // Other slots should never receive a replace for an empty target.
    expect(expoAudioMocks.players[1].replace).not.toHaveBeenCalled();
    expect(expoAudioMocks.players[2].replace).not.toHaveBeenCalled();
  });
});

describe('useFeedPlayer — controls.play()', () => {
  it('plays the current slot and pauses the other two', async () => {
    mockSupabaseSignedUrl();
    const items = [
      makeItem({ voiceId: 'v0', storagePath: 'p0.m4a' }),
      makeItem({ voiceId: 'v1', storagePath: 'p1.m4a' }),
      makeItem({ voiceId: 'v2', storagePath: 'p2.m4a' }),
    ];

    const { result } = renderHook(() =>
      useFeedPlayer({ items, currentIndex: 0 }),
    );

    await waitFor(() => {
      expect(expoAudioMocks.players[0].replace).toHaveBeenCalled();
    });

    expoAudioMocks.players[0].pause.mockClear();
    expoAudioMocks.players[1].pause.mockClear();
    expoAudioMocks.players[2].pause.mockClear();

    act(() => {
      result.current.controls.play();
    });

    expect(expoAudioMocks.players[0].play).toHaveBeenCalledTimes(1);
    // Defensive pause-others discipline.
    expect(expoAudioMocks.players[1].pause).toHaveBeenCalled();
    expect(expoAudioMocks.players[2].pause).toHaveBeenCalled();
  });
});

describe('useFeedPlayer — currentIndex advance', () => {
  it('rotates so slot 0 holds item 3 (next-after-next) when currentIndex moves from 0 to 1', async () => {
    const createSignedUrl = jest.fn((path: string) =>
      Promise.resolve({ data: { signedUrl: `https://signed.example/${path}` }, error: null }),
    );
    jest.mocked(getSupabaseClient).mockReturnValue({
      storage: { from: () => ({ createSignedUrl }) },
    } as unknown as ReturnType<typeof getSupabaseClient>);

    const items = [
      makeItem({ voiceId: 'v0', storagePath: 'p0' }),
      makeItem({ voiceId: 'v1', storagePath: 'p1' }),
      makeItem({ voiceId: 'v2', storagePath: 'p2' }),
      makeItem({ voiceId: 'v3', storagePath: 'p3' }),
    ];

    const { rerender } = renderHook(
      ({ index }: { index: number }) => useFeedPlayer({ items, currentIndex: index }),
      { initialProps: { index: 0 } },
    );

    await waitFor(() => {
      expect(expoAudioMocks.players[0].replace).toHaveBeenCalledWith('https://signed.example/p0');
      expect(expoAudioMocks.players[1].replace).toHaveBeenCalledWith('https://signed.example/p1');
      expect(expoAudioMocks.players[2].replace).toHaveBeenCalledWith('https://signed.example/p2');
    });

    expoAudioMocks.players[0].replace.mockClear();
    expoAudioMocks.players[1].replace.mockClear();
    expoAudioMocks.players[2].replace.mockClear();

    rerender({ index: 1 });

    await waitFor(() => {
      // Slot 0 (index 0 % 3 == 0, index 3 % 3 == 0) must be re-loaded with item 3.
      expect(expoAudioMocks.players[0].replace).toHaveBeenCalledWith('https://signed.example/p3');
    });
    // Slots 1 (current, item 1) and 2 (next, item 2) already hold the right items.
    expect(expoAudioMocks.players[1].replace).not.toHaveBeenCalled();
    expect(expoAudioMocks.players[2].replace).not.toHaveBeenCalled();
  });
});

describe('useFeedPlayer — onCurrentEnded', () => {
  it('fires exactly once on the false→true edge and re-arms only on play()', async () => {
    mockSupabaseSignedUrl();
    const onCurrentEnded = jest.fn();
    const item = makeItem({ voiceId: 'voice-end', storagePath: 'voice-end.m4a' });

    // `tick` is a forced-rerender knob; the hook itself doesn't read it.
    const { result, rerender } = renderHook(
      ({ tick: _tick }: { tick: number }) =>
        useFeedPlayer({ items: [item], currentIndex: 0, onCurrentEnded }),
      { initialProps: { tick: 0 } },
    );

    await waitFor(() => {
      expect(expoAudioMocks.players[0].replace).toHaveBeenCalled();
    });

    // Simulate playback hitting the end on slot 0.
    act(() => {
      expoAudioMocks.playerStatuses[0].didJustFinish = true;
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
      expoAudioMocks.playerStatuses[0].didJustFinish = false;
      rerender({ tick: 3 });
    });
    act(() => {
      result.current.controls.play();
    });
    act(() => {
      expoAudioMocks.playerStatuses[0].didJustFinish = true;
      rerender({ tick: 4 });
    });

    expect(onCurrentEnded).toHaveBeenCalledTimes(2);
  });
});
