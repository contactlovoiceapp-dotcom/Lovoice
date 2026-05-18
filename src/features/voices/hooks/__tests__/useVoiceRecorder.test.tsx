/* Smoke tests for useVoiceRecorder: state machine transitions, permission denial, and hard-cap behaviour. */

import { act, renderHook, waitFor } from '@testing-library/react-native';
import {
  useAudioRecorder,
  useAudioRecorderState,
  requestRecordingPermissionsAsync,
} from 'expo-audio';

import { useVoiceRecorder } from '../useVoiceRecorder';

// Re-use the shared mock objects injected by jest.setup.ts.
const mocks = (global as Record<string, unknown>).__expoAudioMocks as {
  recorder: {
    record: jest.Mock;
    pause: jest.Mock;
    stop: jest.Mock;
    prepareToRecordAsync: jest.Mock;
    isRecording: boolean;
    uri: string | null;
  };
  recorderState: {
    isRecording: boolean;
    durationMillis: number;
    metering: number;
    canRecord: boolean;
  };
};

beforeEach(() => {
  jest.clearAllMocks();
  mocks.recorder.isRecording = false;
  mocks.recorder.uri = null;
  mocks.recorderState.durationMillis = 0;
  mocks.recorderState.metering = -50;

  // Reset stop() to set the uri correctly.
  mocks.recorder.stop.mockImplementation(() => {
    mocks.recorder.uri = 'file:///tmp/mock-recording.m4a';
    return Promise.resolve();
  });
});

describe('useVoiceRecorder — initial state', () => {
  it('starts in idle state with zero duration', () => {
    const { result } = renderHook(() => useVoiceRecorder());
    expect(result.current.state).toBe('idle');
    expect(result.current.durationMs).toBe(0);
    expect(result.current.meteringDb).toEqual([]);
    expect(result.current.result).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.canStop).toBe(false);
  });
});

describe('useVoiceRecorder — start()', () => {
  it('transitions to recording when permission is granted', async () => {
    const { result } = renderHook(() => useVoiceRecorder());

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.state).toBe('recording');
    expect(mocks.recorder.prepareToRecordAsync).toHaveBeenCalledTimes(1);
    expect(mocks.recorder.record).toHaveBeenCalledTimes(1);
  });

  it('transitions to error with permission_denied when permission is denied', async () => {
    (requestRecordingPermissionsAsync as jest.Mock).mockResolvedValueOnce({
      granted: false,
      status: 'denied',
      expires: 'never',
      canAskAgain: false,
    });

    const { result } = renderHook(() => useVoiceRecorder());

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.state).toBe('error');
    expect(result.current.error).toBe('permission_denied');
    expect(mocks.recorder.record).not.toHaveBeenCalled();
  });
});

describe('useVoiceRecorder — pause() / resume()', () => {
  it('transitions recording → paused → recording', async () => {
    const { result } = renderHook(() => useVoiceRecorder());

    await act(async () => {
      await result.current.start();
    });

    act(() => {
      result.current.pause();
    });
    expect(result.current.state).toBe('paused');
    expect(mocks.recorder.pause).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.resume();
    });
    expect(result.current.state).toBe('recording');
    // record() was called once on start() and once on resume()
    expect(mocks.recorder.record).toHaveBeenCalledTimes(2);
  });

  it('pause() is a no-op when idle', () => {
    const { result } = renderHook(() => useVoiceRecorder());
    act(() => {
      result.current.pause();
    });
    expect(mocks.recorder.pause).not.toHaveBeenCalled();
    expect(result.current.state).toBe('idle');
  });
});

describe('useVoiceRecorder — stop()', () => {
  it('transitions to stopped and populates result', async () => {
    const { result } = renderHook(() => useVoiceRecorder());

    await act(async () => {
      await result.current.start();
    });

    await act(async () => {
      await result.current.stop();
    });

    expect(result.current.state).toBe('stopped');
    expect(result.current.result).not.toBeNull();
    expect(result.current.result?.uri).toContain('.m4a');
    expect(mocks.recorder.stop).toHaveBeenCalledTimes(1);
  });

  it('stop() is a no-op when idle', async () => {
    const { result } = renderHook(() => useVoiceRecorder());
    await act(async () => {
      await result.current.stop();
    });
    expect(mocks.recorder.stop).not.toHaveBeenCalled();
    expect(result.current.state).toBe('idle');
  });
});

