// Edge Function: admin-initiated soft-delete of a user account (ban + deleted_at + session revoke).
//
// V1 MVP: soft-delete (deleted_at + is_banned + session revoke). The full hard-purge
// of voices/storage/messages/likes/notifications/blocks/reports/auth.users lives in
// Phase 10's user-initiated delete_account Edge Function.
// TODO(phase-10): swap the body for a call to the shared hard-purge helper.

import { corsHeaders } from '../_shared/cors.ts';
import { requireAdmin } from '../_shared/admin.ts';
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts';
import { writeAuditLog } from '../_shared/auditLog.ts';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function json(body: unknown, status: number, req: Request): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request): Promise<Response> => {
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
    console.error('delete_account_admin: auth error', err);
    return json({ error: 'unauthorized' }, 401, req);
  }

  let rawBody: Record<string, unknown>;
  try {
    rawBody = await req.json() as Record<string, unknown>;
  } catch {
    return json({ error: 'invalid_body' }, 400, req);
  }

  const { user_id, reason } = rawBody as { user_id: unknown; reason: unknown };

  if (typeof user_id !== 'string' || !UUID_RE.test(user_id)) {
    return json({ error: 'user_id_invalid' }, 400, req);
  }

  if (typeof reason !== 'string' || reason.length === 0 || reason.length > 500) {
    return json({ error: 'reason_invalid' }, 400, req);
  }

  // Safety guard: refuse to delete another admin
  const { data: adminCheck } = await supabaseAdmin
    .from('admin_users')
    .select('id')
    .eq('id', user_id)
    .maybeSingle();

  if (adminCheck) {
    return json({ error: 'cannot_delete_admin' }, 403, req);
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('id, is_banned, deleted_at')
    .eq('id', user_id)
    .maybeSingle();

  if (profileError) {
    console.error('delete_account_admin: profile lookup failed', { error: profileError.message });
    return json({ error: 'internal_server_error' }, 500, req);
  }

  if (!profile) {
    return json({ error: 'user_not_found' }, 404, req);
  }

  if (profile.deleted_at !== null && profile.is_banned) {
    return json({ ok: true, idempotent: true }, 200, req);
  }

  const { error: updateError } = await supabaseAdmin
    .from('profiles')
    .update({ is_banned: true, deleted_at: new Date().toISOString() })
    .eq('id', user_id);

  if (updateError) {
    console.error('delete_account_admin: update failed', { error: updateError.message });
    return json({ error: 'internal_server_error' }, 500, req);
  }

  // Best-effort session revocation
  try {
    await supabaseAdmin.auth.admin.signOut(user_id, 'global');
  } catch (e) {
    console.error('delete_account_admin: signOut failed (non-blocking)', e);
  }

  await writeAuditLog({
    actorId: adminCtx.admin.id,
    action: 'user.delete',
    targetKind: 'profile',
    targetId: user_id,
    reason: reason as string,
  });

  return json({ ok: true, user_id, hard_purge: false }, 200, req);
});
