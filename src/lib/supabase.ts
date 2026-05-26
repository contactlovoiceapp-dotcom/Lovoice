// Creates the typed Supabase client used by the mobile app.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";

import type { Database } from "@/types/database";

type SupabaseExtra = {
  supabaseUrl?: string;
  supabasePublishableKey?: string;
};

type SupabaseConfig = {
  url: string;
  publishableKey: string;
};

type SupabaseConfigResult =
  | { ok: true; config: SupabaseConfig }
  | { ok: false; error: string };

const extra = Constants.expoConfig?.extra as SupabaseExtra | undefined;

// Android SecureStore has a 2048-byte limit per entry. Supabase session JSON
// (JWT + refresh token + user metadata) can exceed this limit. We split large
// values into chunks and reassemble them transparently.
const CHUNK_SIZE = 1900; // stay well under the 2048-byte Android limit

async function secureGet(key: string): Promise<string | null> {
  const countStr = await SecureStore.getItemAsync(`${key}_numchunks`);
  if (!countStr) {
    // No chunked value — try the legacy single-key path (migration safety).
    return SecureStore.getItemAsync(key);
  }
  const count = parseInt(countStr, 10);
  const chunks: string[] = [];
  for (let i = 0; i < count; i++) {
    const chunk = await SecureStore.getItemAsync(`${key}_chunk_${i}`);
    if (chunk === null) return null;
    chunks.push(chunk);
  }
  return chunks.join('');
}

async function secureSet(key: string, value: string): Promise<void> {
  // Remove any pre-existing chunked entries to avoid stale tails.
  await secureRemove(key);

  const chunks: string[] = [];
  for (let i = 0; i < value.length; i += CHUNK_SIZE) {
    chunks.push(value.slice(i, i + CHUNK_SIZE));
  }

  for (let i = 0; i < chunks.length; i++) {
    await SecureStore.setItemAsync(`${key}_chunk_${i}`, chunks[i]);
  }
  await SecureStore.setItemAsync(`${key}_numchunks`, String(chunks.length));
}

async function secureRemove(key: string): Promise<void> {
  const countStr = await SecureStore.getItemAsync(`${key}_numchunks`).catch(() => null);
  if (countStr) {
    const count = parseInt(countStr, 10);
    for (let i = 0; i < count; i++) {
      await SecureStore.deleteItemAsync(`${key}_chunk_${i}`).catch(() => null);
    }
    await SecureStore.deleteItemAsync(`${key}_numchunks`).catch(() => null);
  }
  // Also clean up legacy single-key entry if present.
  await SecureStore.deleteItemAsync(key).catch(() => null);
}

const secureSessionStorage = {
  getItem: secureGet,
  setItem: secureSet,
  removeItem: secureRemove,
};

let supabaseClient: SupabaseClient<Database> | null = null;

export function getSupabaseConfig(): SupabaseConfigResult {
  const supabaseUrl =
    process.env.EXPO_PUBLIC_SUPABASE_URL ?? extra?.supabaseUrl;
  const supabasePublishableKey =
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
    extra?.supabasePublishableKey;

  if (!supabaseUrl) {
    return {
      ok: false,
      error: "Missing EXPO_PUBLIC_SUPABASE_URL environment variable.",
    };
  }

  if (!supabasePublishableKey) {
    return {
      ok: false,
      error: "Missing EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY environment variable.",
    };
  }

  return {
    ok: true,
    config: {
      url: supabaseUrl,
      publishableKey: supabasePublishableKey,
    },
  };
}

export function getSupabaseClient(): SupabaseClient<Database> | null {
  if (supabaseClient) {
    return supabaseClient;
  }

  const configResult = getSupabaseConfig();

  if (!configResult.ok) {
    return null;
  }

  supabaseClient = createClient<Database>(
    configResult.config.url,
    configResult.config.publishableKey,
    {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: false,
        persistSession: true,
        storage: secureSessionStorage,
      },
      realtime: {
        params: {
          eventsPerSecond: 10,
        },
      },
    },
  );

  return supabaseClient;
}
