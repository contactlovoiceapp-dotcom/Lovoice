// Dev/admin-only script — fully purges a user account (RGPD hard-delete, ARCHITECTURE §9)
// without needing to log in as that user. Mirrors the `delete_account` Edge Function path:
//   1. public.purge_account(uuid)  → hard-deletes the user's rows, anonymizes shared
//      conversations onto the tombstone (correspondent's messages survive), soft-deletes the
//      profile, and returns the Storage object paths.
//   2. removes those Storage objects from the `voices` / `messages` buckets,
//   3. deletes the auth.users row (cascades the profiles row; frees the phone number for re-signup).
//
// Uses the Secret key (service_role) — NEVER run in production or commit the key.
//
// Usage:
//   npx tsx scripts/delete-account.ts <user-uuid>
//   npx tsx scripts/delete-account.ts +33XXXXXXXXX
//
// Prerequisites: SUPABASE_SECRET_KEY in .env.local
//   Supabase Dashboard → Project Settings → API Keys → Secret keys → default

import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const TOMBSTONE_USER_ID = "deadface-0000-0000-0000-000000000000";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STORAGE_DELETE_BATCH = 100;

// ---------------------------------------------------------------------------
// Load .env.local
// ---------------------------------------------------------------------------
function loadEnvLocal(): void {
  const path = resolve(process.cwd(), ".env.local");
  if (!existsSync(path)) return;

  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const sep = line.indexOf("=");
    if (sep === -1) continue;
    const key = line.slice(0, sep).trim();
    const value = line.slice(sep + 1).trim();
    process.env[key] ??= value;
  }
}

loadEnvLocal();

// ---------------------------------------------------------------------------
// Validate inputs
// ---------------------------------------------------------------------------
const target = process.argv[2];

if (!target) {
  console.error("Usage: npx tsx scripts/delete-account.ts <user-uuid | +33XXXXXXXXX>");
  process.exit(1);
}

const isUuidInput = UUID_RE.test(target);
const isPhoneInput = /^\+\d{7,15}$/.test(target);

if (!isUuidInput && !isPhoneInput) {
  console.error(`Invalid target: "${target}". Provide a user uuid or an E.164 phone (e.g. +33612345678).`);
  process.exit(1);
}

if (target.toLowerCase() === TOMBSTONE_USER_ID) {
  console.error("Refusing to delete the tombstone sentinel user.");
  process.exit(1);
}

const supabaseUrl = process.env["EXPO_PUBLIC_SUPABASE_URL"];
const secretKey = process.env["SUPABASE_SECRET_KEY"];

if (!supabaseUrl) {
  console.error("Missing EXPO_PUBLIC_SUPABASE_URL in .env.local");
  process.exit(1);
}
if (!secretKey) {
  console.error(
    "Missing SUPABASE_SECRET_KEY in .env.local\n" +
      "Get it from: Supabase Dashboard → Project Settings → API Keys → Secret keys → default",
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Admin client — secret key maps to service_role (can execute purge_account)
// ---------------------------------------------------------------------------
const admin = createClient(supabaseUrl, secretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function resolveUserId(): Promise<string | null> {
  if (isUuidInput) return target.toLowerCase();

  // Phone → look up the auth user (Supabase stores phone without the leading '+').
  const normalizedPhone = target.replace(/^\+/, "");
  const { data, error } = await admin.auth.admin.listUsers();
  if (error) throw new Error(`Failed to list users: ${error.message}`);
  return data.users.find((u) => u.phone === normalizedPhone)?.id ?? null;
}

async function run(): Promise<void> {
  console.log(`\nPurging account: ${target}`);

  const userId = await resolveUserId();
  if (!userId) {
    console.log(`No account found for ${target}. Nothing to delete.`);
    return;
  }
  console.log(`Resolved user id: ${userId}`);

  // 1. DB purge (atomic) — returns the Storage paths to remove.
  const { data, error } = await admin.rpc("purge_account", { p_user_id: userId });
  if (error) throw new Error(`purge_account failed: ${error.message}`);

  const row = (Array.isArray(data) ? data[0] : data) as
    | { voice_paths?: string[] | null; message_paths?: string[] | null }
    | null;
  const voicePaths = (row?.voice_paths ?? []).filter((p): p is string => typeof p === "string" && p.length > 0);
  const messagePaths = (row?.message_paths ?? []).filter((p): p is string => typeof p === "string" && p.length > 0);
  console.log(`  ✓ DB purge done (voices: ${voicePaths.length}, message audio: ${messagePaths.length})`);

  // 2. Remove Storage objects (best-effort, batched).
  for (const [bucket, paths] of [["voices", voicePaths], ["messages", messagePaths]] as const) {
    for (const batch of chunk(paths, STORAGE_DELETE_BATCH)) {
      const { error: removeError } = await admin.storage.from(bucket).remove(batch);
      if (removeError) console.warn(`  ⚠ Could not remove ${batch.length} object(s) from ${bucket}: ${removeError.message}`);
    }
  }
  if (voicePaths.length + messagePaths.length > 0) console.log("  ✓ Storage objects removed");

  // 3. Delete the auth user (cascades the profile; frees the phone for re-signup).
  const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
  if (deleteError && !/not found|user_not_found/i.test(deleteError.message)) {
    throw new Error(`Failed to delete auth user: ${deleteError.message}`);
  }
  console.log("  ✓ Auth user deleted");

  console.log(`\nDone. Account ${userId} fully purged.\n`);
}

run().catch((err: unknown) => {
  console.error("\nError:", err instanceof Error ? err.message : err);
  process.exit(1);
});
