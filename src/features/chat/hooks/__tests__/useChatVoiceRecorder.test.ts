/* Tests for useChatVoiceRecorder — state machine transitions with mocked expo-audio. */

import { renderHook, act } from '@testing-library/react-native';

import { useChatVoiceRecorder } from '../useChatVoiceRecorder';

// The jest.setup.ts already mocks expo-audio, expo-file-system, and expo-crypto.
// We just need to verify state transitions at the hook level.

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

  it('transitions to cancel_hover when setCancelHover(true) called during recording', async () => {
    const { result } = renderHook(() => useChatVoiceRecorder());

    await act(async () => {
      await result.current.start();
    });

    act(() => {
      result.current.setCancelHover(true);
    });

    expect(result.current.state).toBe('cancel_hover');
  });

  it('transitions back to recording when setCancelHover(false) called from cancel_hover', async () => {
    const { result } = renderHook(() => useChatVoiceRecorder());

    await act(async () => {
      await result.current.start();
    });

    act(() => {
      result.current.setCancelHover(true);
    });
    expect(result.current.state).toBe('cancel_hover');

    act(() => {
      result.current.setCancelHover(false);
    });
    expect(result.current.state).toBe('recording');
  });

  it('setCancelHover has no effect when idle', () => {
    const { result } = renderHook(() => useChatVoiceRecorder());

    act(() => {
      result.current.setCancelHover(true);
    });

    expect(result.current.state).toBe('idle');
  });

  it('reset returns to idle', async () => {
    const { result } = renderHook(() => useChatVoiceRecorder());

    await act(async () => {
      await result.current.start();
    });
    expect(result.current.state).toBe('recording');

    await act(async () => {
      await result.current.reset();
    });
    expect(result.current.state).toBe('idle');
  });
});
