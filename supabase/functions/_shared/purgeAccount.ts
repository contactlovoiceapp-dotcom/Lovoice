// Shared, reusable GDPR account-purge logic for the user-initiated `delete_account` and the
// admin-initiated `delete_account_admin` Edge Functions (ARCHITECTURE §9, Apple 5.1.1(v)).
//
// The DB side is done atomically by the SQL function public.purge_account(p_user_id), which
// returns the Storage object paths to remove. This module:
//   1. validates the target id and rejects the tombstone sentinel,
//   2. calls purge_account (hard-delete rows + anonymize conversations + soft-delete profile),
//   3. removes the returned Storage objects from the `voices` / `messages` buckets,
//   4. writes the audit_log row (action varies by caller),
//   5. hard-deletes the auth.users row (cascades the profiles row).
//
// It is idempotent: a re-run after a partial failure (e.g. the auth delete never completed)
// re-applies the no-op DB purge and treats an already-removed auth user as success.
//
// NOTE: the pure helpers below (validation + Storage-deletion planning) are deliberately kept
// free of any module-level import of the service-role client, so they can be unit-tested under
// `deno test` without the Edge runtime environment variables. The runtime client is imported
// lazily inside purgeAccount().

export const TOMBSTONE_USER_ID = 'deadface-0000-0000-0000-000000000000';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// Supabase Storage `.remove()` takes an array of paths; we cap each call to stay well within
// request limits when a heavy user has hundreds of objects.
const STORAGE_DELETE_BATCH = 100;

export type AuditAction = 'account.delete' | 'user.delete';

export interface StorageDeletion {
  bucket: 'voices' | 'messages';
  paths: string[];
}

export interface PurgeAuditOptions {
  actorId: string;
  action: AuditAction;
  reason?: string | null;
}

export interface PurgeResult {
  userId: string;
  voiceObjectsDeleted: number;
  messageObjectsDeleted: number;
  authUserDeleted: boolean;
  idempotent: boolean;
}

// ---------------------------------------------------------------------------
// Pure helpers — exported for unit testing
// ---------------------------------------------------------------------------

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

export function isTombstone(value: string): boolean {
  return value === TOMBSTONE_USER_ID;
}

// Removes null/undefined/blank entries and de-duplicates, preserving first-seen order.
// Defends against malformed storage_path / voice_path values before hitting Storage.
export function normalizeStoragePaths(paths: ReadonlyArray<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of paths) {
    if (typeof p !== 'string') continue;
    const trimmed = p.trim();
    if (trimmed.length === 0 || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

export function chunk<T>(items: ReadonlyArray<T>, size: number): T[][] {
  if (size <= 0) throw new Error('chunk: size must be a positive integer');
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

// Builds the batched Storage-deletion plan from the raw paths returned by purge_account.
// Empty buckets are omitted so the caller issues no useless `.remove([])` requests.
export function buildStorageDeletions(
  voicePaths: ReadonlyArray<string | null | undefined>,
  messagePaths: ReadonlyArray<string | null | undefined>,
  batchSize: number = STORAGE_DELETE_BATCH,
): StorageDeletion[] {
  const out: StorageDeletion[] = [];

  const voices = normalizeStoragePaths(voicePaths);
  for (const batch of chunk(voices, batchSize)) {
    out.push({ bucket: 'voices', paths: batch });
  }

  const messages = normalizeStoragePaths(messagePaths);
  for (const batch of chunk(messages, batchSize)) {
    out.push({ bucket: 'messages', paths: batch });
  }

  return out;
}

// ---------------------------------------------------------------------------
// Orchestrator — performs the actual purge (impure)
// ---------------------------------------------------------------------------

export async function purgeAccount(userId: string, audit: PurgeAuditOptions): Promise<PurgeResult> {
  if (!isUuid(userId)) {
    throw new Error('purgeAccount: userId must be a valid uuid');
  }
  if (isTombstone(userId)) {
    throw new Error('purgeAccount: refusing to purge the tombstone sentinel');
  }

  // Lazy imports keep the pure helpers above testable without the Edge runtime env.
  const { supabaseAdmin } = await import('./supabaseAdmin.ts');
  const { writeAuditLog } = await import('./auditLog.ts');

  // 1. Atomic DB purge. Returns the Storage paths to remove out-of-band.
  const { data, error } = await supabaseAdmin.rpc('purge_account', { p_user_id: userId });
  if (error) {
    console.error('purgeAccount: purge_account RPC failed', { userId, error: error.message });
    throw new Error(`purge_account RPC failed: ${error.message}`);
  }

  const row = (Array.isArray(data) ? data[0] : data) as
    | { voice_paths?: string[] | null; message_paths?: string[] | null }
    | null
    | undefined;

  const deletions = buildStorageDeletions(row?.voice_paths ?? [], row?.message_paths ?? []);

  // 2. Remove Storage objects. Best-effort: a failed batch is logged but never aborts the
  //    purge — the DB rows are already gone and orphaned objects are harmless and re-runnable.
  let voiceObjectsDeleted = 0;
  let messageObjectsDeleted = 0;
  for (const { bucket, paths } of deletions) {
    const { error: removeError } = await supabaseAdmin.storage.from(bucket).remove(paths);
    if (removeError) {
      console.error('purgeAccount: storage remove failed (non-blocking)', {
        userId,
        bucket,
        count: paths.length,
        error: removeError.message,
      });
      continue;
    }
    if (bucket === 'voices') voiceObjectsDeleted += paths.length;
    else messageObjectsDeleted += paths.length;
  }

  // 3. Audit BEFORE the auth delete so the record survives even if that step fails.
  //    No PII beyond the subject id is stored.
  await writeAuditLog({
    actorId: audit.actorId,
    action: audit.action,
    targetKind: 'profile',
    targetId: userId,
    reason: audit.reason ?? null,
  });

  // 4. Hard-delete the auth user (cascades the profiles row). An already-deleted user is
  //    treated as an idempotent success.
  let authUserDeleted = true;
  let idempotent = false;
  const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(userId);
  if (authError) {
    const message = authError.message?.toLowerCase() ?? '';
    const notFound = message.includes('not found') || message.includes('user_not_found');
    if (notFound) {
      authUserDeleted = false;
      idempotent = true;
    } else {
      console.error('purgeAccount: auth.admin.deleteUser failed', { userId, error: authError.message });
      throw new Error(`auth deleteUser failed: ${authError.message}`);
    }
  }

  return { userId, voiceObjectsDeleted, messageObjectsDeleted, authUserDeleted, idempotent };
}
