// Edge Function: confirms an upload, validates the storage object, and commits the DB row.

import { corsHeaders } from '../_shared/cors.ts';
import { requireAuth, getUserScopedClient } from '../_shared/auth.ts';
import { supabaseAdmin, checkStorageObject } from '../_shared/supabaseAdmin.ts';
import type {
  CommitVoiceUploadInput,
  CommitMessageUploadInput,
  CommitVoiceUploadResult,
  CommitMessageUploadResult,
  VoiceRow,
  MessageRow,
} from '../_shared/types.ts';

const MAX_DURATION_MS = 90_000;
const MAX_FILE_BYTES = 2_000_000;
// m4a files contain at least ftyp + moov boxes; anything below 100 bytes cannot be a
// valid audio file and would produce unplayable voice messages in the chat.
const MIN_FILE_BYTES = 100;
const MAX_TITLE_LENGTH = 60;
const VALID_THEMES = new Set(['sunset', 'chill', 'electric', 'midnight']);

// Matches the path format produced by request_upload: {uuid}/{uuid}.m4a
const OBJECT_PATH_RE = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.m4a$/;
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

  let user: { id: string }, jwt: string;
  try {
    ({ user, jwt } = await requireAuth(req));
  } catch (err) {
    if (err instanceof Response) return err;
    console.error('commit_upload: auth error', err);
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

  if (kind !== 'voice' && kind !== 'message') {
    return json({ error: 'kind_invalid' }, 400, req);
  }

  if (kind === 'voice') {
    return handleVoiceCommit(req, user, jwt, rawBody as unknown as CommitVoiceUploadInput);
  }

  // Phase 7 — wires through here
  return handleMessageCommit(req, user, jwt, rawBody as unknown as CommitMessageUploadInput);
});

async function handleVoiceCommit(
  req: Request,
  user: { id: string },
  jwt: string,
  body: CommitVoiceUploadInput,
): Promise<Response> {
  const { objectPath, durationMs, promptId, title, theme } = body;

  if (typeof objectPath !== 'string' || !OBJECT_PATH_RE.test(objectPath)) {
    return json({ error: 'path_invalid' }, 400, req);
  }

  // The first path segment must be the caller's own user_id — enforced server-side
  // because the storage policy alone does not prevent a confused-deputy attack on commit.
  const ownerSegment = objectPath.split('/')[0];
  if (ownerSegment !== user.id) {
    return json({ error: 'path_ownership_denied' }, 403, req);
  }

  if (!Number.isInteger(durationMs) || durationMs <= 0 || durationMs > MAX_DURATION_MS) {
    return json({ error: 'duration_invalid' }, 400, req);
  }

  if (title != null && title.trim().length > MAX_TITLE_LENGTH) {
    return json({ error: 'title_too_long' }, 400, req);
  }

  if (theme != null && !VALID_THEMES.has(theme)) {
    return json({ error: 'theme_invalid' }, 400, req);
  }

  const { exists, size } = await checkStorageObject('voices', objectPath);
  if (!exists) {
    return json({ error: 'object_not_found' }, 400, req);
  }
  if (size < MIN_FILE_BYTES) {
    return json({ error: 'file_too_small' }, 400, req);
  }
  if (size > MAX_FILE_BYTES) {
    return json({ error: 'file_too_large' }, 400, req);
  }

  // Use the user-scoped client so auth.uid() resolves correctly inside commit_voice_upload,
  // which relies on it for the is_active swap and ownership check.
  const userClient = getUserScopedClient(`Bearer ${jwt}`);

  const { data, error: rpcError } = await userClient.rpc('commit_voice_upload', {
    p_storage_path: objectPath,
    p_duration_ms: durationMs,
    p_prompt_id: promptId ?? null,
    p_title: title != null ? title.trim() : null,
    p_theme: theme ?? null,
  });

  if (rpcError || !data || (Array.isArray(data) && data.length === 0)) {
    console.error('commit_upload: RPC failed', { error: rpcError?.message });
    return json({ error: 'database_error' }, 500, req);
  }

  const voice = (Array.isArray(data) ? data[0] : data) as VoiceRow;

  // Phase 9 (~Q3 2026) will enqueue a moderation job here and flip the row default to 'pending'.

  const result: CommitVoiceUploadResult = { voice };
  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  });
}

// Phase 7 — wires through here
async function handleMessageCommit(
  req: Request,
  user: { id: string },
  jwt: string,
  body: CommitMessageUploadInput,
): Promise<Response> {
  const { objectPath, durationMs, conversationId } = body;

  if (typeof objectPath !== 'string' || !OBJECT_PATH_RE.test(objectPath)) {
    return json({ error: 'path_invalid' }, 400, req);
  }

  if (!isUUID(conversationId)) {
    return json({ error: 'conversation_id_invalid' }, 400, req);
  }

  // The first path segment for messages is the conversationId — verify user is a participant.
  const ownerSegment = objectPath.split('/')[0];
  if (ownerSegment !== conversationId) {
    return json({ error: 'path_invalid' }, 400, req);
  }

  if (!Number.isInteger(durationMs) || durationMs <= 0 || durationMs > MAX_DURATION_MS) {
    return json({ error: 'duration_invalid' }, 400, req);
  }

  const { data: conversation } = await supabaseAdmin
    .from('conversations')
    .select('id')
    .eq('id', conversationId)
    .or(`user_a.eq.${user.id},user_b.eq.${user.id}`)
    .maybeSingle();

  if (!conversation) {
    return json({ error: 'conversation_not_found' }, 403, req);
  }

  const { exists, size } = await checkStorageObject('messages', objectPath);
  if (!exists) {
    return json({ error: 'object_not_found' }, 400, req);
  }
  if (size < MIN_FILE_BYTES) {
    console.warn('commit_upload: message voice file too small', { objectPath, size });
    return json({ error: 'file_too_small' }, 400, req);
  }
  if (size > MAX_FILE_BYTES) {
    return json({ error: 'file_too_large' }, 400, req);
  }

  const userClient = getUserScopedClient(`Bearer ${jwt}`);

  const { data: msg, error: insertError } = await userClient
    .from('messages')
    .insert({
      conversation_id: conversationId,
      sender_id: user.id,
      kind: 'voice',
      voice_path: objectPath,
      voice_duration_ms: durationMs,
      body_text: null,
      status: 'approved',
    })
    .select()
    .single();

  if (insertError || !msg) {
    console.error('commit_upload: message insert failed', { error: insertError?.message });
    return json({ error: 'database_error' }, 500, req);
  }

  const result: CommitMessageUploadResult = { message: msg as MessageRow };
  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  });
}
