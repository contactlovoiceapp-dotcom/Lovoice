// Best-effort write to audit_log for compliance and post-hoc debugging of admin actions.

import { supabaseAdmin } from './supabaseAdmin.ts';

export interface AuditLogEntry {
  actorId: string;
  action: string;
  targetKind: 'voice' | 'message' | 'profile' | 'report';
  targetId: string;
  reason?: string | null;
}

export async function writeAuditLog(entry: AuditLogEntry): Promise<void> {
  const { error } = await supabaseAdmin.from('audit_log').insert({
    actor_id: entry.actorId,
    action: entry.action,
    target_kind: entry.targetKind,
    target_id: entry.targetId,
    reason: entry.reason ?? null,
  });

  if (error) {
    console.error('writeAuditLog: insert failed', { entry, error: error.message });
  }
}
