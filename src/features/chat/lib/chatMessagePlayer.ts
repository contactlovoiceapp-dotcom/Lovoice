// True single-instance audio player for chat voice message bubbles.
//
// The original implementation instantiated one `useAudioPlayer` per bubble,
// which meant every voice message in a conversation kept a live native
// AVAudioPlayer polling status every 100 ms. Combined with the FlatList
// remounting bubbles when their optimistic clientId was swapped for the
// server UUID, this caused a steady accumulation of native players and a
// torrent of TurboModule traffic that ended up corrupting the Hermes heap
// during messaging (cf. crash 2026-05-27 in TestFlight 0.8.0).
//
// The new design owns a single native player at module scope: a host hook
// (`useChatMessagePlayerHost`) is mounted once by ConversationScreen and
// publishes the player snapshot into a Zustand store. Each bubble subscribes
// to that store and only re-renders when it is the active bubble OR when its
// active/inactive status flips. Inactive bubbles never touch native code.

import { useCallback, useEffect, useMemo } from 'react';
import {
  useAudioPlayer,
  useAudioPlayerStatus,
  type AudioPlayer,
} from 'expo-audio';
import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';

import { configureAudioSessionForPlayback } from '@/lib/audio';
import { getSupabaseClient } from '@/lib/supabase';

const SIGNED_URL_TTL_SECONDS = 60 * 60;
const SIGNED_URL_REFRESH_BUFFER_MS = 10 * 60 * 1000;
const SIGNED_URL_LIFETIME_MS = SIGNED_URL_TTL_SECONDS * 1000 - SIGNED_URL_REFRESH_BUFFER_MS;

// If the player doesn't start within this delay, consider the file unplayable.
const PLAY_TIMEOUT_MS = 8_000;
// If didJustFinish fires within this window after confirmed playback, it's
// likely a broken / expired signed URL — retry once with cache-bust.
const SUSPICIOUS_FINISH_MS = 400;

interface SignedUrlEntry {
  url: string;
  fetchedAt: number;
}

const signedUrlCache = new Map<string, SignedUrlEntry>();

function invalidateCachedUrl(path: string): void {
  signedUrlCache.delete(path);
}

async function ensureSignedUrl(path: string): Promise<string> {
  const now = Date.now();
  const cached = signedUrlCache.get(path);
  if (cached && now - cached.fetchedAt < SIGNED_URL_LIFETIME_MS) {
    return cached.url;
  }

  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('chat_player.supabase_unavailable');

  const { data, error } = await supabase.storage
    .from('messages')
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);

  if (error || !data?.signedUrl) {
    throw new Error('chat_player.signed_url_failed');
  }

  signedUrlCache.set(path, { url: data.signedUrl, fetchedAt: now });
  return data.signedUrl;
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ChatMessagePlayerSnapshot {
  isPlaying: boolean;
  positionMs: number;
  durationMs: number;
  isLoading: boolean;
  error: string | null;
}

export interface ChatMessagePlayerControls {
  play: () => void;
  pause: () => void;
}

const INACTIVE_SNAPSHOT: ChatMessagePlayerSnapshot = {
  isPlaying: false,
  positionMs: 0,
  durationMs: 0,
  isLoading: false,
  error: null,
};

// ---------------------------------------------------------------------------
// Bar heights helper — kept here for backwards-compat with MessageBubble.
// ---------------------------------------------------------------------------

export function generateBarHeights(seedId: string, count: number): number[] {
  let hash = 0;
  for (let i = 0; i < seedId.length; i++) {
    hash = ((hash << 5) - hash + seedId.charCodeAt(i)) | 0;
  }

  const bars: number[] = [];
  for (let i = 0; i < count; i++) {
    hash = ((hash << 13) ^ hash) | 0;
    hash = ((hash >> 7) ^ hash) | 0;
    hash = ((hash << 17) ^ hash) | 0;
    const normalised = (Math.abs(hash) % 1000) / 1000;
    bars.push(0.2 + normalised * 0.8);
  }
  return bars;
}

