/* Tests for chatMessagePlayer — bar height helper + single-instance player
   contract (only one bubble active at a time, snapshots isolated per bubble). */

import { act, renderHook, waitFor } from '@testing-library/react-native';

import { getSupabaseClient } from '@/lib/supabase';

import {
  __resetChatPlayerStoreForTests,
  generateBarHeights,
  pauseAllChatMessages,
  resumeHostAfterRecording,
  suspendHostForRecording,
  useChatMessagePlayer,
  useChatMessagePlayerHost,
  useIsHostSuspended,
} from '../chatMessagePlayer';

jest.mock('@/lib/supabase', () => ({
  getSupabaseClient: jest.fn(),
}));

jest.mock('@/lib/audio', () => ({
  configureAudioSessionForPlayback: jest.fn(() => Promise.resolve()),
}));

jest.mock('@/lib/sentry', () => ({
  Sentry: {
    addBreadcrumb: jest.fn(),
    captureException: jest.fn(),
    captureMessage: jest.fn(),
  },
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

function mockSupabaseSignedUrls(): { createSignedUrl: jest.Mock } {
  const createSignedUrl = jest.fn((path: string) =>
    Promise.resolve({ data: { signedUrl: `https://signed.example/${path}` }, error: null }),
  );
  jest.mocked(getSupabaseClient).mockReturnValue({
    storage: { from: () => ({ createSignedUrl }) },
  } as unknown as ReturnType<typeof getSupabaseClient>);
  return { createSignedUrl };
}

beforeEach(() => {
  jest.clearAllMocks();
  __resetChatPlayerStoreForTests();
  expoAudioMocks.player.play.mockClear();
  expoAudioMocks.player.pause.mockClear();
  expoAudioMocks.player.seekTo.mockClear();
  expoAudioMocks.player.replace.mockClear();
  expoAudioMocks.playerStatus.playing = false;
  expoAudioMocks.playerStatus.currentTime = 0;
  expoAudioMocks.playerStatus.duration = 0;
  expoAudioMocks.playerStatus.didJustFinish = false;
});

// Defensive cleanup: clears the 8 s play-timeout setTimeout left over from any
// test that called play() without observing the resulting status updates.
// Without this, Jest's worker reports "failed to exit gracefully" because of
// the leaked timer from the last test in the suite.
afterEach(() => {
  __resetChatPlayerStoreForTests();
});

// ---------------------------------------------------------------------------
// generateBarHeights — pure helper, no dependencies.
// ---------------------------------------------------------------------------

describe('generateBarHeights', () => {
  it('returns the requested number of bars', () => {
    expect(generateBarHeights('msg-abc-123', 28)).toHaveLength(28);
  });

  it('produces deterministic output for the same seed', () => {
    expect(generateBarHeights('seed-xyz', 20)).toEqual(generateBarHeights('seed-xyz', 20));
  });

  it('produces different output for different seeds', () => {
    expect(generateBarHeights('seed-1', 20)).not.toEqual(generateBarHeights('seed-2', 20));
  });

  it('all values are bounded between 0.2 and 1.0', () => {
    const bars = generateBarHeights('bounds-test', 100);
    for (const h of bars) {
      expect(h).toBeGreaterThanOrEqual(0.2);
      expect(h).toBeLessThanOrEqual(1.0);
    }
  });
});

// ---------------------------------------------------------------------------
// useChatMessagePlayer — per-bubble subscription.
// ---------------------------------------------------------------------------

describe('useChatMessagePlayer — no host mounted', () => {
  it('returns the inactive snapshot when no host is mounted', () => {
    const { result } = renderHook(() =>
      useChatMessagePlayer({ messageId: 'msg-1', source: 'path.m4a', isLocalFile: false }),
    );

    expect(result.current.snapshot).toEqual({
      isPlaying: false,
      positionMs: 0,
      durationMs: 0,
      isLoading: false,
      error: null,
    });
  });

  it('play() is a no-op without a host (no native call, no throw)', async () => {
    mockSupabaseSignedUrls();
    const { result } = renderHook(() =>
      useChatMessagePlayer({ messageId: 'msg-1', source: 'path.m4a', isLocalFile: false }),
    );

    await act(async () => {
      result.current.controls.play();
      await Promise.resolve();
    });

    expect(expoAudioMocks.player.play).not.toHaveBeenCalled();
    expect(expoAudioMocks.player.replace).not.toHaveBeenCalled();
  });
});

describe('useChatMessagePlayer — with host', () => {
  it('activates a bubble when play() is called and loads the signed URL', async () => {
    mockSupabaseSignedUrls();

    const { result: host } = renderHook(() => {
      useChatMessagePlayerHost();
      return useChatMessagePlayer({ messageId: 'msg-1', source: 'path.m4a', isLocalFile: false });
    });

    // Initially inactive.
    expect(host.current.snapshot.isPlaying).toBe(false);
    expect(host.current.snapshot.isLoading).toBe(false);

    await act(async () => {
      host.current.controls.play();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(expoAudioMocks.player.replace).toHaveBeenCalledWith('https://signed.example/path.m4a');
      expect(expoAudioMocks.player.play).toHaveBeenCalled();
    });
  });

  it('plays local-file sources directly without signing', async () => {
    mockSupabaseSignedUrls();

    const { result } = renderHook(() => {
      useChatMessagePlayerHost();
      return useChatMessagePlayer({
        messageId: 'msg-optimistic',
        source: 'file:///tmp/local.m4a',
        isLocalFile: true,
      });
    });

    await act(async () => {
      result.current.controls.play();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(expoAudioMocks.player.replace).toHaveBeenCalledWith('file:///tmp/local.m4a');
    });
  });

  it('switching the active bubble pauses the previous one in the store', async () => {
    mockSupabaseSignedUrls();

    // Render two bubbles backed by the same host.
    const { result } = renderHook(() => {
      useChatMessagePlayerHost();
      const a = useChatMessagePlayer({ messageId: 'a', source: 'path-a.m4a', isLocalFile: false });
      const b = useChatMessagePlayer({ messageId: 'b', source: 'path-b.m4a', isLocalFile: false });
      return { a, b };
    });

    await act(async () => {
      result.current.a.controls.play();
      await Promise.resolve();
    });
    await waitFor(() =>
      expect(expoAudioMocks.player.replace).toHaveBeenCalledWith('https://signed.example/path-a.m4a'),
    );

    // B's snapshot must stay inactive while A is the active bubble.
    expect(result.current.b.snapshot.isLoading).toBe(false);
    expect(result.current.b.snapshot.isPlaying).toBe(false);

    await act(async () => {
      result.current.b.controls.play();
      await Promise.resolve();
    });
    await waitFor(() =>
      expect(expoAudioMocks.player.replace).toHaveBeenCalledWith('https://signed.example/path-b.m4a'),
    );

    // After switching, A becomes inactive and B is the active bubble.
    expect(result.current.a.snapshot).toEqual({
      isPlaying: false,
      positionMs: 0,
      durationMs: 0,
      isLoading: false,
      error: null,
    });
  });
});

// ---------------------------------------------------------------------------
// pauseAllChatMessages — used by the composer before recording.
// ---------------------------------------------------------------------------

describe('pauseAllChatMessages', () => {
  it('pauses the active player without throwing when no host is mounted', () => {
    expect(() => pauseAllChatMessages()).not.toThrow();
  });

  it('calls pause() on the host player', async () => {
    mockSupabaseSignedUrls();

    const { result } = renderHook(() => {
      useChatMessagePlayerHost();
      return useChatMessagePlayer({ messageId: 'msg-1', source: 'path.m4a', isLocalFile: false });
    });

    await act(async () => {
      result.current.controls.play();
      await Promise.resolve();
    });

    expoAudioMocks.player.pause.mockClear();
    act(() => {
      pauseAllChatMessages();
    });

    expect(expoAudioMocks.player.pause).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Host suspension — silent M4A mitigation (release native AVAudioPlayer
// during recording so iOS does not starve the recorder's AAC encoder).
// ---------------------------------------------------------------------------

describe('host suspension', () => {
  it('starts un-suspended', () => {
    const { result } = renderHook(() => useIsHostSuspended());
    expect(result.current).toBe(false);
  });

  it('suspendHostForRecording flips the flag and pauses any active playback', async () => {
    mockSupabaseSignedUrls();

    const { result } = renderHook(() => {
      useChatMessagePlayerHost();
      return {
        bubble: useChatMessagePlayer({ messageId: 'msg-1', source: 'p.m4a', isLocalFile: false }),
        suspended: useIsHostSuspended(),
      };
    });

    await act(async () => {
      result.current.bubble.controls.play();
      await Promise.resolve();
    });
    expoAudioMocks.player.pause.mockClear();

    await act(async () => {
      await suspendHostForRecording();
    });

    expect(result.current.suspended).toBe(true);
    expect(expoAudioMocks.player.pause).toHaveBeenCalled();
    // Active playback state is cleared so the bubble UI returns to idle.
    expect(result.current.bubble.snapshot.isPlaying).toBe(false);
    expect(result.current.bubble.snapshot.isLoading).toBe(false);
  });

  it('resumeHostAfterRecording clears the flag', async () => {
    await act(async () => {
      await suspendHostForRecording();
    });

    const { result } = renderHook(() => useIsHostSuspended());
    expect(result.current).toBe(true);

    act(() => {
      resumeHostAfterRecording();
    });

    expect(result.current).toBe(false);
  });

  it('host mount/unmount does NOT clear the suspension flag', async () => {
    mockSupabaseSignedUrls();

    await act(async () => {
      await suspendHostForRecording();
    });

    const { unmount, result } = renderHook(() => {
      useChatMessagePlayerHost();
      return useIsHostSuspended();
    });

    // Mounting the host during suspension would normally call resetPlaybackState
    // on mount AND on unmount; both must leave isHostSuspended untouched so the
    // wrapper component stays unmounted until resumeHostAfterRecording is called.
    expect(result.current).toBe(true);
    unmount();
    // After unmount we cannot read result.current; instead read the store directly.
    const { result: probe } = renderHook(() => useIsHostSuspended());
    expect(probe.current).toBe(true);

    act(() => {
      resumeHostAfterRecording();
    });
    expect(probe.current).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Nested ConversationScreen — push notification deep-link case.
// ---------------------------------------------------------------------------

describe('useChatMessagePlayerHost — nested hosts (push notification scenario)', () => {
  it('mounting a second host resets the store and pauses the previous one', async () => {
    mockSupabaseSignedUrls();

    // First conv mounts and a bubble plays.
    const conv1 = renderHook(() => {
      useChatMessagePlayerHost();
      return useChatMessagePlayer({ messageId: 'msg-conv1', source: 'p1.m4a', isLocalFile: false });
    });

    await act(async () => {
      conv1.result.current.controls.play();
      await Promise.resolve();
    });
    await waitFor(() =>
      expect(expoAudioMocks.player.replace).toHaveBeenCalledWith('https://signed.example/p1.m4a'),
    );
    expoAudioMocks.player.pause.mockClear();

    // Second conv mounts on top (simulating router.push from a push notif).
    const conv2 = renderHook(() => {
      useChatMessagePlayerHost();
      return useChatMessagePlayer({ messageId: 'msg-conv2', source: 'p2.m4a', isLocalFile: false });
    });

    // Previous top was paused.
    expect(expoAudioMocks.player.pause).toHaveBeenCalled();

    // Conv2 starts fresh: its bubble can play, conv1's bubble snapshot must
    // be inactive because the store was reset on push.
    expect(conv1.result.current.snapshot.isPlaying).toBe(false);
    expect(conv1.result.current.snapshot.error).toBeNull();

    await act(async () => {
      conv2.result.current.controls.play();
      await Promise.resolve();
    });
    await waitFor(() =>
      expect(expoAudioMocks.player.replace).toHaveBeenCalledWith('https://signed.example/p2.m4a'),
    );
  });
});
