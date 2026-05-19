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
  version: "0.4.2",
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
