/* Tests for ConversationComposer — lifecycle-driven rendering and send mechanics. */

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

import ConversationComposer from '../ConversationComposer';
import type { ConversationLifecycle } from '../../types';
import { COPY } from '@/copy';

jest.mock('../VoiceRecordingSession', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- isolated jest factory scope
  const { useEffect } = require('react');
  return function MockVoiceRecordingSession({
    mode,
    onReady,
    onFinalized,
  }: {
    mode: string;
    onReady?: () => void;
    onFinalized?: (result: { uri: string; durationMs: number }) => void;
  }) {
    useEffect(() => {
      if (mode === 'recording') onReady?.();
      if (mode === 'finalizing') {
        onFinalized?.({ uri: 'file:///tmp/voice.m4a', durationMs: 5_000 });
      }
    }, [mode, onReady, onFinalized]);
    return null;
  };
});

function renderComposer(overrides: {
  lifecycle?: ConversationLifecycle;
  iAmInitiator?: boolean;
  otherDisplayName?: string;
  onSendText?: (body: string) => Promise<void>;
  onSendVoice?: (uri: string, durationMs: number) => Promise<void>;
  isSending?: boolean;
  isSendingVoice?: boolean;
  onTextChange?: (text: string) => void;
} = {}) {
  const defaults = {
    lifecycle: { state: 'open' as const },
    iAmInitiator: true,
    otherDisplayName: 'Marie',
    onSendText: jest.fn(() => Promise.resolve()),
    onSendVoice: jest.fn(() => Promise.resolve()),
    isSending: false,
    isSendingVoice: false,
    ...overrides,
  };

  return { ...render(<ConversationComposer {...defaults} />), ...defaults };
}

describe('ConversationComposer', () => {
  it('renders a text input and send button in open state', () => {
    const { getByTestId } = renderComposer();

    expect(getByTestId('composer-input')).toBeTruthy();
    expect(getByTestId('send-button')).toBeTruthy();
  });

  it('renders a hint banner in empty state for the initiator', () => {
    const { getByText } = renderComposer({
      lifecycle: { state: 'empty' },
      iAmInitiator: true,
    });

    expect(getByText(COPY.chat.conversation.composerHintInitial)).toBeTruthy();
  });

  it('renders a hint banner in awaiting_reply state for the initiator', () => {
    const { getByText } = renderComposer({
      lifecycle: { state: 'awaiting_reply', initiatorId: 'me' },
      iAmInitiator: true,
    });

    expect(getByText(COPY.chat.conversation.composerHintAwaiting('Marie'))).toBeTruthy();
  });

  it('renders a recipient reply hint for the non-initiator in awaiting_reply', () => {
    const { getByText } = renderComposer({
      lifecycle: { state: 'awaiting_reply', initiatorId: 'other' },
      iAmInitiator: false,
    });

    expect(getByText(COPY.chat.conversation.composerHintRecipientReply)).toBeTruthy();
  });

  it('calls onSendText when Send button is pressed with text', async () => {
    const onSendText = jest.fn(() => Promise.resolve());
    const { getByTestId } = renderComposer({ onSendText });

    fireEvent.changeText(getByTestId('composer-input'), 'Bonjour');
    fireEvent.press(getByTestId('send-button'));

    await waitFor(() => {
      expect(onSendText).toHaveBeenCalledWith('Bonjour');
    });
  });

  it('does not call onSendText when input is only whitespace', () => {
    const onSendText = jest.fn(() => Promise.resolve());
    const { getByTestId } = renderComposer({ onSendText });

    fireEvent.changeText(getByTestId('composer-input'), '   ');
    fireEvent.press(getByTestId('send-button'));

    expect(onSendText).not.toHaveBeenCalled();
  });

  it('shows defensive hint for non-initiator in empty state', () => {
    const { getByText } = renderComposer({
      lifecycle: { state: 'empty' },
      iAmInitiator: false,
    });

    expect(getByText(COPY.chat.conversation.composerHintEmptyDefensive)).toBeTruthy();
  });

  it('renders a voice button in voice_only state', () => {
    // voiceOnlyUntil is far in the future so the countdown renders a non-expired time.
    const future = new Date(Date.now() + 23 * 60 * 60 * 1000).toISOString();
    const { getByTestId } = renderComposer({
      lifecycle: { state: 'voice_only', firstReplyAt: new Date().toISOString(), voiceOnlyUntil: future },
    });

    expect(getByTestId('voice-button')).toBeTruthy();
  });

  it('renders a voice button for initiator in empty state', () => {
    const { getByTestId } = renderComposer({
      lifecycle: { state: 'empty' },
      iAmInitiator: true,
    });

    expect(getByTestId('voice-button')).toBeTruthy();
  });

  it('calls onTextChange when the user types in open state', async () => {
    const onTextChange = jest.fn();
    const { getByTestId } = renderComposer({ onTextChange });

    fireEvent.changeText(getByTestId('composer-input'), 'Salut');

    await waitFor(() => {
      expect(onTextChange).toHaveBeenCalledWith('Salut');
    });
  });

  it('keeps the sending overlay through finalize and upload without flashing the idle form', async () => {
    const onSendVoice = jest.fn(() => Promise.resolve());
    const { getByTestId, queryByTestId, rerender } = renderComposer({
      lifecycle: { state: 'open' },
      onSendVoice,
    });

    fireEvent.press(getByTestId('voice-button'));
    await waitFor(() => expect(getByTestId('recording-send-button')).toBeTruthy());

    fireEvent.press(getByTestId('recording-send-button'));

    await waitFor(() => {
      expect(queryByTestId('composer-input')).toBeNull();
    });
    expect(onSendVoice).toHaveBeenCalledWith('file:///tmp/voice.m4a', 5_000);

    rerender(
      <ConversationComposer
        lifecycle={{ state: 'open' }}
        iAmInitiator
        otherDisplayName="Marie"
        onSendText={jest.fn()}
        onSendVoice={onSendVoice}
        isSending={false}
        isSendingVoice
      />,
    );
    expect(queryByTestId('composer-input')).toBeNull();

    rerender(
      <ConversationComposer
        lifecycle={{ state: 'open' }}
        iAmInitiator
        otherDisplayName="Marie"
        onSendText={jest.fn()}
        onSendVoice={onSendVoice}
        isSending={false}
        isSendingVoice={false}
      />,
    );

    await waitFor(() => expect(getByTestId('composer-input')).toBeTruthy());
  });
});
