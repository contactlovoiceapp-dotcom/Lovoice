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
  version: "0.2.2",
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "light",
  newArchEnabled: true,
  runtimeVersion: {
    policy: "appVersion",
  },
  splash: {
    image: "./assets/splash-icon.png",
    resizeMode: "contain",
    backgroundColor: "#f8f5ff",
  },
  ios: {
    supportsTablet: false,
    bundleIdentifier: "com.shrtcut.lovoice",
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      // White background so the logo renders cleanly on any launcher shape
      backgroundColor: "#ffffff",
    },
    edgeToEdgeEnabled: true,
    package: "com.shrtcut.lovoice",
  },
  plugins: ["expo-font", "expo-router", "expo-secure-store"],
  extra: {
    supabaseUrl,
    supabasePublishableKey,
    eas: {
      projectId: "f85debe0-2c75-463d-8ef7-f29d03b51dbe",
    },
  },
};

export default config;
