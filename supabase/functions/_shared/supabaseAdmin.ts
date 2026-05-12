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

// Verifies a private object exists in Storage and returns its size — used to enforce the
// 6 MB upload cap before committing the DB row.
//
// We use storage.from(bucket).list(folder, { search: filename }) instead of a raw HEAD on
// /storage/v1/object/{bucket}/{path}: that REST route is unreliable for private buckets
// (HEAD frequently returns 404 even with the service role key). The list endpoint uses the
// metadata table directly and is the canonical way to introspect storage with an admin client.
export async function checkStorageObject(
  bucket: string,
  objectPath: string,
): Promise<{ exists: boolean; size: number }> {
  const lastSlash = objectPath.lastIndexOf('/');
  const folder = lastSlash === -1 ? '' : objectPath.slice(0, lastSlash);
  const filename = lastSlash === -1 ? objectPath : objectPath.slice(lastSlash + 1);

  const { data, error } = await supabaseAdmin.storage.from(bucket).list(folder, {
    limit: 1,
    search: filename,
  });

  if (error) {
    console.error('checkStorageObject: list failed', { bucket, folder, filename, error: error.message });
    return { exists: false, size: 0 };
  }

  const match = data?.find((entry) => entry.name === filename);
  if (!match) return { exists: false, size: 0 };

  // metadata.size is populated for files (not folders) and matches Content-Length on download.
  const size = typeof match.metadata?.size === 'number' ? match.metadata.size : 0;
  return { exists: true, size };
}
