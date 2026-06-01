// Edge Function: lifts a ban on a user by clearing the is_banned flag.

import { corsHeaders } from '../_shared/cors.ts';
import { requireAdmin } from '../_shared/admin.ts';
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts';
import { writeAuditLog } from '../_shared/auditLog.ts';
import { withSentry } from '../_shared/sentry.ts';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

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
    console.error('unban_user: auth error', err);
    return json({ error: 'unauthorized' }, 401, req);
  }

  let rawBody: Record<string, unknown>;
  try {
    rawBody = await req.json() as Record<string, unknown>;
  } catch {
    return json({ error: 'invalid_body' }, 400, req);
  }

  const { user_id } = rawBody as { user_id: unknown };

  if (typeof user_id !== 'string' || !UUID_RE.test(user_id)) {
    return json({ error: 'user_id_invalid' }, 400, req);
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('id, is_banned')
    .eq('id', user_id)
    .maybeSingle();

  if (profileError) {
    console.error('unban_user: profile lookup failed', { error: profileError.message });
    return json({ error: 'internal_server_error' }, 500, req);
  }

  if (!profile) {
    return json({ error: 'user_not_found' }, 404, req);
  }

  if (!profile.is_banned) {
    return json({ ok: true, idempotent: true }, 200, req);
  }

  const { error: updateError } = await supabaseAdmin
    .from('profiles')
    .update({ is_banned: false })
    .eq('id', user_id);

  if (updateError) {
    console.error('unban_user: update failed', { error: updateError.message });
    return json({ error: 'internal_server_error' }, 500, req);
  }

  await writeAuditLog({
    actorId: adminCtx.admin.id,
    action: 'user.unban',
    targetKind: 'profile',
    targetId: user_id,
    reason: null,
  });

  return json({ ok: true, user_id }, 200, req);
}));
