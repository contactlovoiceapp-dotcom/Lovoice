// 3-instance ring-buffer audio player for the Discover feed: keeps the current voice playing while preloading the next two via signed URLs.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';

import { configureAudioSessionForPlayback } from '@/lib/audio';
import { getSupabaseClient } from '@/lib/supabase';
import type { FeedItem } from '@/features/feed/types';

// Signed URLs from supabase storage last 1 hour. Refresh 10 minutes early so a
// slow listener never hits a stale URL mid-listen.
const SIGNED_URL_TTL_SECONDS = 60 * 60;
const SIGNED_URL_REFRESH_BUFFER_MS = 10 * 60 * 1000;
const SIGNED_URL_LIFETIME_MS = SIGNED_URL_TTL_SECONDS * 1000 - SIGNED_URL_REFRESH_BUFFER_MS;

const SIGNED_URL_ERROR_CODE = 'feed_player.signed_url_failed';

interface SignedUrlEntry {
  url: string;
  fetchedAt: number;
}

// Module-scoped cache so a voice re-surfaced after a `reset_feed_seen` reuses its URL.
const signedUrlCache = new Map<string, SignedUrlEntry>();

async function ensureSignedUrl(path: string): Promise<string> {
  const now = Date.now();
  const cached = signedUrlCache.get(path);
  if (cached && now - cached.fetchedAt < SIGNED_URL_LIFETIME_MS) {
    return cached.url;
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error(SIGNED_URL_ERROR_CODE);
  }

  const { data, error } = await supabase.storage
    .from('voices')
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);

  if (error || !data?.signedUrl) {
    throw new Error(SIGNED_URL_ERROR_CODE);
  }

  signedUrlCache.set(path, { url: data.signedUrl, fetchedAt: now });
  return data.signedUrl;
}

export interface RingSlotAssignment {
  /** Slot index 0/1/2 holding this item. */
  slot: 0 | 1 | 2;
  /** Index in the items array. */
  itemIndex: number;
}

export interface RingSlots {
  current: RingSlotAssignment | null;
  next: RingSlotAssignment | null;
  nextNext: RingSlotAssignment | null;
}

/**
 * Pure: maps the current viewport index to the three ring slots.
 * Slot mapping is `itemIndex % 3` so back-scroll re-loads the previous URI on the slot
 * that previously held it — the trade-off accepted in ARCHITECTURE.md §4.4.
 */
export function computeRingSlots(currentIndex: number, total: number): RingSlots {
  if (total <= 0 || currentIndex < 0 || currentIndex >= total) {
    return { current: null, next: null, nextNext: null };
  }
  const build = (idx: number): RingSlotAssignment | null =>
    idx < total ? { slot: (idx % 3) as 0 | 1 | 2, itemIndex: idx } : null;
  return {
    current: build(currentIndex),
    next: build(currentIndex + 1),
    nextNext: build(currentIndex + 2),
  };
}

export interface FeedPlayerSnapshot {
  /** True while the slot holding the current item is playing. */
  isPlaying: boolean;
  /** Current playback position in milliseconds. 0 if no item is loaded. */
  positionMs: number;
  /** Total duration in milliseconds. 0 until the player reports it. */
  durationMs: number;
  /** True while the signed URL is being fetched OR the buffer is loading. */
  isLoading: boolean;
  /** A stable error code (e.g. 'feed_player.signed_url_failed') or null. */
  error: string | null;
}

export interface FeedPlayerControls {
  play: () => void;
  pause: () => void;
}

export interface UseFeedPlayerArgs {
  items: FeedItem[];
  /** Index of the item currently in the viewport. */
  currentIndex: number;
  /**
   * Fires once when the current track reaches the natural end (didJustFinish).
   * Receives the FeedItem.voiceId of the item that ended.
   */
  onCurrentEnded?: (voiceId: string) => void;
}

export interface UseFeedPlayerResult {
  snapshot: FeedPlayerSnapshot;
  controls: FeedPlayerControls;
}

const EMPTY_SNAPSHOT: FeedPlayerSnapshot = {
  isPlaying: false,
  positionMs: 0,
  durationMs: 0,
  isLoading: false,
  error: null,
};

