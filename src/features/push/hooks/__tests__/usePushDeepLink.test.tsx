/* Tests for usePushDeepLink hook: cold-start, live tap, dedup, and deep-link validation. */
/* eslint-disable import/first -- jest.mock must precede imports under test */

import React from 'react';
import { render, waitFor, act } from '@testing-library/react-native';
import type * as NotificationsTypes from 'expo-notifications';

jest.mock('expo-notifications', () => ({
  getLastNotificationResponseAsync: jest.fn(),
  addNotificationResponseReceivedListener: jest.fn(),
  clearLastNotificationResponseAsync: jest.fn(),
}));

jest.mock('@/lib/push', () => ({
  clearPendingNotificationDeepLink: jest.fn(() => Promise.resolve()),
}));

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), navigate: jest.fn() },
}));

jest.mock('@/navigation/messagesNavigation', () => ({
  openConversation: jest.fn(),
}));

import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { openConversation } from '@/navigation/messagesNavigation';
import { clearPendingNotificationDeepLink } from '@/lib/push';
import { usePushDeepLink } from '../usePushDeepLink';

const VALID_UUID = '123e4567-e89b-12d3-a456-426614174000';

function makeResponse(
  deepLink: string | null,
  notificationId = 'notif-1',
  identifier = 'req-id-1',
): NotificationsTypes.NotificationResponse {
  return {
    notification: {
      request: {
        identifier,
        content: {
          data: {
            ...(deepLink !== null ? { deep_link: deepLink } : {}),
            notification_id: notificationId,
          },
        },
      },
    },
  } as unknown as NotificationsTypes.NotificationResponse;
}

function HookConsumer() {
  usePushDeepLink();
  return null;
}

describe('usePushDeepLink', () => {
  let capturedListener:
    | ((response: NotificationsTypes.NotificationResponse) => void)
    | null = null;
  const removeMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    capturedListener = null;

    jest.mocked(Notifications.getLastNotificationResponseAsync).mockResolvedValue(null);
    jest
      .mocked(Notifications.addNotificationResponseReceivedListener)
      .mockImplementation((cb) => {
        capturedListener = cb;
        return {
          remove: removeMock,
        } as unknown as ReturnType<
          typeof Notifications.addNotificationResponseReceivedListener
        >;
      });
  });

  it('navigates to /likes on cold-start for a like notification', async () => {
    jest
      .mocked(Notifications.getLastNotificationResponseAsync)
      .mockResolvedValue(makeResponse('/likes', 'notif-like-1'));

    render(<HookConsumer />);

    await waitFor(() => {
      expect(router.push).toHaveBeenCalledWith('/likes');
    });

    await waitFor(() => {
      expect(clearPendingNotificationDeepLink).toHaveBeenCalled();
    });
  });

  it('navigates to /messages/<uuid> on cold-start for a message notification', async () => {
    jest
      .mocked(Notifications.getLastNotificationResponseAsync)
      .mockResolvedValue(makeResponse(`/messages/${VALID_UUID}`, 'notif-msg-1'));

    render(<HookConsumer />);

    await waitFor(() => {
      expect(openConversation).toHaveBeenCalledWith(VALID_UUID);
    });

    await waitFor(() => {
      expect(clearPendingNotificationDeepLink).toHaveBeenCalled();
    });
  });

  it('navigates after receiving a tap via the live listener', async () => {
    render(<HookConsumer />);

    // Drain the cold-start promise first.
    await waitFor(() => {
      expect(Notifications.getLastNotificationResponseAsync).toHaveBeenCalled();
    });

    await act(async () => {
      capturedListener?.(makeResponse('/likes', 'notif-live'));
    });

    expect(router.push).toHaveBeenCalledWith('/likes');
  });

  it('does not navigate twice for the same notification_id (dedup)', async () => {
    jest
      .mocked(Notifications.getLastNotificationResponseAsync)
      .mockResolvedValue(makeResponse('/likes', 'notif-dup'));

    render(<HookConsumer />);

    await waitFor(() => {
      expect(router.push).toHaveBeenCalledTimes(1);
    });

    // Listener fires with the same notification_id — must be skipped.
    await act(async () => {
      capturedListener?.(makeResponse('/likes', 'notif-dup'));
    });

    expect(router.push).toHaveBeenCalledTimes(1);
  });

  it('does not navigate when deep_link is an external URL', async () => {
    jest
      .mocked(Notifications.getLastNotificationResponseAsync)
      .mockResolvedValue(makeResponse('https://malicious.com/phish', 'notif-bad'));

    render(<HookConsumer />);

    await waitFor(() => {
      expect(Notifications.getLastNotificationResponseAsync).toHaveBeenCalled();
    });

    expect(router.push).not.toHaveBeenCalled();
  });

  it('does not navigate when deep_link is a relative path not in the allowlist', async () => {
    jest
      .mocked(Notifications.getLastNotificationResponseAsync)
      .mockResolvedValue(makeResponse('/settings', 'notif-settings'));

    render(<HookConsumer />);

    await waitFor(() => {
      expect(Notifications.getLastNotificationResponseAsync).toHaveBeenCalled();
    });

    expect(router.push).not.toHaveBeenCalled();
  });

  it('removes the listener on unmount', async () => {
    const { unmount } = render(<HookConsumer />);

    unmount();

    expect(removeMock).toHaveBeenCalledTimes(1);
  });
});
