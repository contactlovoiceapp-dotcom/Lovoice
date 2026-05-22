/* React Query hooks for reading likes: liked voice ids, received likes, and given likes. */

import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { getSupabaseClient } from '@/lib/supabase';
import type { LikedProfileSummary, ReceivedLike, GivenLike } from '../types';

export const likeQueryKeys = {
  all: ['likes'] as const,
  likedIds: (userId: string | null) => ['likes', 'liked-ids', userId] as const,
  received: ['likes', 'received'] as const,
  given: ['likes', 'given'] as const,
};

// Inline shape for the nested received-like row to avoid casting through `any`.
interface RawReceivedLikeRow {
  id: string;
  voice_id: string;
  created_at: string;
  liker: {
    id: string;
    display_name: string;
    birthdate: string;
    city: string;
    bio_emojis: string[];
  } | null;
}

// Inline shape for the doubly-nested given-like row.
interface RawGivenLikeRow {
  id: string;
  voice_id: string;
  created_at: string;
  voice: {
    user_id: string;
    author: {
      id: string;
      display_name: string;
      birthdate: string;
      city: string;
      bio_emojis: string[];
    } | null;
  } | null;
}

export function useLikedVoiceIds(userId: string | null): UseQueryResult<Set<string>, Error> {
  return useQuery<Set<string>, Error>({
    queryKey: likeQueryKeys.likedIds(userId),
    enabled: !!userId,
    staleTime: 1000 * 30,
    queryFn: async () => {
      const supabase = getSupabaseClient();
      if (!supabase) {
        throw new Error('likes.supabase_unavailable');
      }

      const { data, error } = await supabase
        .from('likes')
        .select('voice_id')
        .eq('liker_id', userId as string);

      if (error) {
        throw new Error(error.message);
      }

      return new Set((data ?? []).map((row) => row.voice_id));
    },
  });
}

export function useReceivedLikes(): UseQueryResult<ReceivedLike[], Error> {
  return useQuery<ReceivedLike[], Error>({
    queryKey: likeQueryKeys.received,
    staleTime: 1000 * 30,
    queryFn: async () => {
      const supabase = getSupabaseClient();
      if (!supabase) {
        throw new Error('likes.supabase_unavailable');
      }

      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) {
        throw new Error('likes.session_missing');
      }

      // RLS exposes both given and received likes; exclude rows where the
      // authenticated user is the liker so only genuinely received likes remain.
      const { data, error } = await supabase
        .from('likes')
        .select('id, voice_id, created_at, liker:profiles!likes_liker_id_fkey(id, display_name, birthdate, city, bio_emojis)')
        .neq('liker_id', uid)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) {
        throw new Error(error.message);
      }

      const rows = (data ?? []) as unknown as RawReceivedLikeRow[];

      return rows
        .filter((row) => row.liker !== null)
        .map((row): ReceivedLike => {
          const liker = row.liker as NonNullable<RawReceivedLikeRow['liker']>;
          return {
            likeId: row.id,
            voiceId: row.voice_id,
            createdAt: row.created_at,
            liker: {
              id: liker.id,
              displayName: liker.display_name,
              birthdate: liker.birthdate,
              city: liker.city,
              bioEmojis: liker.bio_emojis ?? [],
            } satisfies LikedProfileSummary,
          };
        });
    },
  });
}

export function useGivenLikes(): UseQueryResult<GivenLike[], Error> {
  return useQuery<GivenLike[], Error>({
    queryKey: likeQueryKeys.given,
    staleTime: 1000 * 30,
    queryFn: async () => {
      const supabase = getSupabaseClient();
      if (!supabase) {
        throw new Error('likes.supabase_unavailable');
      }

      const { data, error } = await supabase
        .from('likes')
        .select('id, voice_id, created_at, voice:voices!likes_voice_id_fkey(user_id, author:profiles!voices_user_id_fkey(id, display_name, birthdate, city, bio_emojis))')
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) {
        throw new Error(error.message);
      }

      const rows = (data ?? []) as unknown as RawGivenLikeRow[];

      return rows
        .filter((row) => row.voice !== null && row.voice.author !== null)
        .map((row): GivenLike => {
          const voice = row.voice as NonNullable<RawGivenLikeRow['voice']>;
          const author = voice.author as NonNullable<NonNullable<RawGivenLikeRow['voice']>['author']>;
          return {
            likeId: row.id,
            voiceId: row.voice_id,
            createdAt: row.created_at,
            author: {
              id: author.id,
              displayName: author.display_name,
              birthdate: author.birthdate,
              city: author.city,
              bioEmojis: author.bio_emojis ?? [],
            } satisfies LikedProfileSummary,
          };
        });
    },
  });
}
