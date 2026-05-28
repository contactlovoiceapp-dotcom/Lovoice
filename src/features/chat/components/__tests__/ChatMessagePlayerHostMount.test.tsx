/* Tests for the host mount wrapper — verifies it unmounts the native host
   when the chat player store is in the suspended state (silent-M4A
   mitigation, see docs/CHAT_AUDIO.md §9bis). */

import React from 'react';
import { act, render } from '@testing-library/react-native';

import ChatMessagePlayerHostMount from '../ChatMessagePlayerHostMount';
import {
  __resetChatPlayerStoreForTests,
  resumeHostAfterRecording,
  suspendHostForRecording,
  useChatMessagePlayer,
} from '../../lib/chatMessagePlayer';
import { getSupabaseClient } from '@/lib/supabase';

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
};

beforeEach(() => {
  jest.clearAllMocks();
  __resetChatPlayerStoreForTests();
  jest.mocked(getSupabaseClient).mockReturnValue({
    storage: {
      from: () => ({
        createSignedUrl: jest.fn((path: string) =>
          Promise.resolve({ data: { signedUrl: `https://signed/${path}` }, error: null }),
        ),
      }),
    },
  } as unknown as ReturnType<typeof getSupabaseClient>);
});

afterEach(() => {
  __resetChatPlayerStoreForTests();
});

// Renders a bubble that tries to play; if the host is mounted, expo-audio's
// mock player.replace() is invoked. If the host is unmounted, no native call
// happens.
function BubbleProbe(): React.ReactElement {
  const { controls } = useChatMessagePlayer({
    messageId: 'm',
    source: 'voice.m4a',
    isLocalFile: false,
  });
  // Trigger play on render so the test can synchronously assert.
  React.useEffect(() => {
    controls.play();
  }, [controls]);
  return <></>;
}

describe('ChatMessagePlayerHostMount', () => {
  it('mounts the inner host when not suspended (play reaches the native player)', async () => {
    const tree = render(
      <>
        <ChatMessagePlayerHostMount />
        <BubbleProbe />
      </>,
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(expoAudioMocks.player.replace).toHaveBeenCalledWith('https://signed/voice.m4a');

    tree.unmount();
  });

  it('returns null while suspended — play() becomes a no-op', async () => {
    await act(async () => {
      await suspendHostForRecording();
    });

    const tree = render(
      <>
        <ChatMessagePlayerHostMount />
        <BubbleProbe />
      </>,
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(expoAudioMocks.player.replace).not.toHaveBeenCalled();
    expect(expoAudioMocks.player.play).not.toHaveBeenCalled();

    tree.unmount();
  });

  it('remounts the inner host after resume', async () => {
    await act(async () => {
      await suspendHostForRecording();
    });

    const tree = render(
      <>
        <ChatMessagePlayerHostMount />
      </>,
    );

    // Suspended → no host → bubble play would no-op.
    act(() => {
      resumeHostAfterRecording();
    });

    // Now the wrapper re-renders the inner host. Mount a bubble that plays.
    tree.rerender(
      <>
        <ChatMessagePlayerHostMount />
        <BubbleProbe />
      </>,
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(expoAudioMocks.player.replace).toHaveBeenCalledWith('https://signed/voice.m4a');

    tree.unmount();
  });
});
