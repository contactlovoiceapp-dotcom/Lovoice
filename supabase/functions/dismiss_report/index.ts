// Edge Function: marks a pending report as dismissed by an admin.

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
    console.error('dismiss_report: auth error', err);
    return json({ error: 'unauthorized' }, 401, req);
  }

  let rawBody: Record<string, unknown>;
  try {
    rawBody = await req.json() as Record<string, unknown>;
  } catch {
    return json({ error: 'invalid_body' }, 400, req);
  }

  const { report_id, reason } = rawBody as { report_id: unknown; reason: unknown };

  if (typeof report_id !== 'string' || !UUID_RE.test(report_id)) {
    return json({ error: 'report_id_invalid' }, 400, req);
  }

  if (reason !== undefined && reason !== null) {
    if (typeof reason !== 'string' || reason.length === 0 || reason.length > 500) {
      return json({ error: 'reason_invalid' }, 400, req);
    }
  }

  const { data: report, error: fetchError } = await supabaseAdmin
    .from('reports')
    .select('id, status')
    .eq('id', report_id)
    .maybeSingle();

  if (fetchError) {
    console.error('dismiss_report: fetch failed', { error: fetchError.message });
    return json({ error: 'internal_server_error' }, 500, req);
  }

  if (!report) {
    return json({ error: 'report_not_found' }, 404, req);
  }

  if (report.status !== 'pending') {
    return json({ ok: true, idempotent: true, status: report.status }, 200, req);
  }

  const { error: updateError } = await supabaseAdmin
    .from('reports')
    .update({
      status: 'dismissed',
      resolved_by: adminCtx.admin.id,
      resolved_at: new Date().toISOString(),
    })
    .eq('id', report_id);

  if (updateError) {
    console.error('dismiss_report: update failed', { error: updateError.message });
    return json({ error: 'internal_server_error' }, 500, req);
  }

  await writeAuditLog({
    actorId: adminCtx.admin.id,
    action: 'report.dismiss',
    targetKind: 'report',
    targetId: report_id,
    reason: (reason as string) ?? null,
  });

  return json({ ok: true, report_id }, 200, req);
}));
