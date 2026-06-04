/* Tracks the last time the user opened the Likes tab to compute unseen received likes count.
   Persists locally via expo-secure-store (instant, survives restarts) AND mirrors the
   timestamp to profiles.likes_seen_at so the server can compute the same unseen-likes
   total for the OS push badge while the app is backgrounded/killed. */

import { useEffect } from 'react';
import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

import { getSupabaseClient } from '@/lib/supabase';
import { useReceivedLikes } from '../api/likeQueries';

const STORAGE_KEY = 'likes_last_seen_at';

// Best-effort mirror of the local "likes seen" marker to the server. Failures are
// swallowed: the local marker already cleared the in-app badge, and the next focus
// will retry. Uses the cached session (getSession, no network) to resolve the uid.
async function persistLikesSeenToServer(iso: string): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) return;
  const { data } = await supabase.auth.getSession();
  const uid = data.session?.user.id;
  if (!uid) return;
  await supabase.from('profiles').update({ likes_seen_at: iso }).eq('id', uid);
}

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
      // Best-effort local persistence.
    });
    persistLikesSeenToServer(iso).catch(() => {
      // Best-effort server mirror for the OS badge; retried on next focus.
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
