/* Smoke tests for useVoicePlayer: initial state, play/pause/seek/unload, and URI-change behaviour. */

import { act, renderHook } from '@testing-library/react-native';

import { useVoicePlayer } from '../useVoicePlayer';

const mocks = (global as Record<string, unknown>).__expoAudioMocks as {
  player: {
    play: jest.Mock;
    pause: jest.Mock;
    seekTo: jest.Mock;
    replace: jest.Mock;
    remove: jest.Mock;
    isLoaded: boolean;
  };
  playerStatus: {
    playing: boolean;
    currentTime: number;
    duration: number;
  };
};

beforeEach(() => {
  jest.clearAllMocks();
  mocks.player.isLoaded = true;
  mocks.playerStatus.playing = false;
  mocks.playerStatus.currentTime = 0;
  mocks.playerStatus.duration = 0;
});

describe('useVoicePlayer — initial state', () => {
  it('starts not playing with zero position and duration', () => {
    const { result } = renderHook(() => useVoicePlayer({ uri: null }));
    expect(result.current.isPlaying).toBe(false);
    expect(result.current.positionMs).toBe(0);
    expect(result.current.durationMs).toBe(0);
  });
});

describe('useVoicePlayer — play()', () => {
  it('calls player.play()', async () => {
    const { result } = renderHook(() =>
      useVoicePlayer({ uri: 'file:///document/pending/voice.m4a' }),
    );

    await act(async () => {
      await result.current.play();
    });

    expect(mocks.player.play).toHaveBeenCalledTimes(1);
  });

  it('calls player.play() multiple times without session config', async () => {
    const { result } = renderHook(() =>
      useVoicePlayer({ uri: 'file:///document/pending/voice.m4a' }),
    );

    await act(async () => {
      await result.current.play();
      await result.current.play();
    });

    expect(mocks.player.play).toHaveBeenCalledTimes(2);
  });

  it('waits for isLoaded and retries replace() when the native player stays unloaded', async () => {
    jest.useFakeTimers();
    mocks.player.isLoaded = false;

    const { result } = renderHook(() =>
      useVoicePlayer({ uri: 'file:///document/pending/voice.m4a' }),
    );

    mocks.player.replace.mockClear();

    let playPromise: Promise<void> | undefined;
    act(() => {
      playPromise = result.current.play();
    });

    expect(mocks.player.play).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(2_000);
    });

    expect(mocks.player.replace).toHaveBeenCalledTimes(1);

    mocks.player.isLoaded = true;
    await act(async () => {
      jest.advanceTimersByTime(50);
      await playPromise;
    });

    expect(mocks.player.play).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });
});

describe('useVoicePlayer — pause()', () => {
  it('calls player.pause()', () => {
    const { result } = renderHook(() =>
      useVoicePlayer({ uri: 'file:///document/pending/voice.m4a' }),
    );

    act(() => {
      result.current.pause();
    });

    expect(mocks.player.pause).toHaveBeenCalledTimes(1);
  });
});

describe('useVoicePlayer — unload()', () => {
  it('pauses without calling replace (expo-audio 0.5 rejects null sources)', () => {
    const { result } = renderHook(() =>
      useVoicePlayer({ uri: 'file:///document/pending/voice.m4a' }),
    );

    act(() => {
      void result.current.play();
    });

    mocks.player.replace.mockClear();

    act(() => {
      result.current.unload();
    });

    expect(mocks.player.pause).toHaveBeenCalled();
    expect(mocks.player.replace).not.toHaveBeenCalled();
  });

  it('allows play() after unload() without error', async () => {
    const { result } = renderHook(() =>
      useVoicePlayer({ uri: 'file:///document/pending/voice.m4a' }),
    );

    await act(async () => {
      await result.current.play();
    });
    act(() => {
      result.current.unload();
    });
    await act(async () => {
      await result.current.play();
    });

    expect(mocks.player.play).toHaveBeenCalledTimes(2);
  });
});

describe('useVoicePlayer — status mapping', () => {
  it('exposes durationMs and positionMs derived from status (seconds → ms conversion)', () => {
    const { useAudioPlayerStatus: mockStatus } = jest.requireMock('expo-audio') as {
      useAudioPlayerStatus: jest.Mock;
    };
    mockStatus.mockReturnValue({
      ...mocks.playerStatus,
      duration: 120.5,
      currentTime: 30.25,
    });

    const { result } = renderHook(() =>
      useVoicePlayer({ uri: 'file:///document/pending/voice.m4a' }),
    );

    expect(result.current.durationMs).toBe(120500);
    expect(result.current.positionMs).toBe(30250);
  });
});
