/* Tests for useChatVoiceRecorder — state machine transitions with mocked expo-audio. */

import { renderHook, act } from '@testing-library/react-native';

import { useChatVoiceRecorder } from '../useChatVoiceRecorder';

// The jest.setup.ts already mocks expo-audio, expo-file-system, and expo-crypto.

describe('useChatVoiceRecorder', () => {
  it('starts in idle state', () => {
    const { result } = renderHook(() => useChatVoiceRecorder());
    expect(result.current.state).toBe('idle');
    expect(result.current.durationMs).toBe(0);
    expect(result.current.result).toBeNull();
  });

  it('transitions to recording after start()', async () => {
    const { result } = renderHook(() => useChatVoiceRecorder());

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.state).toBe('recording');
  });

  it('cancel returns to idle from recording', async () => {
    const { result } = renderHook(() => useChatVoiceRecorder());

    await act(async () => {
      await result.current.start();
    });
    expect(result.current.state).toBe('recording');

    await act(async () => {
      await result.current.cancel();
    });
    expect(result.current.state).toBe('idle');
  });

  it('cancel has no effect when idle', async () => {
    const { result } = renderHook(() => useChatVoiceRecorder());

    await act(async () => {
      await result.current.cancel();
    });

    expect(result.current.state).toBe('idle');
  });

  it('stopAndSend returns null when not recording', async () => {
    const { result } = renderHook(() => useChatVoiceRecorder());

    let sendResult: unknown;
    await act(async () => {
      sendResult = await result.current.stopAndSend();
    });

    expect(sendResult).toBeNull();
    expect(result.current.state).toBe('idle');
  });
});