// ---------------------------------------------------------------------------
// Shared store: published snapshot of the singleton player, scoped to the
// currently-active message (the bubble the user last tapped Play on).
// ---------------------------------------------------------------------------

interface ChatPlayerStoreState {
  activeMessageId: string | null;
  activeSource: string | null;
  activeIsLocal: boolean;
  isPlaying: boolean;
  positionMs: number;
  durationMs: number;
  isLoading: boolean;
  error: string | null;
}

const INITIAL_STORE_STATE: ChatPlayerStoreState = {
  activeMessageId: null,
  activeSource: null,
  activeIsLocal: false,
  isPlaying: false,
  positionMs: 0,
  durationMs: 0,
  isLoading: false,
  error: null,
};

const useChatPlayerStore = create<ChatPlayerStoreState>(() => INITIAL_STORE_STATE);

/** Test-only: reset the singleton store between tests. */
export function __resetChatPlayerStoreForTests(): void {
  useChatPlayerStore.setState(INITIAL_STORE_STATE);
  hostPlayer = null;
  loadToken = 0;
  loadedUrl = null;
  playConfirmedAt = 0;
  retried = false;
  sessionConfigured = false;
  if (playTimeoutId !== null) {
    clearTimeout(playTimeoutId);
    playTimeoutId = null;
  }
  signedUrlCache.clear();
}

// ---------------------------------------------------------------------------
// Module-level player + transient bookkeeping.
//
// The host hook installs/uninstalls `hostPlayer`. All other state is reset on
// uninstall. `loadToken` guards against out-of-order URL resolutions when the
// user spams Play across bubbles faster than the network.
// ---------------------------------------------------------------------------

let hostPlayer: AudioPlayer | null = null;
let loadToken = 0;
let loadedUrl: string | null = null;
let playConfirmedAt = 0;
let retried = false;
let sessionConfigured = false;
let playTimeoutId: ReturnType<typeof setTimeout> | null = null;

function clearPlayTimeout(): void {
  if (playTimeoutId !== null) {
    clearTimeout(playTimeoutId);
    playTimeoutId = null;
  }
}

function safeNativeCall(fn: () => void): void {
  try {
    fn();
  } catch {
    // expo-audio can throw NativeSharedObjectNotFoundException during transient
    // re-mount states; safe to ignore — the next render retries.
  }
}

