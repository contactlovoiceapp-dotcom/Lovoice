/* Tests for VoiceRecordingSession — mount fires permission + prepare + record,
   finalize → onFinalized, cancel → onCancelled, permission denial → onError. */

import React from 'react';
import { View } from 'react-native';
import { render, act, waitFor } from '@testing-library/react-native';
import { requestRecordingPermissionsAsync } from 'expo-audio';

import VoiceRecordingSession from '../VoiceRecordingSession';
import type { RecordingSessionMode } from '../VoiceRecordingSession';

jest.mock('@/lib/sentry', () => ({
  Sentry: {
    addBreadcrumb: jest.fn(),
    captureException: jest.fn(),
  },
}));

jest.mock('@/features/chat/lib/chatMessagePlayer', () => ({
  pauseAllChatMessages: jest.fn(),
}));

jest.mock('@/lib/feedPlayer', () => ({
  pauseFeedPlayer: jest.fn(),
}));

jest.mock('@/features/voices/hooks/useVoicePlayer', () => ({
  pauseProfileVoicePlayer: jest.fn(),
}));

const mocks = (global as Record<string, unknown>).__expoAudioMocks as {
  recorder: {
    prepareToRecordAsync: jest.Mock;
    record: jest.Mock;
    stop: jest.Mock;
    isRecording: boolean;
    uri: string | null;
  };
  recorderState: {
    isRecording: boolean;
    durationMillis: number;
    metering: number | undefined;
  };
};

beforeEach(() => {
  jest.clearAllMocks();
  mocks.recorder.uri = 'file:///tmp/recording.m4a';
  mocks.recorder.isRecording = false;
  mocks.recorderState.isRecording = false;
  mocks.recorderState.durationMillis = 0;
  mocks.recorderState.metering = undefined;
  (requestRecordingPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true });
});

function SessionWrapper(props: {
  mode: RecordingSessionMode;
  onReady: () => void;
  onTick: (d: number, m: number[]) => void;
  onFinalized: (r: { uri: string; durationMs: number }) => void;
  onCancelled: () => void;
  onError: (c: string) => void;
}) {
  return (
    <View testID="session-host">
      <VoiceRecordingSession {...props} />
    </View>
  );
}

describe('VoiceRecordingSession — mount', () => {
  it('requests permission, prepares, records, and calls onReady', async () => {
    const onReady = jest.fn();

    render(
      <SessionWrapper
        mode="recording"
        onReady={onReady}
        onTick={jest.fn()}
        onFinalized={jest.fn()}
        onCancelled={jest.fn()}
        onError={jest.fn()}
      />,
    );

    await waitFor(() => {
      expect(onReady).toHaveBeenCalledTimes(1);
    });

    expect(requestRecordingPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(mocks.recorder.prepareToRecordAsync).toHaveBeenCalledTimes(1);
    expect(mocks.recorder.record).toHaveBeenCalledTimes(1);
  });

  it('calls onError with permission_denied when permission is not granted', async () => {
    (requestRecordingPermissionsAsync as jest.Mock).mockResolvedValue({ granted: false });
    const onError = jest.fn();

    render(
      <SessionWrapper
        mode="recording"
        onReady={jest.fn()}
        onTick={jest.fn()}
        onFinalized={jest.fn()}
        onCancelled={jest.fn()}
        onError={onError}
      />,
    );

    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith('permission_denied');
    });
  });

  it('calls onError with prepare_failed when prepareToRecordAsync throws', async () => {
    mocks.recorder.prepareToRecordAsync.mockRejectedValueOnce(new Error('prepare boom'));
    const onError = jest.fn();

    render(
      <SessionWrapper
        mode="recording"
        onReady={jest.fn()}
        onTick={jest.fn()}
        onFinalized={jest.fn()}
        onCancelled={jest.fn()}
        onError={onError}
      />,
    );

    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith('prepare_failed');
    });
  });
});

describe('VoiceRecordingSession — cancel', () => {
  it('calls onCancelled when mode switches to cancelling', async () => {
    const onCancelled = jest.fn();
    const onReady = jest.fn();
    const shared = {
      onTick: jest.fn(),
      onFinalized: jest.fn(),
      onError: jest.fn(),
    };

    const { rerender } = render(
      <SessionWrapper mode="recording" onReady={onReady} onCancelled={onCancelled} {...shared} />,
    );

    await waitFor(() => {
      expect(onReady).toHaveBeenCalledTimes(1);
    });

    mocks.recorder.isRecording = true;

    await act(async () => {
      rerender(
        <SessionWrapper mode="cancelling" onReady={onReady} onCancelled={onCancelled} {...shared} />,
      );
    });

    await waitFor(() => {
      expect(onCancelled).toHaveBeenCalledTimes(1);
    });
  });
});

describe('VoiceRecordingSession — finalize', () => {
  it('calls onFinalized when mode switches to finalizing', async () => {
    const onFinalized = jest.fn();
    const onReady = jest.fn();
    const shared = {
      onTick: jest.fn(),
      onCancelled: jest.fn(),
      onError: jest.fn(),
    };

    mocks.recorderState.durationMillis = 5_000;

    const { rerender } = render(
      <SessionWrapper mode="recording" onReady={onReady} onFinalized={onFinalized} {...shared} />,
    );

    await waitFor(() => {
      expect(onReady).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      rerender(
        <SessionWrapper mode="finalizing" onReady={onReady} onFinalized={onFinalized} {...shared} />,
      );
    });

    await waitFor(() => {
      expect(mocks.recorder.stop).toHaveBeenCalled();
      expect(onFinalized).toHaveBeenCalledTimes(1);
      expect(onFinalized).toHaveBeenCalledWith(
        expect.objectContaining({ uri: expect.any(String), durationMs: expect.any(Number) }),
      );
    });
  });

  it('calls onError with no_uri when recorder.uri is null', async () => {
    const onError = jest.fn();
    const onReady = jest.fn();
    const shared = {
      onTick: jest.fn(),
      onFinalized: jest.fn(),
      onCancelled: jest.fn(),
    };

    const { rerender } = render(
      <SessionWrapper mode="recording" onReady={onReady} onError={onError} {...shared} />,
    );

    await waitFor(() => {
      expect(onReady).toHaveBeenCalledTimes(1);
    });

    // Override stop so it resolves but leaves uri as null.
    mocks.recorder.stop.mockImplementationOnce(() => {
      mocks.recorder.uri = null;
      return Promise.resolve();
    });

    await act(async () => {
      rerender(
        <SessionWrapper mode="finalizing" onReady={onReady} onError={onError} {...shared} />,
      );
    });

    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith('no_uri');
    });
  });
});
