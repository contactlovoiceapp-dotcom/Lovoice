// Sentry bootstrap: initialises @sentry/react-native if EXPO_PUBLIC_SENTRY_DSN is set.
// Scrubs obvious PII from breadcrumbs and events while keeping Phase 8 audio-debug ids.

import * as Sentry from '@sentry/react-native';
import type { Breadcrumb, Event } from '@sentry/types';
import Constants from 'expo-constants';

let initialized = false;

const UUID_IN_STRING =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const EMAIL_IN_STRING =
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const POSTGREST_EQ_UUID =
  /\.eq\.[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

const SENSITIVE_DATA_KEYS = new Set([
  'body_text',
  'transcript',
  'push_token',
  'display_name',
  'phone',
  'email',
  'free_text',
]);

/** Breadcrumb data keys used for voice upload/playback correlation — keep UUID values. */
const AUDIO_DEBUG_DATA_KEYS = new Set([
  'conversationId',
  'messageId',
  'objectPath',
  'sourceUuid',
  'objectUuid',
]);

function scrubPlainString(value: string): string {
  return value
    .replace(UUID_IN_STRING, '[uuid]')
    .replace(EMAIL_IN_STRING, '[email]');
}

/** Scrubs UUIDs in PostgREST filter URLs and other request paths. */
export function scrubMobileRequestUrl(url: string | undefined): string | undefined {
  if (!url) return url;
  return url
    .replace(POSTGREST_EQ_UUID, '.eq.[uuid]')
    .replace(UUID_IN_STRING, '[uuid]')
    .replace(EMAIL_IN_STRING, '[email]');
}

function scrubDataValue(key: string, value: unknown): unknown {
  if (SENSITIVE_DATA_KEYS.has(key)) {
    return '[redacted]';
  }
  if (AUDIO_DEBUG_DATA_KEYS.has(key)) {
    return value;
  }
  if (typeof value === 'string') {
    return scrubPlainString(value);
  }
  if (Array.isArray(value)) {
    return value.map((item, index) =>
      scrubDataValue(String(index), item),
    );
  }
  if (value !== null && typeof value === 'object') {
    return scrubDataRecord(value as Record<string, unknown>);
  }
  return value;
}

export function scrubDataRecord(
  data: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!data) return data;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    out[key] = scrubDataValue(key, value);
  }
  return out;
}

/** Scrubs breadcrumb message and data; preserves audio-debug correlation fields. */
export function scrubMobileBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb {
  const next: Breadcrumb = { ...breadcrumb };
  if (typeof next.message === 'string') {
    next.message = scrubPlainString(next.message);
  }
  if (next.data) {
    next.data = scrubDataRecord(next.data as Record<string, unknown>);
  }
  return next;
}

function scrubExtras(extras: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(extras)) {
    if (SENSITIVE_DATA_KEYS.has(key)) {
      out[key] = '[redacted]';
      continue;
    }
    if (typeof value === 'string') {
      out[key] = scrubPlainString(value);
    } else if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      out[key] = scrubExtras(value as Record<string, unknown>);
    } else {
      out[key] = value;
    }
  }
  return out;
}

/** Scrubs user PII and request URLs on outbound error events. */
export function scrubMobileEvent(event: Event): Event {
  if (event.request?.url) {
    event.request = {
      ...event.request,
      url: scrubMobileRequestUrl(event.request.url),
    };
  }

  if (event.user) {
    const { email: _email, ip_address: _ip, username: _username, ...rest } = event.user;
    event.user = rest;
  }

  if (event.extra) {
    event.extra = scrubExtras(event.extra as Record<string, unknown>);
  }

  return event;
}

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
    release,
    sampleRate: 1.0,
    tracesSampleRate: 0,
    debug: false,
    enabled: !__DEV__,
    sendDefaultPii: false,
    beforeBreadcrumb(breadcrumb) {
      return scrubMobileBreadcrumb(breadcrumb);
    },
    beforeSend(event) {
      return scrubMobileEvent(event);
    },
  });

  initialized = true;
}

export { Sentry };