async function startPlayback(args: {
  messageId: string;
  source: string;
  isLocalFile: boolean;
  isRetry: boolean;
}): Promise<void> {
  const { messageId, source, isLocalFile, isRetry } = args;
  if (!hostPlayer) return;

  const currentState = useChatPlayerStore.getState();
  const isSwitchingBubble = currentState.activeMessageId !== messageId;

  // Reset retry / URL bookkeeping whenever we either switch bubble OR explicitly
  // retry; a fresh play attempt on the same bubble (e.g. after pause) keeps
  // loadedUrl so we avoid a redundant replace() of the same signed URL.
  if (isSwitchingBubble || isRetry) {
    retried = isRetry ? true : false;
    if (isSwitchingBubble) {
      loadedUrl = null;
    }
    playConfirmedAt = 0;
  }

  // Always restart at 0 visually so the progress bar doesn't briefly flash the
  // previous track's terminal position while the native source swap commits.
  useChatPlayerStore.setState({
    activeMessageId: messageId,
    activeSource: source,
    activeIsLocal: isLocalFile,
    isLoading: true,
    error: null,
    isPlaying: false,
    positionMs: 0,
    durationMs: 0,
  });

  if (!sessionConfigured) {
    try {
      await configureAudioSessionForPlayback();
      sessionConfigured = true;
    } catch {
      // Continue anyway — playback will likely fail, the timeout will surface.
    }
  }

  const token = ++loadToken;

  let url: string;
  try {
    if (isLocalFile) {
      url = source;
    } else {
      if (isRetry) invalidateCachedUrl(source);
      url = await ensureSignedUrl(source);
    }
  } catch (err) {
    if (loadToken !== token) return;
    useChatPlayerStore.setState({
      isLoading: false,
      error: err instanceof Error ? err.message : 'play_failed',
    });
    return;
  }

  if (loadToken !== token || !hostPlayer) return;

  if (isRetry || loadedUrl !== url) {
    try {
      hostPlayer.replace(url);
      loadedUrl = url;
    } catch {
      useChatPlayerStore.setState({ isLoading: false, error: 'play_failed' });
      return;
    }
  }

  playConfirmedAt = 0;
  safeNativeCall(() => hostPlayer?.seekTo(0));
  safeNativeCall(() => hostPlayer?.play());

  clearPlayTimeout();
  playTimeoutId = setTimeout(() => {
    if (loadToken !== token) return;
    const stateNow = useChatPlayerStore.getState();
    if (stateNow.activeMessageId !== messageId || !stateNow.isLoading) return;
    // Keep activeMessageId set so the bubble's snapshot can surface the error
    // (the selector returns INACTIVE_SNAPSHOT — with no error — when active
    // does not match).
    useChatPlayerStore.setState({
      isLoading: false,
      isPlaying: false,
      positionMs: 0,
      durationMs: 0,
      error: 'play_timeout',
    });
  }, PLAY_TIMEOUT_MS);
}

function pauseMessage(messageId: string): void {
  const state = useChatPlayerStore.getState();
  if (state.activeMessageId !== messageId || !hostPlayer) return;
  safeNativeCall(() => hostPlayer?.pause());
  clearPlayTimeout();
}

/** Public: pause whatever bubble is currently playing. Called before recording. */
export function pauseAllChatMessages(): void {
  if (!hostPlayer) {
    useChatPlayerStore.setState({ isPlaying: false });
    clearPlayTimeout();
    return;
  }
  safeNativeCall(() => hostPlayer?.pause());
  useChatPlayerStore.setState({ isPlaying: false });
  clearPlayTimeout();
}

// ---------------------------------------------------------------------------
// Host hook — mounted once per ConversationScreen.
// ---------------------------------------------------------------------------

/**
 * Mount once per ConversationScreen. Creates the single AVAudioPlayer the
 * whole screen shares, mirrors its status into the store, and orchestrates
 * the suspicious-finish retry. Returns nothing — bubbles read state via
 * `useChatMessagePlayer`.
 */
