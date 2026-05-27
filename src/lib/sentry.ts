// Sentry bootstrap: initialises @sentry/react-native if EXPO_PUBLIC_SENTRY_DSN is set.
// No-op when the DSN is missing so local/dev builds without a project still run cleanly.
//
// Kept intentionally minimal — we need JS error + native crash capture to diagnose
// production issues (see docs/CHAT_AUDIO.md). No tracing, no breadcrumbs customisation,
// no React Navigation integration. Those can come later if needed.

import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';

let initialized = false;

export function initSentry(): void {
  if (initialized) return;

  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;

  if (!dsn) {
    if (!__DEV__) {
      console.warn('[sentry] EXPO_PUBLIC_SENTRY_DSN is missing — Sentry disabled.');
    }
    return;
  }

  const release = Constants.expoConfig?.version ?? 'unknown';

  Sentry.init({
    dsn,
    enableNative: true,
    enableNativeCrashHandling: true,
    enableAutoSessionTracking: true,
    release,
    // Sample errors at 100%; we'll add throttling later if volume grows.
    sampleRate: 1.0,
    // No performance tracing yet — keeps the SDK lightweight.
    tracesSampleRate: 0,
    // Dev builds: keep events local-only (Sentry SDK already disables uploads in dev,
    // but we mirror that to avoid surprises if the dev flag changes.)
    debug: false,
    enabled: !__DEV__,
  });

  initialized = true;
}

export { Sentry };
