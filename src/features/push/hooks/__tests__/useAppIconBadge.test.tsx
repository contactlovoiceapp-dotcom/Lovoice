/* Tests for useAppIconBadge hook: OS badge count stays in sync with unread/unseen totals. */

import React from 'react';
import { render, waitFor } from '@testing-library/react-native';

jest.mock('expo-notifications', () => ({
  setBadgeCountAsync: jest.fn(),
}));

jest.mock('@/features/likes/hooks/useUnseenLikes', () => ({
  useUnseenLikesCount: jest.fn(),
}));

jest.mock('@/features/chat/hooks/useUnreadMessagesCount', () => ({
  useUnreadMessagesCount: jest.fn(),
}));

import * as Notifications from 'expo-notifications';
import { useUnseenLikesCount } from '@/features/likes/hooks/useUnseenLikes';
import { useUnreadMessagesCount } from '@/features/chat/hooks/useUnreadMessagesCount';
import { useAppIconBadge } from '../useAppIconBadge';

function HookConsumer() {
  useAppIconBadge();
  return null;
}

describe('useAppIconBadge', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(Notifications.setBadgeCountAsync).mockResolvedValue(true);
  });

  it('calls setBadgeCountAsync(0) when both counts are 0', async () => {
    jest.mocked(useUnseenLikesCount).mockReturnValue(0);
    jest.mocked(useUnreadMessagesCount).mockReturnValue(0);

    render(<HookConsumer />);

    await waitFor(() => {
      expect(Notifications.setBadgeCountAsync).toHaveBeenCalledWith(0);
    });
  });

  it('calls setBadgeCountAsync with the correct sum of both counts', async () => {
    jest.mocked(useUnseenLikesCount).mockReturnValue(3);
    jest.mocked(useUnreadMessagesCount).mockReturnValue(5);

    render(<HookConsumer />);

    await waitFor(() => {
      expect(Notifications.setBadgeCountAsync).toHaveBeenCalledWith(8);
    });
  });

  it('re-calls setBadgeCountAsync when a count changes', async () => {
    jest.mocked(useUnseenLikesCount).mockReturnValue(1);
    jest.mocked(useUnreadMessagesCount).mockReturnValue(0);

    const { rerender } = render(<HookConsumer />);

    await waitFor(() => {
      expect(Notifications.setBadgeCountAsync).toHaveBeenCalledWith(1);
    });

    jest.mocked(useUnseenLikesCount).mockReturnValue(4);
    rerender(<HookConsumer />);

    await waitFor(() => {
      expect(Notifications.setBadgeCountAsync).toHaveBeenCalledWith(4);
    });
  });

  it('does not crash if setBadgeCountAsync rejects', async () => {
    jest.mocked(useUnseenLikesCount).mockReturnValue(2);
    jest.mocked(useUnreadMessagesCount).mockReturnValue(1);
    jest.mocked(Notifications.setBadgeCountAsync).mockRejectedValue(new Error('Badge unavailable'));

    expect(() => render(<HookConsumer />)).not.toThrow();

    await waitFor(() => {
      expect(Notifications.setBadgeCountAsync).toHaveBeenCalledWith(3);
    });
  });
});