export function useChatMessagePlayerHost(): void {
  const player = useAudioPlayer(null, { updateInterval: 100 });
  const status = useAudioPlayerStatus(player);

  // Install/uninstall the player at module scope.
  useEffect(() => {
    hostPlayer = player;
    return () => {
      safeNativeCall(() => player.pause());
      hostPlayer = null;
      clearPlayTimeout();
      loadedUrl = null;
      playConfirmedAt = 0;
      retried = false;
      useChatPlayerStore.setState(INITIAL_STORE_STATE);
    };
  }, [player]);

  // Mirror status into the store. Granular field comparison avoids a setState
  // when the native tick reports the same values.
  const statusPlaying = status.playing ?? false;
  const statusCurrentMs = Math.round((status.currentTime ?? 0) * 1000);
  const statusDurationMs = Math.round((status.duration ?? 0) * 1000);

  useEffect(() => {
    const state = useChatPlayerStore.getState();
    if (!state.activeMessageId) return;

    const patch: Partial<ChatPlayerStoreState> = {};
    if (state.isPlaying !== statusPlaying) patch.isPlaying = statusPlaying;
    if (state.positionMs !== statusCurrentMs) patch.positionMs = statusCurrentMs;
    if (state.durationMs !== statusDurationMs) patch.durationMs = statusDurationMs;

    if (statusPlaying && state.isLoading) {
      patch.isLoading = false;
      patch.error = null;
      playConfirmedAt = Date.now();
      clearPlayTimeout();
    }

    if (Object.keys(patch).length > 0) {
      useChatPlayerStore.setState(patch);
    }
  }, [statusPlaying, statusCurrentMs, statusDurationMs]);

  // End-of-track handler. Retries once on a suspiciously fast finish (broken
  // or expired signed URL), otherwise clears the active bubble.
  const didJustFinish = status.didJustFinish ?? false;
  useEffect(() => {
    if (!didJustFinish) return;
    const state = useChatPlayerStore.getState();
    if (!state.activeMessageId) return;

    clearPlayTimeout();

    const timeSinceConfirmed = playConfirmedAt > 0 ? Date.now() - playConfirmedAt : 0;
    const isSuspicious =
      playConfirmedAt === 0 || timeSinceConfirmed < SUSPICIOUS_FINISH_MS;

    if (isSuspicious && !retried && state.activeSource) {
      retried = true;
      void startPlayback({
        messageId: state.activeMessageId,
        source: state.activeSource,
        isLocalFile: state.activeIsLocal,
        isRetry: true,
      });
      return;
    }

    loadedUrl = null;
    playConfirmedAt = 0;
    retried = false;

    if (isSuspicious) {
      // Keep activeMessageId so the bubble can surface 'play_failed' in its UI;
      // INACTIVE_SNAPSHOT would hide the error otherwise.
      useChatPlayerStore.setState({
        isPlaying: false,
        isLoading: false,
        positionMs: 0,
        durationMs: 0,
        error: 'play_failed',
      });
    } else {
      useChatPlayerStore.setState(INITIAL_STORE_STATE);
    }
  }, [didJustFinish]);
}

// ---------------------------------------------------------------------------
// Per-bubble hook — selective subscription.
// ---------------------------------------------------------------------------

interface UseChatMessagePlayerArgs {
  messageId: string;
  /** Local file URI (optimistic / sending) or Supabase storage path (confirmed). */
  source: string | null;
  /** True when the message is still optimistic and source is a local file URI. */
  isLocalFile: boolean;
}

export function useChatMessagePlayer({
  messageId,
  source,
  isLocalFile,
}: UseChatMessagePlayerArgs): {
  snapshot: ChatMessagePlayerSnapshot;
  controls: ChatMessagePlayerControls;
} {
  // For inactive bubbles the selector returns the stable INACTIVE_SNAPSHOT
  // reference, so the shallow comparison skips re-render entirely.
  const snapshot = useChatPlayerStore(
    useShallow((s): ChatMessagePlayerSnapshot => {
      if (s.activeMessageId !== messageId) return INACTIVE_SNAPSHOT;
      return {
        isPlaying: s.isPlaying,
        positionMs: s.positionMs,
        durationMs: s.durationMs,
        isLoading: s.isLoading,
        error: s.error,
      };
    }),
  );

  const play = useCallback(() => {
    if (!source) return;
    void startPlayback({ messageId, source, isLocalFile, isRetry: false });
  }, [messageId, source, isLocalFile]);

  const pause = useCallback(() => {
    pauseMessage(messageId);
  }, [messageId]);

  // If this bubble unmounts while it owns the player, release ownership so
  // the next bubble can claim it without inheriting stale state.
  useEffect(() => {
    return () => {
      const state = useChatPlayerStore.getState();
      if (state.activeMessageId !== messageId) return;
      if (hostPlayer) safeNativeCall(() => hostPlayer?.pause());
      clearPlayTimeout();
      loadedUrl = null;
      playConfirmedAt = 0;
      retried = false;
      useChatPlayerStore.setState(INITIAL_STORE_STATE);
    };
  }, [messageId]);

  const controls = useMemo<ChatMessagePlayerControls>(
    () => ({ play, pause }),
    [play, pause],
  );

  return { snapshot, controls };
}
