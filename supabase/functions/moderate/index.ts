// Edge Function: rejects a voice or message, notifies the author, and closes related reports.

import { corsHeaders } from '../_shared/cors.ts';
import { requireAdmin } from '../_shared/admin.ts';
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts';
import { writeAuditLog } from '../_shared/auditLog.ts';
import { withSentry } from '../_shared/sentry.ts';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const VALID_TARGET_KINDS = new Set(['voice', 'message']);

function json(body: unknown, status: number, req: Request): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  });
}

Deno.serve(withSentry(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }

  if (req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405, req);
  }

  let adminCtx: Awaited<ReturnType<typeof requireAdmin>>;
  try {
    adminCtx = await requireAdmin(req);
  } catch (err) {
    if (err instanceof Response) return err;
    console.error('moderate: auth error', err);
    return json({ error: 'unauthorized' }, 401, req);
  }

  let rawBody: Record<string, unknown>;
  try {
    rawBody = await req.json() as Record<string, unknown>;
  } catch {
    return json({ error: 'invalid_body' }, 400, req);
  }

  const { target_kind, target_id, reason } = rawBody as {
    target_kind: unknown;
    target_id: unknown;
    reason: unknown;
  };

  if (typeof target_kind !== 'string' || !VALID_TARGET_KINDS.has(target_kind)) {
    return json({ error: 'target_kind_invalid' }, 400, req);
  }

  if (typeof target_id !== 'string' || !UUID_RE.test(target_id)) {
    return json({ error: 'target_id_invalid' }, 400, req);
  }

  if (typeof reason !== 'string' || reason.length === 0 || reason.length > 500) {
    return json({ error: 'reason_invalid' }, 400, req);
  }

  const table = target_kind === 'voice' ? 'voices' : 'messages';
  const authorColumn = target_kind === 'voice' ? 'user_id' : 'sender_id';

  const { data: target, error: fetchError } = await supabaseAdmin
    .from(table)
    .select(`id, status, ${authorColumn}`)
    .eq('id', target_id)
    .maybeSingle();

  if (fetchError) {
    console.error('moderate: fetch failed', { error: fetchError.message });
    return json({ error: 'internal_server_error' }, 500, req);
  }

  if (!target) {
    return json({ error: 'target_not_found' }, 404, req);
  }

  if (target.status === 'rejected') {
    return json({ ok: true, idempotent: true }, 200, req);
  }

  const { error: updateError } = await supabaseAdmin
    .from(table)
    .update({ status: 'rejected', moderation_reason: reason })
    .eq('id', target_id);

  if (updateError) {
    console.error('moderate: update target failed', { error: updateError.message });
    return json({ error: 'internal_server_error' }, 500, req);
  }

  const authorId: string = target[authorColumn];

  // Notify the author with a system notification
  const { error: notifError } = await supabaseAdmin.from('notifications').insert({
    user_id: authorId,
    kind: 'system',
    actor_id: null,
    payload: { reason, target_kind, target_id, action: 'rejected' },
  });

  if (notifError) {
    console.error('moderate: notification insert failed', { error: notifError.message });
  }

  // Close all pending reports targeting this content
  const reportFilter = target_kind === 'voice'
    ? `target_voice_id.eq.${target_id}`
    : `target_message_id.eq.${target_id}`;

  const { data: actionedReports, error: reportsError } = await supabaseAdmin
    .from('reports')
    .update({
      status: 'actioned',
      resolved_by: adminCtx.admin.id,
      resolved_at: new Date().toISOString(),
    })
    .eq('status', 'pending')
    .or(reportFilter)
    .select('id');

  if (reportsError) {
    console.error('moderate: reports update failed', { error: reportsError.message });
  }

  const reportsActioned = actionedReports?.length ?? 0;

  await writeAuditLog({
    actorId: adminCtx.admin.id,
    action: `${target_kind}.reject`,
    targetKind: target_kind as 'voice' | 'message',
    targetId: target_id,
    reason,
  });

  return json({ ok: true, target_id, reports_actioned: reportsActioned }, 200, req);
}));
