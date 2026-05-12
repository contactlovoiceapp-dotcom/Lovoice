// Provides a service-role Supabase client for operations that must bypass RLS.

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

function getEnvOrThrow(key: string): string {
  const value = Deno.env.get(key);
  if (!value) throw new Error(`Edge Function misconfiguration: missing required env var "${key}"`);
  return value;
}

const supabaseUrl = getEnvOrThrow('SUPABASE_URL');
const serviceRoleKey = getEnvOrThrow('SUPABASE_SERVICE_ROLE_KEY');

export const supabaseAdmin: SupabaseClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

// Makes a HEAD request to Supabase Storage using the service role key to verify
// a private object exists and retrieve its size — used to enforce the 6 MB upload cap.
export async function checkStorageObject(
  bucket: string,
  objectPath: string,
): Promise<{ exists: boolean; size: number }> {
  const url = `${supabaseUrl}/storage/v1/object/${bucket}/${objectPath}`;
  const res = await fetch(url, {
    method: 'HEAD',
    headers: { Authorization: `Bearer ${serviceRoleKey}` },
  });
  if (!res.ok) return { exists: false, size: 0 };
  const contentLength = res.headers.get('content-length');
  return { exists: true, size: contentLength ? parseInt(contentLength, 10) : 0 };
}
