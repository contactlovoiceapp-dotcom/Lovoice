/* Tests for MessageBubble — visual alignment, status indicators, and retry tap. */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

import MessageBubble from '../MessageBubble';
import type { ChatMessage } from '../../types';
import { COPY } from '@/copy';

function makeMsg(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'msg-1',
    clientId: 'msg-1',
    conversationId: 'conv-1',
    senderId: 'user-a',
    kind: 'text',
    bodyText: 'Hello world',
    voicePath: null,
    voiceDurationMs: null,
    status: 'sent',
    failureReason: null,
    createdAt: '2026-05-24T10:00:00Z',
    readAt: null,
    ...overrides,
  };
}

describe('MessageBubble', () => {
  it('renders text content for my message', () => {
    const { getByText } = render(
      <MessageBubble message={makeMsg()} isMine showTimestamp />,
    );

    expect(getByText('Hello world')).toBeTruthy();
  });

  it('renders text content for their message', () => {
    const { getByText } = render(
      <MessageBubble message={makeMsg()} isMine={false} showTimestamp />,
    );

    expect(getByText('Hello world')).toBeTruthy();
  });

  it('shows "✓ Envoyé" status for a sent mine message with timestamp', () => {
    const { getByText } = render(
      <MessageBubble message={makeMsg()} isMine showTimestamp />,
    );

    expect(getByText(COPY.chat.conversation.status.sent)).toBeTruthy();
  });

  it('shows "✓✓ Lu" status when readAt is set', () => {
    const msg = makeMsg({ readAt: '2026-05-24T10:01:00Z' });
    const { getByText } = render(
      <MessageBubble message={msg} isMine showTimestamp />,
    );

    expect(getByText(COPY.chat.conversation.status.read)).toBeTruthy();
  });

  it('shows "Envoi…" status when sending', () => {
    const msg = makeMsg({ status: 'sending' });
    const { getByText } = render(
      <MessageBubble message={msg} isMine showTimestamp />,
    );

    expect(getByText(COPY.chat.conversation.status.sending)).toBeTruthy();
  });

  it('shows the failure label and calls onRetry when tapped', () => {
    const onRetry = jest.fn();
    const msg = makeMsg({ status: 'failed' });
    const { getByTestId } = render(
      <MessageBubble message={msg} isMine showTimestamp onRetry={onRetry} />,
    );

    fireEvent.press(getByTestId('retry-button'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('renders a voice placeholder for voice messages', () => {
    const msg = makeMsg({ kind: 'voice', bodyText: null, voiceDurationMs: 12000 });
    const { getByText } = render(
      <MessageBubble message={msg} isMine showTimestamp />,
    );

    expect(getByText('🎤 Vocal · 0:12')).toBeTruthy();
  });

  it('hides status indicators when showTimestamp is false', () => {
    const { queryByText } = render(
      <MessageBubble message={makeMsg()} isMine showTimestamp={false} />,
    );

    expect(queryByText(COPY.chat.conversation.status.sent)).toBeNull();
  });
});
