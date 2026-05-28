/* Tests for push notification helpers: handler setup and token registration. */

import { Platform } from 'react-native';

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  getExpoPushTokenAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(() => Promise.resolve()),
  AndroidImportance: { MAX: 5 },
}));

// Inline the default config so the factory is self-contained.
// Individual tests mutate Constants.expoConfig to simulate edge cases.
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: {
      extra: {
        eas: {
          projectId: 'test-project-id',
        },
      },
    },
    easConfig: null as { projectId?: string } | null,
  },
}));

import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { setupNotificationHandler, registerForPushNotificationsAsync } from '../push';

type MutableEasConfig = { projectId: string };
type MutableExtra = { eas: MutableEasConfig };
type MutableExpoConfig = { extra: MutableExtra };

function getEasConfig(): MutableEasConfig {
  return (Constants.expoConfig?.extra as MutableExtra).eas;
}

describe('setupNotificationHandler', () => {
  it('calls setNotificationHandler with the correct foreground flags', () => {
    setupNotificationHandler();

    expect(Notifications.setNotificationHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        handleNotification: expect.any(Function),
      }),
    );
  });

  it('handleNotification resolves with the expected behavior flags', async () => {
    setupNotificationHandler();

    const handler = jest.mocked(Notifications.setNotificationHandler).mock.calls[0][0];
    expect(handler).toBeDefined();
    type NotificationHandler = NonNullable<typeof handler>;
    const behavior = await handler!.handleNotification(
      {} as Parameters<NotificationHandler['handleNotification']>[0],
    );

    expect(behavior).toEqual({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    });
  });
});

describe('registerForPushNotificationsAsync', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(Notifications.setNotificationChannelAsync).mockResolvedValue(
      null as unknown as Awaited<ReturnType<typeof Notifications.setNotificationChannelAsync>>,
    );
    // Restore the default projectId before each test.
    getEasConfig().projectId = 'test-project-id';
  });

  it('returns null when permission is denied and canAskAgain is false', async () => {
    jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue({
      status: 'denied',
      granted: false,
      canAskAgain: false,
      expires: 'never',
    } as unknown as Awaited<ReturnType<typeof Notifications.getPermissionsAsync>>);

    const token = await registerForPushNotificationsAsync();

    expect(token).toBeNull();
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('returns null when requestPermissionsAsync is called but still returns denied', async () => {
    jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue({
      status: 'undetermined',
      granted: false,
      canAskAgain: true,
      expires: 'never',
    } as unknown as Awaited<ReturnType<typeof Notifications.getPermissionsAsync>>);

    jest.mocked(Notifications.requestPermissionsAsync).mockResolvedValue({
      status: 'denied',
      granted: false,
      canAskAgain: false,
      expires: 'never',
    } as unknown as Awaited<ReturnType<typeof Notifications.requestPermissionsAsync>>);

    const token = await registerForPushNotificationsAsync();

    expect(token).toBeNull();
    expect(Notifications.requestPermissionsAsync).toHaveBeenCalledTimes(1);
  });

  it('returns null when projectId is missing from config', async () => {
    jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue({
      status: 'granted',
      granted: true,
      canAskAgain: true,
      expires: 'never',
    } as unknown as Awaited<ReturnType<typeof Notifications.getPermissionsAsync>>);

    getEasConfig().projectId = '';

    const token = await registerForPushNotificationsAsync();

    expect(token).toBeNull();
    expect(Notifications.getExpoPushTokenAsync).not.toHaveBeenCalled();
  });

  it('returns the token string when everything succeeds', async () => {
    jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue({
      status: 'granted',
      granted: true,
      canAskAgain: true,
      expires: 'never',
    } as unknown as Awaited<ReturnType<typeof Notifications.getPermissionsAsync>>);

    jest.mocked(Notifications.getExpoPushTokenAsync).mockResolvedValue({
      data: 'ExponentPushToken[abc]',
      type: 'expo',
    });

    const token = await registerForPushNotificationsAsync();

    expect(token).toBe('ExponentPushToken[abc]');
    expect(Notifications.getExpoPushTokenAsync).toHaveBeenCalledWith({
      projectId: 'test-project-id',
    });
  });

  it('returns null when getExpoPushTokenAsync throws (e.g. iOS simulator)', async () => {
    jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue({
      status: 'granted',
      granted: true,
      canAskAgain: true,
      expires: 'never',
    } as unknown as Awaited<ReturnType<typeof Notifications.getPermissionsAsync>>);

    jest.mocked(Notifications.getExpoPushTokenAsync).mockRejectedValue(
      new Error('Must be on a physical device to use Expo push notifications'),
    );

    const token = await registerForPushNotificationsAsync();

    expect(token).toBeNull();
  });

  it('calls setNotificationChannelAsync on Android', async () => {
    const originalOS = Platform.OS;
    Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });

    jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue({
      status: 'denied',
      granted: false,
      canAskAgain: false,
      expires: 'never',
    } as unknown as Awaited<ReturnType<typeof Notifications.getPermissionsAsync>>);

    await registerForPushNotificationsAsync();

    expect(Notifications.setNotificationChannelAsync).toHaveBeenCalledWith(
      'default',
      expect.objectContaining({ name: 'Notifications' }),
    );

    Object.defineProperty(Platform, 'OS', { value: originalOS, configurable: true });
  });
});
