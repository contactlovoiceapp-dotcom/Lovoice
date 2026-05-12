/* React Query hooks for reading the user's voice and resolving signed playback URLs. */

import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { getSupabaseClient } from '@/lib/supabase';
import type { VoiceRow } from '../types';

const SIGNED_URL_TTL_SECONDS = 60 * 60;
const SIGNED_URL_REFRESH_BUFFER_SECONDS = 60;

export const voiceQueryKeys = {
  all: ['voices'] as const,
  active: (userId: string) => ['voices', 'active', userId] as const,
  signedUrl: (storagePath: string) => ['voices', 'signed-url', storagePath] as const,
};

async function fetchActiveVoice(userId: string): Promise<VoiceRow | null> {
  const supabase = getSupabaseClient();

  if (!supabase) {
    throw new Error('voice.supabase_unavailable');
  }

  const { data, error } = await supabase
    .from('voices')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export function useActiveVoice(userId: string | null | undefined): UseQueryResult<VoiceRow | null> {
  return useQuery({
    queryKey: userId ? voiceQueryKeys.active(userId) : ['voices', 'active', 'anonymous'],
    queryFn: () => {
      if (!userId) {
        return null;
      }
      return fetchActiveVoice(userId);
    },
    enabled: !!userId,
    staleTime: 1000 * 60 * 5,
  });
}

async function fetchSignedUrl(storagePath: string): Promise<string> {
  const supabase = getSupabaseClient();

  if (!supabase) {
    throw new Error('voice.supabase_unavailable');
  }

  const { data, error } = await supabase.storage
    .from('voices')
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);

  if (error || !data?.signedUrl) {
    throw new Error(error?.message ?? 'voice.signed_url_failed');
  }

  return data.signedUrl;
}

// Refresh shortly before expiry so the player never receives a stale URL mid-listen.
export function useVoiceSignedUrl(storagePath: string | null | undefined): UseQueryResult<string> {
  return useQuery({
    queryKey: storagePath ? voiceQueryKeys.signedUrl(storagePath) : ['voices', 'signed-url', 'none'],
    queryFn: () => {
      if (!storagePath) {
        throw new Error('voice.no_storage_path');
      }
      return fetchSignedUrl(storagePath);
    },
    enabled: !!storagePath,
    staleTime: (SIGNED_URL_TTL_SECONDS - SIGNED_URL_REFRESH_BUFFER_SECONDS) * 1000,
    gcTime: SIGNED_URL_TTL_SECONDS * 1000,
  });
}
