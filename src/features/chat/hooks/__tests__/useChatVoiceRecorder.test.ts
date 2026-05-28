/* Tests for useChatVoiceRecorder — state machine transitions with mocked expo-audio. */

import { renderHook, act } from '@testing-library/react-native';

import { useChatVoiceRecorder } from '../useChatVoiceRecorder';
import {
  __resetChatPlayerStoreForTests,
  useIsHostSuspended,
} from '../../lib/chatMessagePlayer';

// The jest.setup.ts already mocks expo-audio, expo-file-system, and expo-crypto.

beforeEach(() => {
  __resetChatPlayerStoreForTests();
});

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

  it('suspends the chat host while recording and resumes after cancel', async () => {
    const { result: recorder } = renderHook(() => useChatVoiceRecorder());
    const { result: hostFlag } = renderHook(() => useIsHostSuspended());

    expect(hostFlag.current).toBe(false);

    await act(async () => {
      await recorder.current.start();
    });
    expect(recorder.current.state).toBe('recording');
    expect(hostFlag.current).toBe(true);

    await act(async () => {
      await recorder.current.cancel();
    });
    expect(recorder.current.state).toBe('idle');
    expect(hostFlag.current).toBe(false);
  });

  it('resumes the chat host on unmount even if recording is still active', async () => {
    const { result: recorder, unmount } = renderHook(() => useChatVoiceRecorder());
    const { result: hostFlag } = renderHook(() => useIsHostSuspended());

    await act(async () => {
      await recorder.current.start();
    });
    expect(hostFlag.current).toBe(true);

    unmount();
    expect(hostFlag.current).toBe(false);
  });
});
