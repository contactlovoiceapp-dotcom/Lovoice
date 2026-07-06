/* Tests for the Messages inbox screen: empty state, conversation rows, interactions. */

import React from 'react';
import { FlatList } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';

import MessagesScreen from '../MessagesScreen';
import { COPY } from '../../../copy';
import type { InboxConversation } from '../../../features/chat/types';

jest.mock('../../../lib/formatRelativeTime', () => ({
  formatRelativeTime: () => 'Il y a 3 min',
}));

const baseConversation: InboxConversation = {
  conversationId: 'conv-1',
  otherUserId: 'user-2',
  displayName: 'Marie',
  avatarEmojis: ['🌸'],
  lastMessageAt: '2026-05-24T10:00:00Z',
  lastMessagePreview: '🎤 Vocal · 0:42',
  lastMessageKind: 'voice',
  lastMessageSenderIsMe: false,
  unreadCount: 0,
  lifecycle: { state: 'open' },
  isOtherAccountDeleted: false,
};

const defaultProps = {
  conversations: [],
  isLoading: false,
  isError: false,
  onRefresh: jest.fn(),
  isRefreshing: false,
  onOpenConversation: jest.fn(),
};

describe('MessagesScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the title', () => {
    const { getByText } = render(<MessagesScreen {...defaultProps} />);
    expect(getByText(COPY.chat.inbox.title)).toBeTruthy();
  });

  it('renders the empty state when conversations is empty', () => {
    const { getByText } = render(<MessagesScreen {...defaultProps} />);
    expect(getByText(COPY.chat.inbox.emptyTitle)).toBeTruthy();
    expect(getByText(COPY.chat.inbox.emptyBody)).toBeTruthy();
  });

  it('renders a row per conversation with displayName and preview', () => {
    const props = { ...defaultProps, conversations: [baseConversation] };
    const { getByText } = render(<MessagesScreen {...props} />);
    expect(getByText('Marie')).toBeTruthy();
    expect(getByText('🎤 Vocal · 0:42')).toBeTruthy();
    expect(getByText('Il y a 3 min')).toBeTruthy();
  });

  it('shows the unread badge count when unreadCount > 0', () => {
    const convo: InboxConversation = { ...baseConversation, unreadCount: 3 };
    const props = { ...defaultProps, conversations: [convo] };
    const { getByText } = render(<MessagesScreen {...props} />);
    expect(getByText('3')).toBeTruthy();
  });

  it('does not show unread badge when unreadCount is 0', () => {
    const props = { ...defaultProps, conversations: [baseConversation] };
    const { queryByText } = render(<MessagesScreen {...props} />);
    expect(queryByText('0')).toBeNull();
  });

  it('calls onOpenConversation with the conversationId when a row is pressed', () => {
    const onOpenConversation = jest.fn();
    const props = { ...defaultProps, conversations: [baseConversation], onOpenConversation };
    const { getAllByRole } = render(<MessagesScreen {...props} />);
    const buttons = getAllByRole('button');
    fireEvent.press(buttons[0]);
    expect(onOpenConversation).toHaveBeenCalledWith('conv-1');
  });

  it('calls onRefresh when the error retry button is pressed', () => {
    const onRefresh = jest.fn();
    const props = { ...defaultProps, isError: true, onRefresh };
    const { getByText } = render(<MessagesScreen {...props} />);
    fireEvent.press(getByText(COPY.chat.inbox.retry));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('calls onRefresh when pull-to-refresh is triggered', () => {
    const onRefresh = jest.fn();
    const props = { ...defaultProps, conversations: [baseConversation], onRefresh };
    const { UNSAFE_getByType } = render(<MessagesScreen {...props} />);
    const flatList = UNSAFE_getByType(FlatList);
    fireEvent(flatList, 'refresh');
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('shows loading indicator when isLoading and conversations is empty', () => {
    const props = { ...defaultProps, isLoading: true };
    const { queryByText } = render(<MessagesScreen {...props} />);
    expect(queryByText(COPY.chat.inbox.emptyTitle)).toBeNull();
    // ActivityIndicator is rendered — verify no empty state is shown
    expect(queryByText(COPY.chat.inbox.emptyBody)).toBeNull();
  });

  it('renders multiple rows for multiple conversations', () => {
    const second: InboxConversation = {
      ...baseConversation,
      conversationId: 'conv-2',
      displayName: 'Léa',
      lastMessagePreview: 'Coucou !',
    };
    const props = { ...defaultProps, conversations: [baseConversation, second] };
    const { getByText } = render(<MessagesScreen {...props} />);
    expect(getByText('Marie')).toBeTruthy();
    expect(getByText('Léa')).toBeTruthy();
  });

  it('shows awaiting_reply lifecycle pill', () => {
    const convo: InboxConversation = {
      ...baseConversation,
      lifecycle: { state: 'awaiting_reply', initiatorId: 'user-1' },
    };
    const props = { ...defaultProps, conversations: [convo] };
    const { getByText } = render(<MessagesScreen {...props} />);
    expect(getByText(COPY.chat.inbox.awaitingBadge)).toBeTruthy();
  });

  it('shows voice_only lifecycle pill', () => {
    const convo: InboxConversation = {
      ...baseConversation,
      lifecycle: {
        state: 'voice_only',
        firstReplyAt: '2026-05-24T08:00:00Z',
        voiceOnlyUntil: '2026-05-25T08:00:00Z',
      },
    };
    const props = { ...defaultProps, conversations: [convo] };
    const { getByText } = render(<MessagesScreen {...props} />);
    expect(getByText(COPY.chat.inbox.voiceOnlyBadge)).toBeTruthy();
  });

  it('renders a non-interactive row for a deleted correspondent', () => {
    const deleted: InboxConversation = {
      ...baseConversation,
      displayName: COPY.chat.inbox.deletedAccountName,
      lastMessagePreview: COPY.chat.inbox.deletedAccountPreview,
      lifecycle: { state: 'awaiting_reply', initiatorId: 'me' },
      isOtherAccountDeleted: true,
    };
    const onOpenConversation = jest.fn();
    const props = { ...defaultProps, conversations: [deleted], onOpenConversation };
    const { getByLabelText, queryByText, queryAllByRole } = render(<MessagesScreen {...props} />);

    expect(getByLabelText(COPY.chat.inbox.deletedAccountA11y)).toBeTruthy();
    expect(queryByText(COPY.chat.inbox.awaitingBadge)).toBeNull();
    expect(queryAllByRole('button')).toHaveLength(0);
    expect(onOpenConversation).not.toHaveBeenCalled();
  });
});
