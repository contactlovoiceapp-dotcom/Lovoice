/* Tests for ConversationComposer — lifecycle-driven rendering and send mechanics. */

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

import ConversationComposer from '../ConversationComposer';
import type { ConversationLifecycle } from '../../types';
import { COPY } from '@/copy';

function renderComposer(overrides: {
  lifecycle?: ConversationLifecycle;
  iAmInitiator?: boolean;
  otherDisplayName?: string;
  onSendText?: (body: string) => Promise<void>;
  onPressVoice?: () => void;
  isSending?: boolean;
} = {}) {
  const defaults = {
    lifecycle: { state: 'open' as const },
    iAmInitiator: true,
    otherDisplayName: 'Marie',
    onSendText: jest.fn(() => Promise.resolve()),
    onPressVoice: jest.fn(),
    isSending: false,
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
});
