/* React Query hook for the paginated Discover feed backed by the get_feed RPC. */

import { useInfiniteQuery, type UseInfiniteQueryResult, type InfiniteData } from '@tanstack/react-query';

import { getSupabaseClient } from '@/lib/supabase';
import type { FeedFilters } from '../hooks/useFeedState';
import type { FeedItem, FeedItemRow, FeedItemTheme, FeedPage } from '../types';

const PAGE_SIZE = 20;
const KNOWN_THEMES = new Set<FeedItemTheme>(['sunset', 'chill', 'electric', 'midnight']);
const DEFAULT_THEME: FeedItemTheme = 'sunset';

export const feedQueryKeys = {
  all: ['feed'] as const,
  list: (filters: FeedFilters) => ['feed', 'list', filters] as const,
};

function normaliseTheme(value: string | null): FeedItemTheme {
  if (value && KNOWN_THEMES.has(value as FeedItemTheme)) {
    return value as FeedItemTheme;
  }
  return DEFAULT_THEME;
}

function rowToItem(row: FeedItemRow): FeedItem {
  return {
    voiceId: row.voice_id,
    storagePath: row.storage_path,
    durationMs: row.duration_ms,
    theme: normaliseTheme(row.theme),
    title: row.title,
    promptBody: row.prompt_body,
    createdAt: row.created_at,
    userId: row.user_id,
    displayName: row.display_name,
    birthdate: row.birthdate,
    city: row.city,
    bioEmojis: row.bio_emojis,
  };
}

async function fetchFeedPage(
  filters: FeedFilters,
  cursor: string | null,
): Promise<FeedPage> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error('feed.supabase_unavailable');
  }

  const { data, error } = await supabase.rpc('get_feed', {
    p_distance_m: filters.maxDistanceMeters,
    p_limit: PAGE_SIZE,
    p_cursor_created_at: cursor,
  });

  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []) as FeedItemRow[];
  const items = rows.map(rowToItem);
  // Cursor is the created_at of the last row; null when the page is short or empty.
  const nextCursor = items.length === PAGE_SIZE ? items[items.length - 1].createdAt : null;

  return { items, nextCursor };
}

export function useFeedItems(filters: FeedFilters): UseInfiniteQueryResult<InfiniteData<FeedPage>, Error> {
  return useInfiniteQuery<FeedPage, Error, InfiniteData<FeedPage>, ReturnType<typeof feedQueryKeys.list>, string | null>({
    queryKey: feedQueryKeys.list(filters),
    queryFn: ({ pageParam }) => fetchFeedPage(filters, pageParam),
    initialPageParam: null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    staleTime: 1000 * 30,
  });
}
