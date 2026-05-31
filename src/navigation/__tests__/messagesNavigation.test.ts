/* Tests for messages tab navigation helpers. */

jest.mock('expo-router', () => ({
  router: {
    navigate: jest.fn(),
    push: jest.fn(),
    replace: jest.fn(),
  },
}));

jest.mock('@/lib/push', () => ({
  dismissNotificationsForConversation: jest.fn(() => Promise.resolve()),
}));

import { router } from 'expo-router';
import { dismissNotificationsForConversation } from '@/lib/push';
import {
  closeConversation,
  navigateToMessagesInbox,
  openConversation,
} from '../messagesNavigation';

describe('messagesNavigation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('navigateToMessagesInbox targets the messages tab root', () => {
    navigateToMessagesInbox();
    expect(router.navigate).toHaveBeenCalledWith('/(main)/messages');
  });

  it('closeConversation replaces the current conversation with the inbox', () => {
    closeConversation();
    expect(router.replace).toHaveBeenCalledWith('/(main)/messages');
  });

  it('openConversation seeds the inbox before pushing the conversation route', () => {
    openConversation('conv-123');
    expect(dismissNotificationsForConversation).toHaveBeenCalledWith('conv-123');
    expect(router.navigate).toHaveBeenCalledWith('/(main)/messages');
    expect(router.push).toHaveBeenCalledWith('/(main)/messages/conv-123');
  });
});
