// Edge Function: issues a signed upload URL so the client can PUT audio directly to Storage.

import { corsHeaders } from '../_shared/cors.ts';
import { requireAuth } from '../_shared/auth.ts';
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts';
import type { RequestUploadResult } from '../_shared/types.ts';

const MAX_DURATION_MS = 90_000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function isUUID(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

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
    console.error('request_upload: auth error', err);
    return json({ error: 'unauthorized' }, 401, req);
  }

  // Parse as a loose record to allow runtime validation before narrowing to typed values.
  let rawBody: Record<string, unknown>;
  try {
    rawBody = await req.json() as Record<string, unknown>;
  } catch {
    return json({ error: 'invalid_body' }, 400, req);
  }

  const kind = rawBody.kind;
  const durationMs = rawBody.durationMs;
  const conversationId = rawBody.conversationId;

  if (kind !== 'voice' && kind !== 'message') {
    return json({ error: 'kind_invalid' }, 400, req);
  }

  if (!Number.isInteger(durationMs) || (durationMs as number) <= 0 || (durationMs as number) > MAX_DURATION_MS) {
    return json({ error: 'duration_invalid' }, 400, req);
  }

  // Prevent banned users from uploading new content — checked server-side so the client
  // cannot bypass the ban by manipulating local state.
  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('is_banned')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError) {
    console.error('request_upload: profile lookup failed', { userId: user.id, error: profileError.message });
    return json({ error: 'internal_server_error' }, 500, req);
  }

  if (profile?.is_banned) {
    return json({ error: 'banned' }, 403, req);
  }

  let bucket: string;
  let objectPath: string;

  if (kind === 'voice') {
    bucket = 'voices';
    objectPath = `${user.id}/${crypto.randomUUID()}.m4a`;
  } else {
    if (!conversationId) {
      return json({ error: 'conversation_id_required' }, 400, req);
    }
    if (!isUUID(conversationId)) {
      return json({ error: 'conversation_id_invalid' }, 400, req);
    }

    // Verify the user is a participant before handing them a write URL for this conversation.
    const { data: conversation } = await supabaseAdmin
      .from('conversations')
      .select('id')
      .eq('id', conversationId)
      .or(`user_a.eq.${user.id},user_b.eq.${user.id}`)
      .maybeSingle();

    if (!conversation) {
      return json({ error: 'conversation_not_found' }, 403, req);
    }

    bucket = 'messages';
    objectPath = `${conversationId}/${crypto.randomUUID()}.m4a`;
  }

  const { data: uploadData, error: storageError } = await supabaseAdmin.storage
    .from(bucket)
    .createSignedUploadUrl(objectPath);

  if (storageError || !uploadData) {
    console.error('request_upload: signed URL creation failed', {
      bucket,
      error: storageError?.message,
    });
    return json({ error: 'storage_error' }, 500, req);
  }

  const result: RequestUploadResult = {
    objectPath,
    signedUrl: uploadData.signedUrl,
    token: uploadData.token,
  };

  return json(result, 200, req);
});
