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
  it('calls player.play()', () => {
    const { result } = renderHook(() =>
      useVoicePlayer({ uri: 'file:///document/pending/voice.m4a' }),
    );

    act(() => {
      result.current.play();
    });

    expect(mocks.player.play).toHaveBeenCalledTimes(1);
  });

  it('calls player.play() multiple times without session config', () => {
    const { result } = renderHook(() =>
      useVoicePlayer({ uri: 'file:///document/pending/voice.m4a' }),
    );

    act(() => {
      result.current.play();
      result.current.play();
    });

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
  it('pauses without calling replace (expo-audio 0.5 rejects null sources)', () => {
    const { result } = renderHook(() =>
      useVoicePlayer({ uri: 'file:///document/pending/voice.m4a' }),
    );

    act(() => {
      result.current.play();
    });

    mocks.player.replace.mockClear();

    act(() => {
      result.current.unload();
    });

    expect(mocks.player.pause).toHaveBeenCalled();
    expect(mocks.player.replace).not.toHaveBeenCalled();
  });

  it('allows play() after unload() without error', () => {
    const { result } = renderHook(() =>
      useVoicePlayer({ uri: 'file:///document/pending/voice.m4a' }),
    );

    act(() => {
      result.current.play();
    });
    act(() => {
      result.current.unload();
    });
    act(() => {
      result.current.play();
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
