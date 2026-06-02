// Configures Expo and exposes public runtime environment values to the app.
import type { ExpoConfig } from "expo/config";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabasePublishableKey =
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

const config: ExpoConfig = {
  name: "Lovoice",
  slug: "lovoice",
  scheme: "lovoice",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "light",
  newArchEnabled: true,
  updates: {
    url: "https://u.expo.dev/f85debe0-2c75-463d-8ef7-f29d03b51dbe",
  },
  runtimeVersion: {
    policy: "appVersion",
  },
  splash: {
    image: "./assets/splash-logo.png",
    resizeMode: "contain",
    backgroundColor: "#f8f5ff",
  },
  ios: {
    supportsTablet: false,
    bundleIdentifier: "com.shrtcut.lovoice",
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      // Defensive explicit declaration; expo-audio plugin also sets this
      NSMicrophoneUsageDescription:
        "Lovoice utilise ton micro pour enregistrer ta voix.",
    },
  },
  android: {
    googleServicesFile: "./google-services.json",
    splash: {
      image: "./assets/splash-logo.png",
      resizeMode: "contain",
      backgroundColor: "#f8f5ff",
    },
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      // White background so the logo renders cleanly on any launcher shape
      backgroundColor: "#ffffff",
    },
    edgeToEdgeEnabled: true,
    package: "com.shrtcut.lovoice",
    // Defensive explicit declaration; expo-audio plugin also adds RECORD_AUDIO
    permissions: ["RECORD_AUDIO"],
  },
  plugins: [
    "expo-asset",
    "expo-font",
    "expo-router",
    "expo-secure-store",
    [
      "expo-splash-screen",
      {
        image: "./assets/splash-logo.png",
        imageWidth: 180,
        resizeMode: "contain",
        backgroundColor: "#f8f5ff",
      },
    ],
    "expo-updates",
    [
      "expo-audio",
      {
        microphonePermission:
          "Lovoice utilise ton micro pour enregistrer ta voix.",
      },
    ],
    [
      "expo-notifications",
      {
        // Monochrome (white-on-transparent) 96×96 lips glyph; Android tints it solid
        // white in the status bar, so a flat silhouette reads better than the wordmark.
        icon: "./assets/notification-icon.png",
        color: "#e724ab",
        defaultChannel: "default",
      },
    ],
    [
      "@sentry/react-native",
      {
        // Used by the plugin at build time to write sentry.properties so the
        // Sentry Gradle/Xcode build phase can upload source maps and debug
        // symbols automatically. The auth token is read from the
        // SENTRY_AUTH_TOKEN environment variable (EAS Secret) — never hardcoded.
        organization: "shrtcut",
        project: "lovoice",
      },
    ],
  ],
  extra: {
    supabaseUrl,
    supabasePublishableKey,
    eas: {
      projectId: "f85debe0-2c75-463d-8ef7-f29d03b51dbe",
    },
  },
};

export default config;
