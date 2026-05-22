/* Tracks the last time the user opened the Likes tab to compute unseen received likes count.
   Persists via expo-secure-store so the badge survives app restarts. */

import { useEffect } from 'react';
import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

import { useReceivedLikes } from '../api/likeQueries';

const STORAGE_KEY = 'likes_last_seen_at';

interface LikesSeenState {
  lastSeenAt: string | null;
  hydrated: boolean;
  hydrate: () => void;
  markSeen: () => void;
}

const useLikesSeenStore = create<LikesSeenState>((set) => ({
  lastSeenAt: null,
  hydrated: false,

  hydrate: () => {
    SecureStore.getItemAsync(STORAGE_KEY).then((value) => {
      set({ lastSeenAt: value, hydrated: true });
    }).catch(() => {
      set({ hydrated: true });
    });
  },

  markSeen: () => {
    const iso = new Date().toISOString();
    set({ lastSeenAt: iso });
    SecureStore.setItemAsync(STORAGE_KEY, iso).catch(() => {
      // Best-effort persistence.
    });
  },
}));

export function useUnseenLikesCount(): number {
  const { lastSeenAt, hydrated, hydrate } = useLikesSeenStore();
  const receivedQuery = useReceivedLikes();

  useEffect(() => {
    if (!hydrated) {
      hydrate();
    }
  }, [hydrated, hydrate]);

  if (!hydrated || receivedQuery.isLoading || !receivedQuery.data) {
    return 0;
  }

  if (!lastSeenAt) {
    return receivedQuery.data.length;
  }

  return receivedQuery.data.filter((like) => like.createdAt > lastSeenAt).length;
}

export function useMarkLikesSeen(): () => void {
  return useLikesSeenStore((s) => s.markSeen);
}
