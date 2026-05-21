// Verifies the caller is in admin_users and returns the admin context; throws 401/403 on failure.

import { requireAuth } from './auth.ts';
import { supabaseAdmin } from './supabaseAdmin.ts';

export interface AdminContext {
  user: { id: string; email?: string };
  jwt: string;
  admin: { id: string; email: string; display_name: string };
}

export async function requireAdmin(req: Request): Promise<AdminContext> {
  const { user, jwt } = await requireAuth(req);

  const { data: adminRow, error } = await supabaseAdmin
    .from('admin_users')
    .select('id, email, display_name')
    .eq('id', user.id)
    .maybeSingle();

  if (error) {
    console.error('requireAdmin: admin_users lookup failed', { userId: user.id, error: error.message });
    throw new Response(JSON.stringify({ error: 'internal_server_error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!adminRow) {
    throw new Response(JSON.stringify({ error: 'not_admin' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Best-effort: update last_seen_at for activity tracking
  try {
    await supabaseAdmin
      .from('admin_users')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('id', adminRow.id);
  } catch (e) {
    console.error('requireAdmin: failed to update last_seen_at', e);
  }

  return {
    user,
    jwt,
    admin: { id: adminRow.id, email: adminRow.email, display_name: adminRow.display_name },
  };
}
