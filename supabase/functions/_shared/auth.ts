// Provides JWT extraction and authenticated user helpers for Edge Functions.

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { supabaseAdmin } from './supabaseAdmin.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

export function extractJwt(req: Request): string | null {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  return authHeader.slice(7);
}

// Requires a valid JWT. Throws a 401 Response if missing or invalid.
// Callers must catch Response instances and return them directly.
export async function requireAuth(req: Request): Promise<{ user: { id: string; email?: string }, jwt: string }> {
  const jwt = extractJwt(req);
  if (!jwt) throw unauthorizedResponse();

  const { data: { user }, error } = await supabaseAdmin.auth.getUser(jwt);
  if (error || !user) throw unauthorizedResponse();

  return { user: { id: user.id, email: user.email }, jwt };
}

// Returns a Supabase client whose PostgREST calls run as the authenticated user,
// so auth.uid() resolves correctly inside SECURITY DEFINER functions and RLS policies.
export function getUserScopedClient(authHeader: string): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
}

function unauthorizedResponse(): Response {
  return new Response(JSON.stringify({ error: 'unauthorized' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  });
}
