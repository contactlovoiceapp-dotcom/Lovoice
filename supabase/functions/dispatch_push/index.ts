// Edge Function: dispatches push notifications to the Expo Push API after a
// notifications row is inserted. Called by the pg_net trigger, NOT by clients.

import { corsHeaders } from '../_shared/cors.ts';
import { withSentry } from '../_shared/sentry.ts';
// supabaseAdmin is imported lazily inside the handler (see below) so that the pure helpers
// exported by this module (buildExpoPushMessage / parseExpoPushResponse) can be unit-tested
// under `deno test` without the Edge runtime environment variables that supabaseAdmin requires.

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const PUSH_TIMEOUT_MS = 10_000;
const MESSAGE_PREVIEW_MAX_LENGTH = 60;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExpoPushMessage {
  to: string;
  sound: 'default';
  title: string;
  body: string;
  data: Record<string, string>;
  priority: 'high';
  channelId: 'default';
  // Authoritative OS badge total (unread messages + unseen likes). Omitted when the
  // count could not be computed, so we never reset a correct badge to a wrong value.
  badge?: number;
}

export interface BuildExpoPushMessageArgs {
  kind: 'like' | 'message';
  pushToken: string;
  actorDisplayName: string | null;
  notificationId: string;
  conversationId?: string;
  messageBodyText?: string | null;
  messageKind?: 'text' | 'voice';
  // Total unread/unseen count for the recipient, stamped on the push so the OS badge
  // updates even while the app is backgrounded or killed (no client JS runs then).
  badge?: number;
}

export interface ParsedExpoPushResponse {
  ok: boolean;
  deviceNotRegistered: boolean;
  errorCode?: string;
}

// ---------------------------------------------------------------------------
// Pure functions — exported for unit testing
// ---------------------------------------------------------------------------

export function buildExpoPushMessage(args: BuildExpoPushMessageArgs): ExpoPushMessage {
  const { kind, pushToken, actorDisplayName, notificationId, badge } = args;

  // Only attach badge when it was computed (>= 0); leaving it off keeps the OS badge
  // untouched rather than overwriting a correct value with a wrong one.
  const badgeField = typeof badge === 'number' && badge >= 0 ? { badge } : {};

  if (kind === 'like') {
    return {
      to: pushToken,
      sound: 'default',
      title: 'Nouveau like 💜',
      body: `${actorDisplayName ?? 'Quelqu\'un'} a liké ta voix`,
      data: { deep_link: '/likes', notification_id: notificationId, kind: 'like' },
      priority: 'high',
      channelId: 'default',
      ...badgeField,
    };
  }

  // kind === 'message'
  let preview: string;
  if (args.messageKind === 'voice') {
    preview = 'Message vocal';
  } else {
    const text = args.messageBodyText ?? '';
    preview = text.length > MESSAGE_PREVIEW_MAX_LENGTH
      ? text.slice(0, MESSAGE_PREVIEW_MAX_LENGTH) + '…'
      : text;
  }

  return {
    to: pushToken,
    sound: 'default',
    title: actorDisplayName ?? 'Nouveau message',
    body: preview,
    data: {
      deep_link: `/messages/${args.conversationId}`,
      notification_id: notificationId,
      kind: 'message',
    },
    priority: 'high',
    channelId: 'default',
    ...badgeField,
  };
}

export function parseExpoPushResponse(json: unknown): ParsedExpoPushResponse {
  if (!json || typeof json !== 'object') {
    return { ok: false, deviceNotRegistered: false, errorCode: 'invalid_response' };
  }

  const response = json as {
    data?: Array<{ status: string; details?: { error?: string }; message?: string }>;
  };
  const tickets = response.data;

  if (!Array.isArray(tickets) || tickets.length === 0) {
    return { ok: false, deviceNotRegistered: false, errorCode: 'empty_response' };
  }

  const ticket = tickets[0];
  if (ticket.status === 'ok') {
    return { ok: true, deviceNotRegistered: false };
  }

  const errorCode = ticket.details?.error;
  return {
    ok: false,
    deviceNotRegistered: errorCode === 'DeviceNotRegistered',
    errorCode: errorCode ?? 'unknown',
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function json(body: unknown, status: number, req: Request): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  });
}

// Decodes the JWT role claim without re-verifying the signature.
// The Supabase Edge Runtime validates the JWT signature before our code runs
// (visible as "invalid: null" in Edge Function request logs). We only need
// to confirm the decoded role is "service_role" to block non-internal callers.
function getJwtRole(token: string): string | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const decoded = JSON.parse(atob(payload)) as { role?: string };
    return decoded.role ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