export function useFeedPlayer({
  items,
  currentIndex,
  onCurrentEnded,
}: UseFeedPlayerArgs): UseFeedPlayerResult {
  // Three players are hooked unconditionally — React hooks rules require stable call order.
  // useAudioPlayer accepts a null source; player.replace(null) is the call that throws on 0.5.
  const player0 = useAudioPlayer(null, { updateInterval: 100 });
  const player1 = useAudioPlayer(null, { updateInterval: 100 });
  const player2 = useAudioPlayer(null, { updateInterval: 100 });

  const status0 = useAudioPlayerStatus(player0);
  const status1 = useAudioPlayerStatus(player1);
  const status2 = useAudioPlayerStatus(player2);

  // Memoised tuples keep array identity stable across renders so downstream useMemo deps don't churn.
  const players = useMemo(() => [player0, player1, player2] as const, [player0, player1, player2]);
  const statuses = useMemo(() => [status0, status1, status2] as const, [status0, status1, status2]);

  const sessionConfiguredRef = useRef(false);
  // Tracks which voiceId each native slot currently holds; null means "unloaded".
  const slotVoiceIdRef = useRef<(string | null)[]>([null, null, null]);
  // Prevents onCurrentEnded from firing more than once per playthrough.
  const finishedHandledRef = useRef(false);
  // Edge detector for `didJustFinish` transitioning false → true.
  const prevDidJustFinishRef = useRef(false);

  const [slotLoading, setSlotLoading] = useState<boolean[]>([false, false, false]);
  const [error, setError] = useState<string | null>(null);

  const slots = useMemo(
    () => computeRingSlots(currentIndex, items.length),
    [currentIndex, items.length],
  );
  const currentSlot = slots.current?.slot ?? null;

  // Configure the audio session once on mount; the session stays alive across slot rotations.
  useEffect(() => {
    if (sessionConfiguredRef.current) return;
    sessionConfiguredRef.current = true;
    configureAudioSessionForPlayback().catch((err: unknown) => {
      sessionConfiguredRef.current = false;
      console.error(err);
    });
  }, []);

  // Derive the three target voice IDs + storage paths so the load effect only re-runs
  // when the slot contents actually change (not on every render of the parent).
  const currentItem = slots.current ? items[slots.current.itemIndex] ?? null : null;
  const nextItem = slots.next ? items[slots.next.itemIndex] ?? null : null;
  const nextNextItem = slots.nextNext ? items[slots.nextNext.itemIndex] ?? null : null;

  const currentVoiceId = currentItem?.voiceId ?? null;
  const nextVoiceId = nextItem?.voiceId ?? null;
  const nextNextVoiceId = nextNextItem?.voiceId ?? null;

  const currentPath = currentItem?.storagePath ?? null;
  const nextPath = nextItem?.storagePath ?? null;
  const nextNextPath = nextNextItem?.storagePath ?? null;

  const currentSlotIdx = slots.current?.slot ?? null;
  const nextSlotIdx = slots.next?.slot ?? null;
  const nextNextSlotIdx = slots.nextNext?.slot ?? null;

  useEffect(() => {
    let cancelled = false;

    type Target = { voiceId: string; storagePath: string } | null;
    const targets: Target[] = [null, null, null];
    if (currentSlotIdx !== null && currentVoiceId && currentPath) {
      targets[currentSlotIdx] = { voiceId: currentVoiceId, storagePath: currentPath };
    }
    if (nextSlotIdx !== null && nextVoiceId && nextPath) {
      targets[nextSlotIdx] = { voiceId: nextVoiceId, storagePath: nextPath };
    }
    if (nextNextSlotIdx !== null && nextNextVoiceId && nextNextPath) {
      targets[nextNextSlotIdx] = { voiceId: nextNextVoiceId, storagePath: nextNextPath };
    }

    for (let slot = 0; slot < 3; slot++) {
      const target = targets[slot];
      const holding = slotVoiceIdRef.current[slot];

      if (target && target.voiceId === holding) {
        // Already correct. Keep non-current slots paused defensively even if expo-audio's
        // replace() didn't auto-play — interruptions or system resume can re-start them.
        if (slot !== currentSlotIdx) {
          try {
            players[slot].pause();
          } catch {
            // Native player recycled between renders — safe to ignore.
          }
        }
        continue;
      }

      if (!target) {
        // expo-audio 0.5 rejects replace(null), so we pause and clear the bookkeeping ref
        // instead. The next non-null replace() will reuse the same native player.
        try {
          players[slot].pause();
        } catch {
          // Native player recycled — safe to ignore.
        }
        slotVoiceIdRef.current[slot] = null;
        continue;
      }

      const newVoiceId = target.voiceId;
      setSlotLoading((prev) => prev.map((v, i) => (i === slot ? true : v)));

      ensureSignedUrl(target.storagePath)
        .then((url) => {
          if (cancelled) return;
          try {
            players[slot].pause();
            players[slot].replace(url);
          } catch {
            // expo-audio mid-recycle; the next render will retry via the ref mismatch.
          }
          slotVoiceIdRef.current[slot] = newVoiceId;
          setSlotLoading((prev) => prev.map((v, i) => (i === slot ? false : v)));
          if (slot === currentSlotIdx) {
            setError(null);
          }
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          console.error(err);
          setSlotLoading((prev) => prev.map((v, i) => (i === slot ? false : v)));
          if (slot === currentSlotIdx) {
            setError(SIGNED_URL_ERROR_CODE);
          }
        });
    }

    return () => {
      cancelled = true;
    };
  }, [
    currentSlotIdx,
    nextSlotIdx,
    nextNextSlotIdx,
    currentVoiceId,
    nextVoiceId,
    nextNextVoiceId,
    currentPath,
    nextPath,
    nextNextPath,
    players,
  ]);

  // Reset the end-of-track tracking when the current item changes (or unmounts).
  useEffect(() => {
    finishedHandledRef.current = false;
    prevDidJustFinishRef.current = false;
  }, [currentVoiceId]);

  // Edge-detect didJustFinish on the current slot. We re-arm only when play() is called again
  // or when the current item changes — preventing the natural end from re-firing on every render.
  const currentDidJustFinish =
    currentSlot !== null ? statuses[currentSlot].didJustFinish ?? false : false;

  useEffect(() => {
    if (!currentDidJustFinish) {
      prevDidJustFinishRef.current = false;
      return;
    }
    if (prevDidJustFinishRef.current || finishedHandledRef.current) {
      prevDidJustFinishRef.current = true;
      return;
    }
    prevDidJustFinishRef.current = true;
    finishedHandledRef.current = true;
    if (currentVoiceId) {
      onCurrentEnded?.(currentVoiceId);
    }
  }, [currentDidJustFinish, currentVoiceId, onCurrentEnded]);

  // Pause every slot on unmount. Swallow errors because expo-audio may have already
  // released the native wrapper before our cleanup runs (same pattern as useVoicePlayer).
  useEffect(() => {
    return () => {
      for (let i = 0; i < 3; i++) {
        try {
          players[i].pause();
        } catch {
          // Native object already released — nothing to do.
        }
      }
    };
    // Cleanup must run only on unmount, not whenever expo-audio recycles a player.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const play = useCallback(() => {
    if (currentSlot === null) return;
    // Defensive: pause the other two slots so a stale background play() never doubles up.
    for (let i = 0; i < 3; i++) {
      if (i !== currentSlot) {
        try {
          players[i].pause();
        } catch {
          // Native player recycled — safe to ignore.
        }
      }
    }
    // Re-arm the finish detector so a replay (RotateCcw) can also fire onCurrentEnded.
    finishedHandledRef.current = false;
    prevDidJustFinishRef.current = false;
    // After didJustFinish, expo-audio leaves the playhead at the end — play() alone is a
    // no-op. Seek back to 0 so the replay button actually restarts the track.
    const st = statuses[currentSlot];
    if (st.didJustFinish || (st.duration > 0 && (st.currentTime ?? 0) >= st.duration - 0.5)) {
      try {
        players[currentSlot].seekTo(0);
      } catch {
        // Swallow: if seekTo throws (e.g. native player recycled) the subsequent play()
        // will silently fail and the user can tap again.
      }
    }
    players[currentSlot].play();
  }, [currentSlot, players, statuses]);

  const pause = useCallback(() => {
    if (currentSlot === null) return;
    try {
      players[currentSlot].pause();
    } catch {
      // Native player recycled — safe to ignore.
    }
  }, [currentSlot, players]);

  const snapshot = useMemo<FeedPlayerSnapshot>(() => {
    if (currentSlot === null) return EMPTY_SNAPSHOT;
    const status = statuses[currentSlot];
    return {
      isPlaying: status.playing ?? false,
      positionMs: Math.round((status.currentTime ?? 0) * 1000),
      durationMs: Math.round((status.duration ?? 0) * 1000),
      isLoading: slotLoading[currentSlot] || (status.isBuffering ?? false),
      error,
    };
  }, [currentSlot, statuses, slotLoading, error]);

  const controls = useMemo<FeedPlayerControls>(() => ({ play, pause }), [play, pause]);

  return { snapshot, controls };
}
