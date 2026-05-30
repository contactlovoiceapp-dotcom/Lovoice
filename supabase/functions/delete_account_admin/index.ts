// Edge Function: admin-initiated GDPR account deletion.
//
// Phase 9: full hard-purge. Shares the exact same purge path as the user-initiated
// `delete_account` Edge Function (ARCHITECTURE §9) via the purgeAccount helper — voices,
// messages, likes, notifications, blocks, reports and the auth.users row are removed,
// shared conversations are anonymized onto the tombstone, and the action is written to
// audit_log. Differs from the user flow only in the caller (an admin) and the required
// `reason`, which is audited. Idempotent. Refuses to delete another admin.

import { corsHeaders } from '../_shared/cors.ts';
import { requireAdmin } from '../_shared/admin.ts';
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts';
import { purgeAccount, isUuid, isTombstone } from '../_shared/purgeAccount.ts';

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

  if (!isUuid(user_id)) {
    return json({ error: 'user_id_invalid' }, 400, req);
  }

  if (typeof reason !== 'string' || reason.length === 0 || reason.length > 500) {
    return json({ error: 'reason_invalid' }, 400, req);
  }

  if (isTombstone(user_id)) {
    return json({ error: 'cannot_delete_tombstone' }, 403, req);
  }

  // Safety guard: refuse to delete another admin.
  const { data: adminCheck } = await supabaseAdmin
    .from('admin_users')
    .select('id')
    .eq('id', user_id)
    .maybeSingle();

  if (adminCheck) {
    return json({ error: 'cannot_delete_admin' }, 403, req);
  }

  try {
    const result = await purgeAccount(user_id, {
      actorId: adminCtx.admin.id,
      action: 'user.delete',
      reason,
    });
    return json({ ok: true, ...result }, 200, req);
  } catch (err) {
    console.error('delete_account_admin: purge failed', { userId: user_id, error: (err as Error).message });
    return json({ error: 'internal_server_error' }, 500, req);
  }
});
