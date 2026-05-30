// Edge Function: user-initiated GDPR account deletion (Apple 5.1.1(v)).
//
// Authenticated, no request body. The caller can only ever delete THEIR OWN account: the
// target id is taken from the verified JWT, never from input. Delegates the full hard-purge
// (voices/messages/likes/notifications/blocks/reports + Storage objects + auth.users) to the
// shared purgeAccount helper, which also anonymizes shared conversations onto the tombstone so
// the correspondent's messages survive. Idempotent.

import { corsHeaders } from '../_shared/cors.ts';
import { requireAuth } from '../_shared/auth.ts';
import { purgeAccount } from '../_shared/purgeAccount.ts';

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

  let user: { id: string };
  try {
    ({ user } = await requireAuth(req));
  } catch (err) {
    if (err instanceof Response) return err;
    console.error('delete_account: auth error', err);
    return json({ error: 'unauthorized' }, 401, req);
  }

  try {
    const result = await purgeAccount(user.id, {
      actorId: user.id,
      action: 'account.delete',
      reason: null,
    });
    return json({ ok: true, ...result }, 200, req);
  } catch (err) {
    console.error('delete_account: purge failed', { userId: user.id, error: (err as Error).message });
    return json({ error: 'internal_server_error' }, 500, req);
  }
});