Deno.serve(withSentry(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }

  if (req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405, req);
  }

  // Service-to-service auth: the DB trigger sends the service_role JWT as a
  // bearer token. Supabase Edge Runtime validates the signature; we check the
  // decoded role claim to block any non-service_role caller.
  const authHeader = req.headers.get('Authorization');
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!bearerToken || getJwtRole(bearerToken) !== 'service_role') {
    return json({ error: 'unauthorized' }, 401, req);
  }

  // --- Parse & validate body ---

  let body: Record<string, unknown>;
  try {
    body = await req.json() as Record<string, unknown>;
  } catch {
    return json({ error: 'invalid_body' }, 400, req);
  }

  const notificationId = body.notification_id;
  if (typeof notificationId !== 'string' || !UUID_RE.test(notificationId)) {
    return json({ error: 'notification_id_invalid' }, 400, req);
  }

  // Lazy import keeps the pure helpers above testable without the Edge runtime env.
  const { supabaseAdmin } = await import('../_shared/supabaseAdmin.ts');

  // --- Load notification ---

  const { data: notification, error: notifError } = await supabaseAdmin
    .from('notifications')
    .select('id, user_id, kind, actor_id, payload, pushed_at')
    .eq('id', notificationId)
    .maybeSingle();

  if (notifError) {
    console.error('dispatch_push: notification fetch failed', { error: notifError.message });
    return json({ ok: false, error: 'internal_error' }, 200, req);
  }

  // --- Skip cases (always 200) ---

  if (!notification) {
    return json({ ok: true, skipped: true, reason: 'notification_not_found' }, 200, req);
  }

  if (notification.kind === 'system') {
    return json({ ok: true, skipped: true, reason: 'system_kind' }, 200, req);
  }

  if (notification.pushed_at) {
    return json({ ok: true, skipped: true, reason: 'already_pushed' }, 200, req);
  }

  // --- Load recipient profile (for push_token) ---

  const { data: recipient } = await supabaseAdmin
    .from('profiles')
    .select('id, push_token, display_name')
    .eq('id', notification.user_id)
    .maybeSingle();

  const pushToken: string | null = recipient?.push_token ?? null;
  if (!pushToken) {
    return json({ ok: true, skipped: true, reason: 'no_push_token' }, 200, req);
  }

  // --- Load actor display name ---

  let actorDisplayName: string | null = null;
  if (notification.actor_id) {
    const { data: actor } = await supabaseAdmin
      .from('profiles')
      .select('display_name')
      .eq('id', notification.actor_id)
      .maybeSingle();
    actorDisplayName = actor?.display_name ?? null;
  }

  // --- Compute the authoritative OS badge total for the recipient ---
  // This is the only way to update the badge while the app is backgrounded/killed.
  // On failure we leave badge undefined so the push omits it (never overwrite a
  // correct badge with a wrong value).
  let badge: number | undefined;
  {
    const { data: badgeCount, error: badgeError } = await supabaseAdmin.rpc(
      'unread_badge_count',
      { p_user: notification.user_id },
    );
    if (badgeError) {
      console.error('dispatch_push: badge count failed', { error: badgeError.message });
    } else if (typeof badgeCount === 'number') {
      badge = badgeCount;
    }
  }

  // --- Build the Expo push message ---

  const notifKind = notification.kind as 'like' | 'message';
  const payload = (notification.payload ?? {}) as Record<string, unknown>;

  const messageArgs: BuildExpoPushMessageArgs = {
    kind: notifKind,
    pushToken,
    actorDisplayName,
    notificationId,
    badge,
  };

  if (notifKind === 'message') {
    messageArgs.conversationId = payload.conversation_id as string;
    messageArgs.messageKind = payload.kind as 'text' | 'voice';

    if (payload.kind === 'text' && payload.message_id) {
      const { data: msg } = await supabaseAdmin
        .from('messages')
        .select('body_text')
        .eq('id', payload.message_id as string)
        .maybeSingle();
      messageArgs.messageBodyText = msg?.body_text ?? null;
    }
  }

  const expoMessage = buildExpoPushMessage(messageArgs);

  console.log('dispatch_push: sending push', {
    notification_id: notificationId,
    kind: notifKind,
    body_length: expoMessage.body.length,
  });

  // --- POST to Expo Push API ---

  const expoHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };

  const expoAccessToken = Deno.env.get('EXPO_ACCESS_TOKEN');
  if (expoAccessToken) {
    expoHeaders['Authorization'] = `Bearer ${expoAccessToken}`;
  }

  let expoResponseJson: unknown;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PUSH_TIMEOUT_MS);

    const expoResponse = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: expoHeaders,
      body: JSON.stringify([expoMessage]),
      signal: controller.signal,
    });

    clearTimeout(timeout);
    expoResponseJson = await expoResponse.json();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('dispatch_push: expo push fetch failed', { error: message });
    return json({ ok: false, error: 'expo_push_failed' }, 200, req);
  }

  // --- Parse Expo response ---

  const parsed = parseExpoPushResponse(expoResponseJson);

  if (parsed.deviceNotRegistered) {
    const { error: clearError } = await supabaseAdmin
      .from('profiles')
      .update({ push_token: null })
      .eq('id', notification.user_id);

    if (clearError) {
      console.error('dispatch_push: failed to clear stale push_token', {
        error: clearError.message,
      });
    }

    console.error('dispatch_push: DeviceNotRegistered — cleared push_token', {
      recipient_id: notification.user_id,
    });
    return json({ ok: false, error: 'device_not_registered' }, 200, req);
  }

  if (!parsed.ok) {
    console.error('dispatch_push: expo push error', { errorCode: parsed.errorCode });
    return json({ ok: false, error: `expo_error_${parsed.errorCode}` }, 200, req);
  }

  // --- Mark notification as pushed ---

  const { error: updateError } = await supabaseAdmin
    .from('notifications')
    .update({ pushed_at: new Date().toISOString() })
    .eq('id', notificationId);

  if (updateError) {
    console.error('dispatch_push: pushed_at update failed', { error: updateError.message });
  }

  return json({ ok: true }, 200, req);
}));
