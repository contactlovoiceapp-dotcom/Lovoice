/* Smoke tests for useVoicePlayer: initial state, play/pause/seek/unload, and URI-change behaviour. */

import { act, renderHook } from '@testing-library/react-native';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';

import { useVoicePlayer } from '../useVoicePlayer';

const mocks = (global as Record<string, unknown>).__expoAudioMocks as {
  player: {
    play: jest.Mock;
    pause: jest.Mock;
    seekTo: jest.Mock;
    replace: jest.Mock;
    remove: jest.Mock;
  };
  playerStatus: {
    playing: boolean;
    currentTime: number;
    duration: number;
  };
};

beforeEach(() => {
  jest.clearAllMocks();
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
  it('calls player.play() and configures the audio session on first call', async () => {
    const { setAudioModeAsync } = jest.requireMock('expo-audio') as {
      setAudioModeAsync: jest.Mock;
    };

    const { result } = renderHook(() =>
      useVoicePlayer({ uri: 'file:///document/pending/voice.m4a' }),
    );

    await act(async () => {
      await result.current.play();
    });

    expect(mocks.player.play).toHaveBeenCalledTimes(1);
    // setAudioModeAsync should be called once to configure the playback session.
    expect(setAudioModeAsync).toHaveBeenCalledTimes(1);
  });

  it('does not reconfigure the session on a second play()', async () => {
    const { setAudioModeAsync } = jest.requireMock('expo-audio') as {
      setAudioModeAsync: jest.Mock;
    };

    const { result } = renderHook(() =>
      useVoicePlayer({ uri: 'file:///document/pending/voice.m4a' }),
    );

    await act(async () => {
      await result.current.play();
      await result.current.play();
    });

    // Session should only be configured once regardless of how many times play() is called.
    expect(setAudioModeAsync).toHaveBeenCalledTimes(1);
    expect(mocks.player.play).toHaveBeenCalledTimes(2);
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
  it('pauses without calling replace (expo-audio 0.5 rejects null sources)', async () => {
    const { result } = renderHook(() =>
      useVoicePlayer({ uri: 'file:///document/pending/voice.m4a' }),
    );

    await act(async () => {
      await result.current.play();
    });

    mocks.player.replace.mockClear();

    act(() => {
      result.current.unload();
    });

    expect(mocks.player.pause).toHaveBeenCalled();
    expect(mocks.player.replace).not.toHaveBeenCalled();
  });

  it('resets the session flag so the next play() reconfigures the session', async () => {
    const { setAudioModeAsync } = jest.requireMock('expo-audio') as {
      setAudioModeAsync: jest.Mock;
    };

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

    // setAudioModeAsync should be called twice: once before each play() after an unload().
    expect(setAudioModeAsync).toHaveBeenCalledTimes(2);
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
