// Push notification helpers: foreground handler setup and Expo Push Token registration.
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

/**
 * Configures the foreground notification handler so banners show while the app is open.
 * Must be called once at app startup, before any notification can arrive.
 */
export function setupNotificationHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
}

/**
 * Ensures the Android default notification channel exists with sound and vibration.
 * No-op on iOS.
 */
async function ensureAndroidDefaultChannel(): Promise<void> {
  await Notifications.setNotificationChannelAsync('default', {
    name: 'Notifications',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#e724ab',
    sound: 'default',
  });
}

/**
 * Clears the last notification tap stored by the OS so it is not replayed on the
 * next unrelated navigation (e.g. finishing onboarding and entering the main tabs).
 */
/** Deep link path used in push payloads for a conversation thread. */
export function conversationPushDeepLink(conversationId: string): string {
  return `/messages/${conversationId}`;
}

/**
 * Removes all Notification Center entries whose deep_link targets the given
 * conversation. Safe to call from any conversation entry point; does not touch
 * the OS app-icon badge or the last notification tap response.
 */
export async function dismissNotificationsForConversation(
  conversationId: string,
): Promise<void> {
  try {
    const targetDeepLink = conversationPushDeepLink(conversationId);
    const presented = await Notifications.getPresentedNotificationsAsync();

    await Promise.all(
      presented
        .filter((notification) => {
          const deepLink = notification.request.content.data?.deep_link;
          return typeof deepLink === 'string' && deepLink === targetDeepLink;
        })
        .map((notification) =>
          Notifications.dismissNotificationAsync(notification.request.identifier),
        ),
    );
  } catch (error: unknown) {
    console.warn('[push] Failed to dismiss conversation notifications:', error);
  }
}

/**
 * Clears the last notification tap stored by the OS so it is not replayed on the
 * next unrelated navigation (e.g. finishing onboarding and entering the main tabs).
 */
export async function clearPendingNotificationDeepLink(): Promise<void> {
  try {
    const clear = (
      Notifications as typeof Notifications & {
        clearLastNotificationResponseAsync?: () => Promise<void>;
      }
    ).clearLastNotificationResponseAsync;

    if (typeof clear === 'function') {
      await clear();
    }
  } catch (error: unknown) {
    console.warn('[push] Failed to clear last notification response:', error);
  }
}

/**
 * Requests permission and returns the Expo Push Token string, or null if:
 * - the user denied permission (and canAskAgain is false)
 * - the Expo project ID is missing from app config
 * - the device is a simulator (iOS simulators cannot receive APNS tokens)
 * - any unexpected error occurred (logs but never throws)
 */
export async function registerForPushNotificationsAsync(): Promise<string | null> {
  try {
    if (Platform.OS === 'android') {
      await ensureAndroidDefaultChannel();
    }

    const { status, canAskAgain } = await Notifications.getPermissionsAsync();

    let finalStatus = status;

    if (status !== 'granted' && canAskAgain) {
      const result = await Notifications.requestPermissionsAsync();
      finalStatus = result.status;
    }

    if (finalStatus !== 'granted') {
      return null;
    }

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      (Constants.easConfig as { projectId?: string } | undefined)?.projectId;

    if (!projectId) {
      console.warn('[push] Missing EAS projectId — cannot register for push notifications.');
      return null;
    }

    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });

    return data;
  } catch (error: unknown) {
    // iOS simulators throw when requesting an APNS token; treat it as a soft failure.
    console.warn('[push] Failed to register for push notifications:', error);
    return null;
  }
}