describe('useVoiceRecorder — reset()', () => {
  it('returns to idle and clears result', async () => {
    const { result } = renderHook(() => useVoiceRecorder());

    await act(async () => {
      await result.current.start();
    });
    await act(async () => {
      await result.current.stop();
    });
    expect(result.current.state).toBe('stopped');

    await act(async () => {
      await result.current.reset();
    });

    expect(result.current.state).toBe('idle');
    expect(result.current.result).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.durationMs).toBe(0);
    expect(result.current.meteringDb).toEqual([]);
  });
});

describe('useVoiceRecorder — isLikelySilent', () => {
  it('is false initially', () => {
    const { result } = renderHook(() => useVoiceRecorder());
    expect(result.current.isLikelySilent).toBe(false);
  });

  it('is true after stop() when all metering samples are below the voice threshold (-30 dBFS)', async () => {
    const { useAudioRecorderState: mockUseState } = jest.requireMock('expo-audio') as {
      useAudioRecorderState: jest.Mock;
    };
    // -50 dBFS is ambient noise level — never reaches the -30 voice threshold.
    mockUseState.mockReturnValue({
      ...mocks.recorderState,
      metering: -50,
      durationMillis: 15_000,
    });

    const { result } = renderHook(() => useVoiceRecorder());

    await act(async () => {
      await result.current.start();
    });
    await act(async () => {
      await result.current.stop();
    });

    expect(result.current.isLikelySilent).toBe(true);
  });

  it('is false after stop() when metering consistently exceeds the voice threshold (-30 dBFS)', async () => {
    const { useAudioRecorderState: mockUseState } = jest.requireMock('expo-audio') as {
      useAudioRecorderState: jest.Mock;
    };
    // -20 dBFS is a clear voice signal, well above the -30 threshold.
    mockUseState.mockReturnValue({
      ...mocks.recorderState,
      metering: -20,
      durationMillis: 15_000,
    });

    const { result } = renderHook(() => useVoiceRecorder());

    await act(async () => {
      await result.current.start();
    });
    await act(async () => {
      await result.current.stop();
    });

    expect(result.current.isLikelySilent).toBe(false);
  });

  it('resets to false after reset()', async () => {
    const { useAudioRecorderState: mockUseState } = jest.requireMock('expo-audio') as {
      useAudioRecorderState: jest.Mock;
    };
    mockUseState.mockReturnValue({
      ...mocks.recorderState,
      metering: -50,
      durationMillis: 15_000,
    });

    const { result } = renderHook(() => useVoiceRecorder());

    await act(async () => { await result.current.start(); });
    await act(async () => { await result.current.stop(); });
    expect(result.current.isLikelySilent).toBe(true);

    await act(async () => { await result.current.reset(); });
    expect(result.current.isLikelySilent).toBe(false);
  });
});

describe('useVoiceRecorder — canStop', () => {
  it('is false at zero duration', () => {
    const { result } = renderHook(() => useVoiceRecorder());
    expect(result.current.canStop).toBe(false);
  });

  it('is true when durationMs reaches MIN_VOICE_DURATION_MS', async () => {
    // Simulate durationMillis reaching 10_000ms via the mocked recorder state.
    const { useAudioRecorderState: mockUseState } = jest.requireMock('expo-audio') as {
      useAudioRecorderState: jest.Mock;
    };
    mockUseState.mockReturnValue({
      ...mocks.recorderState,
      durationMillis: 10_000,
    });

    const { result } = renderHook(() => useVoiceRecorder());

    await act(async () => {
      await result.current.start();
    });

    // Trigger a re-render with the updated recorderState.
    await waitFor(() => {
      expect(result.current.canStop).toBe(true);
    });
  });
});
