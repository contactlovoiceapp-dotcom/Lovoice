// Single-instance audio player for the Discover feed. Loads the current voice via
// player.replace(signedUrl) on every active-card change and prefetches signed URLs for
// the next two upcoming cards so the swap is near-instant. One player = one lifecycle
// to orchestrate, which eliminates the cross-instance race conditions that plagued the
// previous 3-instance ring-buffer implementation (cf. ARCHITECTURE.md §4.4).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';

import { configureAudioSessionForPlayback } from '@/lib/audio';
import { getSupabaseClient } from '@/lib/supabase';
import type { FeedItem } from '@/features/feed/types';

// Signed URLs from Supabase Storage last 1 hour. Refresh 10 minutes early so a
// slow listener never hits a stale URL mid-listen.
const SIGNED_URL_TTL_SECONDS = 60 * 60;
const SIGNED_URL_REFRESH_BUFFER_MS = 10 * 60 * 1000;
const SIGNED_URL_LIFETIME_MS = SIGNED_URL_TTL_SECONDS * 1000 - SIGNED_URL_REFRESH_BUFFER_MS;

const SIGNED_URL_ERROR_CODE = 'feed_player.signed_url_failed';

interface SignedUrlEntry {
  url: string;
  fetchedAt: number;
}

// Module-scoped cache so a voice re-surfaced after a `reset_feed_seen` reuses its URL,
// and so prefetched URLs are picked up instantly when the user swipes to them.
const signedUrlCache = new Map<string, SignedUrlEntry>();

/** Test-only: clear the module-scoped cache between tests. NEVER call in production. */
export function __resetSignedUrlCacheForTests(): void {
  signedUrlCache.clear();
}

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

export interface FeedPlayerSnapshot {
  /** True while the current voice is playing. */
  isPlaying: boolean;
  /** Current playback position in milliseconds. 0 if nothing loaded. */
  positionMs: number;
  /** Total duration in milliseconds. 0 until the player reports it. */
  durationMs: number;
  /**
   * True while the signed URL is being fetched / the player source is being swapped.
   * The UI must disable the play button while this is true — calling play() before
   * the source is ready is a no-op and would feel like a broken button.
   * Note: this does NOT include expo-audio's internal isBuffering state, which
   * remains true after replace() until play() is called. Including it would create
   * a deadlock where the button stays disabled forever.
   */
  isLoading: boolean;
  /** A stable error code (e.g. 'feed_player.signed_url_failed') or null. */
  error: string | null;
}

export interface FeedPlayerControls {
  play: () => void;
  pause: () => void;
  /** Pause + reset position to 0. Call on tab switch / screen blur. */
  stop: () => void;
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
  const player = useAudioPlayer(null, { updateInterval: 100 });
  const status = useAudioPlayerStatus(player);

  const sessionConfiguredRef = useRef(false);
  // Tracks which voiceId the player currently holds. Null while idle or mid-swap.
  const loadedVoiceIdRef = useRef<string | null>(null);
  // Incremented on every load attempt. Only the latest token's resolution is applied;
  // older resolutions are discarded to handle rapid swiping faster than the network.
  const loadTokenRef = useRef(0);
  const finishedHandledRef = useRef(false);
  const prevDidJustFinishRef = useRef(false);

  const [isLoadingSource, setIsLoadingSource] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentItem =
    currentIndex >= 0 && currentIndex < items.length ? items[currentIndex] : null;
  const nextItem =
    currentIndex + 1 < items.length ? items[currentIndex + 1] : null;
  const nextNextItem =
    currentIndex + 2 < items.length ? items[currentIndex + 2] : null;

  const currentVoiceId = currentItem?.voiceId ?? null;
  const currentPath = currentItem?.storagePath ?? null;
  const nextPath = nextItem?.storagePath ?? null;
  const nextNextPath = nextNextItem?.storagePath ?? null;

  // Configure the audio session once on mount.
  useEffect(() => {
    if (sessionConfiguredRef.current) return;
    sessionConfiguredRef.current = true;
    configureAudioSessionForPlayback().catch((err: unknown) => {
      sessionConfiguredRef.current = false;
      console.error(err);
    });
  }, []);

