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

const secureSessionStorage = {
  async getItem(key: string): Promise<string | null> {
    return SecureStore.getItemAsync(key);
  },
  async setItem(key: string, value: string): Promise<void> {
    await SecureStore.setItemAsync(key, value);
  },
  async removeItem(key: string): Promise<void> {
    await SecureStore.deleteItemAsync(key);
  },
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
  },
  );

  return supabaseClient;
}
