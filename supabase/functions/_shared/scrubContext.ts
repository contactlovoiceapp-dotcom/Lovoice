// PII/UUID redaction for Edge Function Sentry extras — no Sentry SDK dependency.

const UUID_RE =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

const SENSITIVE_KEYS = new Set([
  'email',
  'display_name',
  'push_token',
  'phone',
  'body_text',
  'free_text',
]);

function scrubString(value: string): string {
  return value.replace(UUID_RE, '[uuid]');
}

/** Redacts PII keys and UUIDs in nested context sent to Sentry extras. */
export function scrubEdgeContext(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;

  if (typeof obj === 'string') {
    return scrubString(obj);
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => scrubEdgeContext(item));
  }

  if (typeof obj !== 'object') {
    return obj;
  }

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.has(key)) {
      out[key] = '[redacted]';
      continue;
    }
    out[key] = scrubEdgeContext(value);
  }
  return out;
}
