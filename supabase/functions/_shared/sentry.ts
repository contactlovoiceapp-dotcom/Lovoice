// Sentry helpers for Supabase Edge Functions: optional init, handler wrapper, and PII scrubbing.
// No-op when SENTRY_DSN is unset so local `deno test` and dev deploys without secrets still work.

import { corsHeaders } from './cors.ts';
import { scrubEdgeContext } from './scrubContext.ts';

export { scrubEdgeContext } from './scrubContext.ts';

let sentryInitPromise: Promise<void> | null = null;

function getDsn(): string | undefined {
  return Deno.env.get('SENTRY_DSN')?.trim() || undefined;
}

export function isSentryEnabled(): boolean {
  return Boolean(getDsn());
}

async function loadSentry(): Promise<typeof import('npm:@sentry/deno')> {
  return await import('npm:@sentry/deno');
}

/** Dynamic import keeps scrubEdgeContext unit tests from pulling @sentry/deno unless needed. */
async function ensureSentryInit(): Promise<void> {
  const dsn = getDsn();
  if (!dsn) return;
  if (!sentryInitPromise) {
    sentryInitPromise = loadSentry().then((Sentry) => {
      Sentry.init({
        dsn,
        tracesSampleRate: 0,
        environment: Deno.env.get('ENVIRONMENT') ?? 'production',
      });
    });
  }
  await sentryInitPromise;
}

/** Captures a handled server error (e.g. internal 500 after a failed RPC) with scrubbed context. */
export async function captureEdgeException(
  error: unknown,
  context?: Record<string, unknown>,
): Promise<void> {
  const dsn = getDsn();
  if (!dsn) return;

  await ensureSentryInit();
  const Sentry = await loadSentry();
  const err = error instanceof Error ? error : new Error(String(error));
  Sentry.captureException(err, {
    extra: context ? (scrubEdgeContext(context) as Record<string, unknown>) : undefined,
  });
  await Sentry.flush(2000);
}

/**
 * Wraps a Deno.serve handler: initialises Sentry when configured, captures uncaught
 * exceptions, flushes briefly, and returns a CORS-aware 500 JSON body.
 */
export function withSentry(
  handler: (req: Request) => Promise<Response>,
): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    try {
      return await handler(req);
    } catch (err) {
      console.error('edge: unhandled exception', err);
      if (getDsn()) {
        await ensureSentryInit();
        const Sentry = await loadSentry();
        Sentry.captureException(err, {
          extra: scrubEdgeContext({
            method: req.method,
            path: new URL(req.url).pathname,
          }) as Record<string, unknown>,
        });
        await Sentry.flush(2000);
      }
      return new Response(JSON.stringify({ error: 'internal_server_error' }), {
        status: 500,
        headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
      });
    }
  };
}