  // Source-loading effect. Runs whenever the current voice changes (swipe up/down).
  // Pauses immediately for instant audio cutoff, then fetches the signed URL and
  // calls replace(). The load token guards against out-of-order resolution.
  useEffect(() => {
    if (!currentVoiceId || !currentPath) {
      try {
        player.pause();
      } catch {
        // Native player recycled — safe to ignore.
      }
      loadedVoiceIdRef.current = null;
      setError(null);
      return;
    }

    if (loadedVoiceIdRef.current === currentVoiceId) {
      return;
    }

    try {
      player.pause();
    } catch {
      // Native player recycled — safe to ignore.
    }

    const token = ++loadTokenRef.current;
    setIsLoadingSource(true);
    setError(null);

    ensureSignedUrl(currentPath)
      .then((url) => {
        if (loadTokenRef.current !== token) return;
        try {
          player.replace(url);
          loadedVoiceIdRef.current = currentVoiceId;
        } catch {
          // expo-audio mid-recycle; ref stays stale so the next render retries.
        }
        setIsLoadingSource(false);
      })
      .catch((err: unknown) => {
        if (loadTokenRef.current !== token) return;
        console.error(err);
        setIsLoadingSource(false);
        setError(SIGNED_URL_ERROR_CODE);
      });
  }, [currentVoiceId, currentPath, player]);

  // Prefetch signed URLs for the next two cards. Fire-and-forget: the cache is
  // picked up by ensureSignedUrl() in the load effect above when the user swipes.
  useEffect(() => {
    if (nextPath) {
      ensureSignedUrl(nextPath).catch(() => undefined);
    }
    if (nextNextPath) {
      ensureSignedUrl(nextNextPath).catch(() => undefined);
    }
  }, [nextPath, nextNextPath]);

  // Reset end-of-track tracking when the current item changes.
  useEffect(() => {
    finishedHandledRef.current = false;
    prevDidJustFinishRef.current = false;
  }, [currentVoiceId]);

  // Edge-detect didJustFinish to fire onCurrentEnded exactly once per playthrough.
  const currentDidJustFinish = status.didJustFinish ?? false;

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

  // Pause on unmount.
  useEffect(() => {
    return () => {
      try {
        player.pause();
      } catch {
        // Native object already released — nothing to do.
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const play = useCallback(() => {
    if (isLoadingSource || loadedVoiceIdRef.current === null) {
      return;
    }

    finishedHandledRef.current = false;
    prevDidJustFinishRef.current = false;

    // After didJustFinish expo-audio leaves the playhead at the end; play() alone
    // is a no-op. Seek back to 0 so a replay actually restarts the track.
    if (
      status.didJustFinish ||
      (status.duration > 0 && (status.currentTime ?? 0) >= status.duration - 0.5)
    ) {
      try {
        player.seekTo(0);
      } catch {
        // Native player in a transient state — next tap will retry.
      }
    }

    player.play();
  }, [player, status, isLoadingSource]);

  const pause = useCallback(() => {
    try {
      player.pause();
    } catch {
      // Native player recycled — safe to ignore.
    }
  }, [player]);

  const stop = useCallback(() => {
    try {
      player.pause();
      player.seekTo(0);
    } catch {
      // Native player recycled — safe to ignore.
    }
  }, [player]);

  const snapshot = useMemo<FeedPlayerSnapshot>(() => {
    if (!currentVoiceId) return EMPTY_SNAPSHOT;
    return {
      isPlaying: status.playing ?? false,
      positionMs: Math.round((status.currentTime ?? 0) * 1000),
      durationMs: Math.round((status.duration ?? 0) * 1000),
      isLoading: isLoadingSource,
      error,
    };
  }, [currentVoiceId, status, isLoadingSource, error]);

  const controls = useMemo<FeedPlayerControls>(() => ({ play, pause, stop }), [play, pause, stop]);

  return { snapshot, controls };
}
