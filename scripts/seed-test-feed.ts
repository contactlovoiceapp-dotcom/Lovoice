// Dev-only script — seeds 8 test profiles + voices for the Discover feed end-to-end.
// All voices point to the same storage_path (cloned from your latest active voice),
// so audio plays for every test profile without uploading 8 distinct files.
// Idempotent: re-running keeps existing test users untouched.
// Use `--clean` to remove every test row created by this script.
//
// Usage:
//   npx tsx scripts/seed-test-feed.ts          # create or top-up the 8 test profiles
//   npx tsx scripts/seed-test-feed.ts --clean  # remove every test profile + voice + auth user
//
// Prerequisites:
//   1. SUPABASE_SECRET_KEY in .env.local (Dashboard → Settings → API Keys → Secret).
//   2. At least one approved + is_active voice in the DB to clone its storage_path
//      from. Record one from your own dev account before running this script.

import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// ---------------------------------------------------------------------------
// .env.local loader (same pattern as reset-dev-account.ts)
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
// Inputs / clients
// ---------------------------------------------------------------------------
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

const admin = createClient(supabaseUrl, secretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ---------------------------------------------------------------------------
// Test data set
// Phones share the +330999000 prefix to make `--clean` deterministic.
// Profiles cover all gender/looking_for combinations so every user preference
// surfaces at least a few matches in the feed.
// ---------------------------------------------------------------------------
const TEST_PHONE_PREFIX = "+33099900";

type Gender = "male" | "female" | "nonbinary" | "other";
type Theme = "sunset" | "chill" | "electric" | "midnight";

interface SeedProfile {
  phone: string;
  display_name: string;
  birthdate: string;
  gender: Gender;
  looking_for: Gender[];
  city: string;
  longitude: number;
  latitude: number;
  bio_emojis: string[];
  voice_theme: Theme;
  voice_title: string | null;
}

const SEED_PROFILES: SeedProfile[] = [
  { phone: `${TEST_PHONE_PREFIX}001`, display_name: "Camille", birthdate: "1995-03-12", gender: "female",    looking_for: ["male"],                    city: "Paris",      longitude:  2.3522, latitude: 48.8566, bio_emojis: ["🎨", "☕", "📚"],   voice_theme: "sunset",   voice_title: "Du soleil dans la voix" },
  { phone: `${TEST_PHONE_PREFIX}002`, display_name: "Thomas",  birthdate: "1990-07-22", gender: "male",      looking_for: ["female"],                  city: "Lyon",       longitude:  4.8357, latitude: 45.7640, bio_emojis: ["🚴", "🍷"],         voice_theme: "electric", voice_title: "Sport et vins nature" },
  { phone: `${TEST_PHONE_PREFIX}003`, display_name: "Sasha",   birthdate: "1998-11-04", gender: "nonbinary", looking_for: ["female", "nonbinary"],     city: "Marseille",  longitude:  5.3698, latitude: 43.2965, bio_emojis: ["🌊", "🎭"],         voice_theme: "chill",    voice_title: "Salty soul" },
  { phone: `${TEST_PHONE_PREFIX}004`, display_name: "Léa",     birthdate: "1992-05-18", gender: "female",    looking_for: ["female", "nonbinary"],     city: "Bordeaux",   longitude: -0.5792, latitude: 44.8378, bio_emojis: ["🎷", "🧑‍🍳"],       voice_theme: "midnight", voice_title: "Jazz et basilic" },
  { phone: `${TEST_PHONE_PREFIX}005`, display_name: "Mathieu", birthdate: "1985-09-30", gender: "male",      looking_for: ["male", "female"],          city: "Toulouse",   longitude:  1.4442, latitude: 43.6047, bio_emojis: ["📷", "🌿"],         voice_theme: "sunset",   voice_title: null },
  { phone: `${TEST_PHONE_PREFIX}006`, display_name: "Inès",    birthdate: "2000-01-25", gender: "female",    looking_for: ["male"],                    city: "Lille",      longitude:  3.0573, latitude: 50.6292, bio_emojis: ["🪩"],               voice_theme: "electric", voice_title: "Disco brain" },
  { phone: `${TEST_PHONE_PREFIX}007`, display_name: "Yanis",   birthdate: "1994-08-14", gender: "male",      looking_for: ["female", "nonbinary"],     city: "Nantes",     longitude: -1.5536, latitude: 47.2184, bio_emojis: ["⛵", "🌳"],         voice_theme: "chill",    voice_title: "Voile et calme" },
  { phone: `${TEST_PHONE_PREFIX}008`, display_name: "Élodie",  birthdate: "1988-12-02", gender: "female",    looking_for: ["male", "nonbinary"],       city: "Strasbourg", longitude:  7.7521, latitude: 48.5734, bio_emojis: ["📚", "🎻", "🍵"],   voice_theme: "midnight", voice_title: "Carnet de notes" },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function normalizedPhone(phone: string): string {
  return phone.replace(/^\+/, "");
}

async function findReusableStoragePath(): Promise<string> {
  const { data, error } = await admin
    .from("voices")
    .select("storage_path")
    .eq("is_active", true)
    .eq("status", "approved")
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) {
    throw new Error(`Failed to query voices: ${error.message}`);
  }
  if (!data || data.length === 0) {
    throw new Error(
      "No approved+active voice found in the DB. Record one from your own dev account first.",
    );
  }
  return data[0].storage_path;
}

async function findRandomPromptId(): Promise<string | null> {
  const { data, error } = await admin.from("prompts").select("id").limit(20);
  if (error || !data || data.length === 0) return null;
  return data[Math.floor(Math.random() * data.length)].id;
}

async function findUserByPhone(phone: string): Promise<{ id: string } | null> {
  // listUsers is paginated; the test phone prefix is unique enough to fit page 1.
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw new Error(`listUsers failed: ${error.message}`);
  const target = normalizedPhone(phone);
  return data.users.find((u) => u.phone === target) ?? null;
}

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------
async function seedOne(seed: SeedProfile, storagePath: string): Promise<void> {
  let userId: string;
  const existing = await findUserByPhone(seed.phone);

  if (existing) {
    console.log(`↺ ${seed.display_name} (${seed.phone}) already exists`);
    userId = existing.id;
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      phone: seed.phone,
      phone_confirm: true,
    });
    if (error || !data.user) {
      throw new Error(`createUser failed for ${seed.phone}: ${error?.message ?? "no user returned"}`);
    }
    userId = data.user.id;
    console.log(`+ ${seed.display_name} (${seed.phone}) created → ${userId}`);
  }

  // Upsert profile. EWKT format works with PostGIS geography casts directly.
  const { error: profErr } = await admin
    .from("profiles")
    .upsert(
      {
        id: userId,
        display_name: seed.display_name,
        birthdate: seed.birthdate,
        gender: seed.gender,
        looking_for: seed.looking_for,
        city: seed.city,
        location: `SRID=4326;POINT(${seed.longitude} ${seed.latitude})`,
        country: "FR",
        bio_emojis: seed.bio_emojis,
      },
      { onConflict: "id" },
    );
  if (profErr) {
    throw new Error(`profile upsert failed for ${seed.display_name}: ${profErr.message}`);
  }

  // Skip voice insertion if the user already has an active one.
  const { data: existingVoice, error: existingVoiceErr } = await admin
    .from("voices")
    .select("id")
    .eq("user_id", userId)
    .eq("is_active", true)
    .limit(1);
  if (existingVoiceErr) {
    throw new Error(`existing voice lookup failed for ${seed.display_name}: ${existingVoiceErr.message}`);
  }
  if (existingVoice && existingVoice.length > 0) {
    console.log(`  ↺ active voice already present, skipping insert`);
    return;
  }

  const promptId = await findRandomPromptId();
  const { error: voiceErr } = await admin.from("voices").insert({
    user_id: userId,
    prompt_id: promptId,
    storage_path: storagePath,
    duration_ms: 30000,
    theme: seed.voice_theme,
    title: seed.voice_title,
    status: "approved",
    is_active: true,
  });
  if (voiceErr) {
    throw new Error(`voice insert failed for ${seed.display_name}: ${voiceErr.message}`);
  }
  console.log(`  + voice (${seed.voice_theme}) inserted, pointing to ${storagePath}`);
}

