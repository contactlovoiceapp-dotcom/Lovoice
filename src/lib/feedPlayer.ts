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

// Verbose tracing for the autoplay rollout. Filter with `[feedPlayer]` in Metro.
// Compiled out of production builds via __DEV__. Remove after the feature is stable.
function dbg(label: string, payload?: Record<string, unknown>): void {
  if (!__DEV__) return;
  if (payload) {
    console.log(`[feedPlayer] ${label}`, payload);
  } else {
    console.log(`[feedPlayer] ${label}`);
  }
}

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
  /**
   * Continuous "the current voice should be playing right now" flag.
   * When true, the hook actively starts playback as soon as the source for the
   * current voice is loaded. This covers three product behaviours with a single
   * mechanism: toggle-on starts the current track, end-of-track + scroll starts
   * the next, and manual-swipe-while-on starts the swiped-to track. Turning it
   * off does NOT pause the player — current playback continues naturally; only
   * the auto-start mechanism is disarmed. Consumers that want a tap on a UI
   * control to disable autoplay must wrap controls to also reset this flag.
   */
  autoplayNext?: boolean;
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
  autoplayNext = false,
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

  // True while the snapshot must not expose raw expo-audio values. Covers the
  // full stale window: URL fetch + native source swap (player.replace() is sync
  // in JS but async native-side — expo-audio keeps reporting the previous
  // track's terminal state until the new source is committed). Prevents stale
  // positionMs/durationMs from a prior voice leaking into the ProfileCard,
  // which would briefly flash the RotateCcw (replay) icon on an unheard voice.
  const [isPlayerStale, setIsPlayerStale] = useState(true);

  // Mirror status into a ref so startPlayback can read end-of-track flags without
  // making the callback identity unstable (status updates every 100 ms).
  const statusRef = useRef(status);
  statusRef.current = status;

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
      dbg('source-load: already holds', { voiceId: currentVoiceId });
      return;
    }

    dbg('source-load: start', { voiceId: currentVoiceId, path: currentPath });

    try {
      player.pause();
    } catch {
      // Native player recycled — safe to ignore.
    }

    const token = ++loadTokenRef.current;
    setIsLoadingSource(true);
    setIsPlayerStale(true);
    setError(null);

    ensureSignedUrl(currentPath)
      .then((url) => {
        if (loadTokenRef.current !== token) {
          dbg('source-load: stale token discarded', { voiceId: currentVoiceId });
          return;
        }
        try {
          player.replace(url);
          loadedVoiceIdRef.current = currentVoiceId;
          dbg('source-load: replaced', { voiceId: currentVoiceId });
        } catch (err) {
          // expo-audio mid-recycle; ref stays stale so the next render retries.
          dbg('source-load: replace threw', { error: String(err) });
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

  // Refs that give the didJustFinish effect access to the latest values without
  // putting them in its dependency array. That coupling caused a premature re-fire
  // during the brief window after a card change where expo-audio still reports
  // didJustFinish=true (player.replace() hasn't been called yet for the new voice).
  // The effect must only re-run when the expo-audio status itself changes.
  const currentVoiceIdRef = useRef(currentVoiceId);
  currentVoiceIdRef.current = currentVoiceId;
  const onCurrentEndedRef = useRef(onCurrentEnded);
  onCurrentEndedRef.current = onCurrentEnded;

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
    const voiceId = currentVoiceIdRef.current;
    if (voiceId) {
      dbg('end-of-track: firing onCurrentEnded', { voiceId });
      onCurrentEndedRef.current?.(voiceId);
    }
    // deps intentionally limited to currentDidJustFinish only — see comment above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDidJustFinish]);

  // Shared playback starter used by both controls.play (user tap) and the
  // autoplay effect. Single source of truth for "what does play actually do":
  // re-arm the didJustFinish edge detector, seek to 0 if the playhead is at end
  // (replay scenario), then call player.play(). All native calls are wrapped
  // because expo-audio can throw NativeSharedObjectNotFoundException during
  // transient re-mount states.
  const startPlayback = useCallback(() => {
    finishedHandledRef.current = false;
    prevDidJustFinishRef.current = false;

    const s = statusRef.current;
    const atEnd =
      s.didJustFinish ||
      (s.duration > 0 && (s.currentTime ?? 0) >= s.duration - 0.5);

    dbg('startPlayback', {
      atEnd,
      didJustFinish: s.didJustFinish,
      currentTime: s.currentTime,
      duration: s.duration,
      playing: s.playing,
    });

    if (atEnd) {
      try {
        player.seekTo(0);
      } catch {
        // Native player in a transient state — next call will retry.
      }
    }

    try {
      player.play();
    } catch (err) {
      dbg('startPlayback: play() threw', { error: String(err) });
    }

    // Eagerly clear the stale window so snapshot.isPlaying reflects status.playing
    // as soon as expo-audio confirms the player is running. This covers both user-
    // initiated play AND autoplay. Without this, the stale window can stay locked
    // when didJustFinish is stuck-true after a natural track finish followed by a
    // feed reset: expo-audio never emits a status update while the player is paused,
    // so currentDidJustFinish stays true and the normal stale-window clearing path
    // (which gates on !currentDidJustFinish) is permanently blocked.
    setIsPlayerStale(false);
  }, [player]);

  // Continuous-condition autoplay. Fires player.play() whenever ALL of these hold:
  //   1. autoplayNext is true (the toggle is on)
  //   2. our async URL fetch is done (isLoadingSource is false)
  //   3. there is a current voice
  //   4. the player holds that voice's source (loadedVoiceIdRef === currentVoiceId)
  //   5. expo-audio's status.didJustFinish has flipped back to false
  //
  // (5) is the critical native-side signal. player.replace(url) returns
  // synchronously in JS but the native player loads the new source asynchronously.
  // During that brief window status keeps reporting the previous track's terminal
  // state (didJustFinish=true, currentTime≈duration). Calling play() in that
  // window is silently swallowed by expo-audio because the new source isn't
  // committed yet. Once the native side commits the replace, status flips
  // didJustFinish back to false — at that point play() actually starts the
  // track. The same gate is harmless for the "toggle autoplay on a paused voice"
  // case because didJustFinish is already false for a paused-mid-track player.
  useEffect(() => {
    if (!autoplayNext) {
      dbg('autoplay: skip (disabled)');
      return;
    }
    if (isLoadingSource) {
      dbg('autoplay: skip (URL loading)', { currentVoiceId });
      return;
    }
    if (!currentVoiceId) {
      dbg('autoplay: skip (no current voice)');
      return;
    }
    if (loadedVoiceIdRef.current !== currentVoiceId) {
      dbg('autoplay: skip (player holds stale source)', {
        loaded: loadedVoiceIdRef.current,
        current: currentVoiceId,
      });
      return;
    }
    if (currentDidJustFinish) {
      dbg('autoplay: skip (native replace not yet committed — didJustFinish stale)', {
        currentVoiceId,
      });
      return;
    }
    // Don't replay a voice that has already ended and whose ending was dispatched
    // via onCurrentEnded. When the user enables autoplay while the replay icon is
    // showing, the consumer is expected to advance the index — replaying the
    // current card from the start would be jarring.
    const s = statusRef.current;
    const isAtEnd =
      s.didJustFinish || (s.duration > 0 && (s.currentTime ?? 0) >= s.duration - 0.5);
    if (isAtEnd && finishedHandledRef.current) {
      dbg('autoplay: skip (voice already ended, onCurrentEnded was dispatched)', {
        currentVoiceId,
      });
      return;
    }
    dbg('autoplay: firing', { currentVoiceId });
    startPlayback();
  }, [autoplayNext, isLoadingSource, currentVoiceId, currentDidJustFinish, startPlayback]);

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
    startPlayback();
  }, [isLoadingSource, startPlayback]);

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

  // Detect when the native player has committed the new source. The stale
  // window ends when: (a) the async URL fetch is done, (b) replace() was
  // called for the current voice, and (c) expo-audio's didJustFinish has
  // cleared — the native source swap is complete and status reflects the new
  // track. This effect intentionally reads loadedVoiceIdRef (set synchronously
  // in the .then of the load effect) because the ref is always up-to-date by
  // the time isLoadingSource flips to false in the same microtask.
  useEffect(() => {
    if (
      !isLoadingSource &&
      currentVoiceId !== null &&
      loadedVoiceIdRef.current === currentVoiceId &&
      !currentDidJustFinish
    ) {
      dbg('stale-window: cleared', { currentVoiceId });
      setIsPlayerStale(false);
    }
  }, [isLoadingSource, currentVoiceId, currentDidJustFinish]);

  // Depend on individual primitive fields rather than the `status` object so
  // the memo reacts to value changes even when the object reference is stable
  // (true in tests, and avoids gratuitous recomputation in production where
  // expo-audio allocates a new status every 100 ms update tick).
  const statusPlaying = status.playing ?? false;
  const statusCurrentTime = status.currentTime ?? 0;
  const statusDuration = status.duration ?? 0;

  const snapshot = useMemo<FeedPlayerSnapshot>(() => {
    if (!currentVoiceId) return EMPTY_SNAPSHOT;
    // Two complementary guards, each covering a different part of the stale window:
    //  · loadedVoiceIdRef — synchronous, catches the very first render where
    //    currentVoiceId changed but the load effect hasn't run yet (effect lag).
    //  · isPlayerStale   — state-based, catches the post-replace() window where
    //    the ref already matches but expo-audio still reports the prior track's
    //    terminal status (native source commit is async).
    if (isPlayerStale || loadedVoiceIdRef.current !== currentVoiceId) {
      return {
        isPlaying: false,
        positionMs: 0,
        durationMs: 0,
        isLoading: isLoadingSource,
        error,
      };
    }
    return {
      isPlaying: statusPlaying,
      positionMs: Math.round(statusCurrentTime * 1000),
      durationMs: Math.round(statusDuration * 1000),
      isLoading: isLoadingSource,
      error,
    };
  }, [currentVoiceId, isPlayerStale, statusPlaying, statusCurrentTime, statusDuration, isLoadingSource, error]);

  const controls = useMemo<FeedPlayerControls>(() => ({ play, pause, stop }), [play, pause, stop]);

  return { snapshot, controls };
}
