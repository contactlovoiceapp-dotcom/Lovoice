// Removes BOOT_COMPLETED from expo-notifications' receiver so Play Console's
// Android 15 FGS static analyzer does not flag expo-audio foreground services.
const { withAndroidManifest } = require("@expo/config-plugins");

const NOTIFICATIONS_SERVICE =
  "expo.modules.notifications.service.NotificationsService";

/**
 * @see https://github.com/expo/expo/issues/41627
 * @see https://developer.android.com/about/versions/15/changes/foreground-service-types
 */
const withDisableNotificationsBootActions = (config) => {
  return withAndroidManifest(config, (modConfig) => {
    const manifest = modConfig.modResults.manifest;
    const mainApplication = manifest.application?.[0];

    if (!mainApplication) {
      return modConfig;
    }

    manifest.$ = manifest.$ ?? {};
    if (!manifest.$["xmlns:tools"]) {
      manifest.$["xmlns:tools"] = "http://schemas.android.com/tools";
    }

    if (!mainApplication.receiver) {
      mainApplication.receiver = [];
    }

    mainApplication.receiver = mainApplication.receiver.filter(
      (receiver) => receiver.$["android:name"] !== NOTIFICATIONS_SERVICE,
    );

    mainApplication.receiver.push({
      $: {
        "android:name": NOTIFICATIONS_SERVICE,
        "android:enabled": "true",
        "android:exported": "false",
        "tools:node": "replace",
      },
      "intent-filter": [
        {
          $: {
            "android:priority": "-1",
          },
          action: [
            {
              $: {
                "android:name": "expo.modules.notifications.NOTIFICATION_EVENT",
              },
            },
            {
              $: {
                "android:name": "android.intent.action.MY_PACKAGE_REPLACED",
              },
            },
          ],
        },
      ],
    });

    return modConfig;
  });
};

module.exports = withDisableNotificationsBootActions;