async function runSeed(): Promise<void> {
  console.log("\nSeeding Discover test data...\n");
  const storagePath = await findReusableStoragePath();
  console.log(`Reusing storage_path: ${storagePath}\n`);

  for (const seed of SEED_PROFILES) {
    try {
      await seedOne(seed, storagePath);
    } catch (err) {
      console.error(`  ✗ ${seed.display_name}: ${err instanceof Error ? err.message : err}`);
    }
  }
  console.log("\nDone.\n");
}

// ---------------------------------------------------------------------------
// Clean
// ---------------------------------------------------------------------------
async function runClean(): Promise<void> {
  console.log("\nCleaning Discover test data...\n");
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) {
    throw new Error(`listUsers failed: ${error.message}`);
  }

  const targets = data.users.filter((u) =>
    u.phone && u.phone.startsWith(normalizedPhone(TEST_PHONE_PREFIX)),
  );
  if (targets.length === 0) {
    console.log("No test profiles to clean.\n");
    return;
  }

  for (const user of targets) {
    // Delete the profile row first; voices cascade via FK (ON DELETE CASCADE).
    const { error: profErr } = await admin.from("profiles").delete().eq("id", user.id);
    if (profErr) {
      console.warn(`  ⚠ profile delete failed for +${user.phone}: ${profErr.message}`);
    }

    const { error: deleteErr } = await admin.auth.admin.deleteUser(user.id);
    if (deleteErr) {
      console.warn(`  ⚠ auth delete failed for +${user.phone}: ${deleteErr.message}`);
      continue;
    }
    console.log(`- +${user.phone} removed`);
  }
  console.log(`\nCleaned ${targets.length} test user(s).\n`);
}

// ---------------------------------------------------------------------------
// Entrypoint
// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  const arg = process.argv[2];
  if (arg === "--clean") {
    await runClean();
  } else if (!arg) {
    await runSeed();
  } else {
    console.error(`Unknown flag: ${arg}\nUsage: npx tsx scripts/seed-test-feed.ts [--clean]`);
    process.exit(1);
  }
}

main().catch((err: unknown) => {
  console.error("\nError:", err instanceof Error ? err.message : err);
  process.exit(1);
});
